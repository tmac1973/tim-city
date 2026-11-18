import { carries, isBridge, type Network, TileKind } from '@/shared/tiles';

/** The tile grid agents read; the CityMirror satisfies it. */
export interface Grid {
  readonly size: number;
  readonly tiles: Uint16Array;
}

/** 0 north, 1 east, 2 south, 3 west; x grows east and y (world z) south. */
export type Dir = 0 | 1 | 2 | 3;
export const DX = [0, 1, 0, -1] as const;
export const DY = [-1, 0, 1, 0] as const;
export const reverse = (d: Dir): Dir => ((d + 2) % 4) as Dir;

const kindAt = (g: Grid, x: number, y: number): number =>
  x >= 0 && y >= 0 && x < g.size && y < g.size ? (g.tiles[y * g.size + x] ?? 0) : 0;

/** Bit d is set when the tile links to its neighbour in direction d on this network. */
export function links(g: Grid, x: number, y: number, network: Network): number {
  if (!carries(kindAt(g, x, y), network)) return 0;
  let mask = 0;
  for (let d = 0; d < 4; d++) if (carries(kindAt(g, x + DX[d as Dir], y + DY[d as Dir]), network)) mask |= 1 << d;
  return mask;
}

export function linkCount(mask: number): number {
  return (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1) + ((mask >> 3) & 1);
}

/**
 * Where a vehicle that entered a tile heading `heading` may leave: every
 * link except the way it came. At a dead end the only way out is back.
 */
export function exits(g: Grid, x: number, y: number, heading: Dir, network: Network): Dir[] {
  const mask = links(g, x, y, network);
  const back = reverse(heading);
  const out: Dir[] = [];
  for (let d = 0; d < 4; d++) if (mask & (1 << d) && d !== back) out.push(d as Dir);
  return out.length > 0 ? out : [back];
}

/** A point and unit heading on the ground plane. */
export interface Pose2 {
  x: number;
  z: number;
  hx: number;
  hz: number;
}

/**
 * One tile's path for a vehicle entering heading `din` and leaving heading
 * `dout`, offset `lane` to the right of travel (0 for rail). It is a
 * quadratic curve from the entry edge to the exit edge; turns meet where the
 * two lanes cross, and a U-turn swings out ahead of the tile centre.
 */
export class Segment {
  x = 0;
  y = 0;
  din: Dir = 1;
  dout: Dir = 1;
  length = 1;
  private ax = 0;
  private az = 0;
  private cx = 0;
  private cz = 0;
  private bx = 0;
  private bz = 0;

  set(x: number, y: number, din: Dir, dout: Dir, lane: number): this {
    this.x = x;
    this.y = y;
    this.din = din;
    this.dout = dout;
    const mx = x + 0.5;
    const mz = y + 0.5;
    // Right of a heading (dx, dz) is (-dz, dx).
    const rinx = -DY[din] * lane;
    const rinz = DX[din] * lane;
    const routx = -DY[dout] * lane;
    const routz = DX[dout] * lane;
    this.ax = mx - DX[din] * 0.5 + rinx;
    this.az = mz - DY[din] * 0.5 + rinz;
    this.bx = mx + DX[dout] * 0.5 + routx;
    this.bz = mz + DY[dout] * 0.5 + routz;
    if (din === dout) {
      this.cx = (this.ax + this.bx) / 2;
      this.cz = (this.az + this.bz) / 2;
    } else if (dout === reverse(din)) {
      this.cx = mx + DX[din] * 0.35;
      this.cz = mz + DY[din] * 0.35;
    } else {
      this.cx = mx + rinx + routx;
      this.cz = mz + rinz + routz;
    }
    const chord = Math.hypot(this.bx - this.ax, this.bz - this.az);
    const legs = Math.hypot(this.cx - this.ax, this.cz - this.az) + Math.hypot(this.bx - this.cx, this.bz - this.cz);
    this.length = Math.max(0.2, (chord + legs) / 2);
    return this;
  }

  copy(other: Segment): this {
    this.x = other.x;
    this.y = other.y;
    this.din = other.din;
    this.dout = other.dout;
    this.length = other.length;
    this.ax = other.ax;
    this.az = other.az;
    this.cx = other.cx;
    this.cz = other.cz;
    this.bx = other.bx;
    this.bz = other.bz;
    return this;
  }

  /** The same path driven the other way. */
  reversed(lane: number): this {
    return this.set(this.x, this.y, reverse(this.dout), reverse(this.din), lane);
  }

  /** Point and heading at fraction t in [0, 1]. */
  at(t: number, out: Pose2): Pose2 {
    const u = 1 - t;
    out.x = u * u * this.ax + 2 * u * t * this.cx + t * t * this.bx;
    out.z = u * u * this.az + 2 * u * t * this.cz + t * t * this.bz;
    let hx = u * (this.cx - this.ax) + t * (this.bx - this.cx);
    let hz = u * (this.cz - this.az) + t * (this.bz - this.cz);
    const len = Math.hypot(hx, hz);
    if (len > 1e-6) {
      hx /= len;
      hz /= len;
    } else {
      hx = DX[this.dout];
      hz = DY[this.dout];
    }
    out.hx = hx;
    out.hz = hz;
    return out;
  }

  get turning(): boolean {
    return this.din !== this.dout;
  }
}

/**
 * Breadth-first route over a network from tile (sx, sy) to the nearest tile
 * passing `goal`. Returns the tiles in order (start first), or null.
 */
export function route(
  g: Grid,
  sx: number,
  sy: number,
  goal: (x: number, y: number) => boolean,
  network: Network,
  maxTiles = 4000,
): [number, number][] | null {
  const n = g.size;
  const prev = new Int32Array(n * n).fill(-1);
  const start = sy * n + sx;
  prev[start] = start;
  const queue = [start];
  for (let head = 0; head < queue.length && head < maxTiles; head++) {
    const i = queue[head] ?? 0;
    const x = i % n;
    const y = (i - x) / n;
    if (goal(x, y)) {
      const path: [number, number][] = [];
      for (let j = i; ; j = prev[j] ?? start) {
        path.push([j % n, Math.floor(j / n)]);
        if (j === start) break;
      }
      return path.reverse();
    }
    const mask = links(g, x, y, network);
    for (let d = 0; d < 4; d++) {
      if (!(mask & (1 << d))) continue;
      const j = (y + DY[d as Dir]) * n + x + DX[d as Dir];
      if (prev[j] !== -1) continue;
      prev[j] = i;
      queue.push(j);
    }
  }
  return null;
}

/** Ships sail on open water and under bridges. */
export const isNavigable = (kind: number): boolean => kind === TileKind.Water || isBridge(kind);

/**
 * Water route from (sx, sy) to the nearest navigable tile on the map edge,
 * moving between 4-neighbours; on landlocked water, to the farthest tile it
 * can reach instead. Start first; null when (sx, sy) is not water.
 */
export function waterRoute(g: Grid, sx: number, sy: number): [number, number][] | null {
  const n = g.size;
  if (!isNavigable(kindAt(g, sx, sy))) return null;
  const prev = new Int32Array(n * n).fill(-1);
  const start = sy * n + sx;
  prev[start] = start;
  const queue = [start];
  const pathTo = (end: number) => {
    const path: [number, number][] = [];
    for (let j = end; ; j = prev[j] ?? start) {
      path.push([j % n, Math.floor(j / n)]);
      if (j === start) break;
    }
    return path.reverse();
  };
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head] ?? 0;
    const x = i % n;
    const y = (i - x) / n;
    if (x === 0 || y === 0 || x === n - 1 || y === n - 1) return pathTo(i);
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d as Dir];
      const ny = y + DY[d as Dir];
      const j = ny * n + nx;
      if (prev[j] !== -1 || !isNavigable(kindAt(g, nx, ny))) continue;
      prev[j] = i;
      queue.push(j);
    }
  }
  // Breadth-first order: the last tile queued is as far as the water goes.
  return queue.length > 1 ? pathTo(queue[queue.length - 1] ?? start) : null;
}

/** Connected pieces of a network, each as a list of tile indices. */
export function components(g: Grid, network: Network): number[][] {
  const n = g.size;
  const seen = new Uint8Array(n * n);
  const out: number[][] = [];
  for (let i = 0; i < n * n; i++) {
    if (seen[i] || !carries(g.tiles[i] ?? 0, network)) continue;
    const part = [i];
    seen[i] = 1;
    for (let head = 0; head < part.length; head++) {
      const j = part[head] ?? 0;
      const x = j % n;
      const y = (j - x) / n;
      const mask = links(g, x, y, network);
      for (let d = 0; d < 4; d++) {
        if (!(mask & (1 << d))) continue;
        const k = (y + DY[d as Dir]) * n + x + DX[d as Dir];
        if (seen[k]) continue;
        seen[k] = 1;
        part.push(k);
      }
    }
    out.push(part);
  }
  return out;
}
