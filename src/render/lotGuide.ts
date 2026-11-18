import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments } from 'three';
import { isOpenLand, TileKind, ZONE_SIZE } from '@/shared/tiles';
import type { CityMirror } from './mirror';
import { PALETTE } from './palette';

/** Rows of lots shown on each side of a road: both lie within a zone's road reach. */
const DEPTH = 2;
const LIFT = 0.07;
/** Steepest lot a zone accepts (MAX_LOT_SLOPE in the sim). */
const MAX_SLOPE = 2;

export interface GuideLot {
  /** Top-left tile. */
  x: number;
  y: number;
}

type Ground = Pick<CityMirror, 'size' | 'tiles' | 'corner'>;

function lotFits(m: Ground, x: number, y: number, road: ReadonlySet<number>): boolean {
  if (x < 0 || y < 0 || x + ZONE_SIZE > m.size || y + ZONE_SIZE > m.size) return false;
  let lo = Infinity;
  let hi = -Infinity;
  for (let dy = 0; dy < ZONE_SIZE; dy++) {
    for (let dx = 0; dx < ZONE_SIZE; dx++) {
      const i = (y + dy) * m.size + x + dx;
      const kind = m.tiles[i] ?? 0;
      if (road.has(i) || !(isOpenLand(kind) || kind === TileKind.PowerLine)) return false;
    }
  }
  for (let dy = 0; dy <= ZONE_SIZE; dy++) {
    for (let dx = 0; dx <= ZONE_SIZE; dx++) {
      const h = m.corner(x + dx, y + dy);
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
  }
  return hi - lo <= MAX_SLOPE;
}

/**
 * Zone lots that would fit beside a road path, two rows deep on each side.
 * Lots start at the beginning of each straight run and repeat every three
 * tiles; a row stops at the first lot that does not fit, so the outline
 * shows how the land between roads will divide.
 */
export function guideLots(m: Ground, path: readonly number[]): GuideLot[] {
  const road = new Set(path);
  const out: GuideLot[] = [];
  const taken = new Set<number>();
  const add = (x: number, y: number) => {
    const key = y * m.size + x;
    if (taken.has(key)) return true;
    if (!lotFits(m, x, y, road)) return false;
    for (const t of taken) {
      const tx = t % m.size;
      const ty = (t - tx) / m.size;
      if (Math.abs(tx - x) < ZONE_SIZE && Math.abs(ty - y) < ZONE_SIZE) return false;
    }
    taken.add(key);
    out.push({ x, y });
    return true;
  };
  // Split the path into straight runs; a bend tile belongs to both.
  const dir = (a: number, b: number) => (Math.abs(b - a) === 1 ? 'x' : 'y');
  const runs: number[][] = [];
  let start = 0;
  for (let k = 2; k < path.length; k++) {
    if (dir(path[k - 1] ?? 0, path[k] ?? 0) !== dir(path[start] ?? 0, path[start + 1] ?? 0)) {
      runs.push(path.slice(start, k));
      start = k - 1;
    }
  }
  runs.push(path.slice(start));
  for (const run of runs) {
    if (run.length < ZONE_SIZE) continue;
    const xs = run.map((i) => i % m.size);
    const ys = run.map((i) => Math.floor(i / m.size));
    const alongX = ys.every((y) => y === ys[0]);
    const lo = alongX ? Math.min(...xs) : Math.min(...ys);
    const hi = alongX ? Math.max(...xs) : Math.max(...ys);
    const line = alongX ? (ys[0] ?? 0) : (xs[0] ?? 0);
    for (const side of [-1, 1]) {
      for (let depth = 0; depth < DEPTH; depth++) {
        const offset = side > 0 ? line + 1 + depth * ZONE_SIZE : line - ZONE_SIZE * (depth + 1);
        for (let a = lo; a + ZONE_SIZE - 1 <= hi; a += ZONE_SIZE) {
          if (!(alongX ? add(a, offset) : add(offset, a))) break;
        }
      }
    }
  }
  return out;
}

/** Faint outlines of the zone lots that would fit beside the road being drawn. */
export class LotGuide {
  readonly lines: LineSegments;

  constructor(private readonly mirror: CityMirror) {
    this.lines = new LineSegments(
      new BufferGeometry(),
      new LineBasicMaterial({ color: PALETTE.previewOk, transparent: true, opacity: 0.75, depthWrite: false }),
    );
    this.lines.renderOrder = 3;
    this.lines.frustumCulled = false;
    this.lines.visible = false;
  }

  show(lots: readonly GuideLot[]): void {
    const m = this.mirror;
    const inset = 0.12;
    const verts: number[] = [];
    for (const { x, y } of lots) {
      const x0 = x + inset;
      const y0 = y + inset;
      const x1 = x + ZONE_SIZE - inset;
      const y1 = y + ZONE_SIZE - inset;
      const pts: [number, number][] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
      for (let e = 0; e < 4; e++) {
        // Each edge in short steps so it follows the ground.
        const [ax, az] = pts[e] ?? [0, 0];
        const [bx, bz] = pts[(e + 1) % 4] ?? [0, 0];
        const steps = 6;
        for (let s = 0; s < steps; s++) {
          const t0 = s / steps;
          const t1 = (s + 1) / steps;
          const px = (t: number) => ax + (bx - ax) * t;
          const pz = (t: number) => az + (bz - az) * t;
          verts.push(px(t0), m.heightAt(px(t0), pz(t0)) + LIFT, pz(t0), px(t1), m.heightAt(px(t1), pz(t1)) + LIFT, pz(t1));
        }
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
    this.lines.geometry.dispose();
    this.lines.geometry = geometry;
    this.lines.visible = lots.length > 0;
  }

  clear(): void {
    this.lines.visible = false;
  }
}

/** Gaps between parallel roads that fit whole lots: one row, or two back to back. */
export const LOT_GAPS = [ZONE_SIZE, 2 * ZONE_SIZE] as const;
const SNAP_REACH = 8;

export interface ParallelSnap {
  /** Tiles to move the drag across its direction (0 when it already fits or there is nothing to snap to). */
  shift: number;
  /** Tiles between the new road and the parallel one, after the shift. */
  gap: number;
}

/**
 * For a straight road drag, find the nearest parallel road within a few
 * tiles. When the gap between them is one tile off a gap that fits lots
 * (3 or 6), return the shift that makes it fit.
 */
export function snapParallel(
  m: Pick<CityMirror, 'size' | 'tiles'>,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  isRoad: (kind: number) => boolean,
): ParallelSnap | null {
  const alongX = y0 === y1;
  if (!alongX && x0 !== x1) return null;
  const line = alongX ? y0 : x0;
  const lo = alongX ? Math.min(x0, x1) : Math.min(y0, y1);
  const hi = alongX ? Math.max(x0, x1) : Math.max(y0, y1);
  if (hi - lo < 2) return null;
  const road = (a: number, b: number) => {
    const [x, y] = alongX ? [a, b] : [b, a];
    return x >= 0 && y >= 0 && x < m.size && y < m.size && isRoad(m.tiles[y * m.size + x] ?? 0);
  };
  for (let d = 1; d <= SNAP_REACH; d++) {
    for (const side of [-1, 1]) {
      const other = line + side * d;
      let hits = 0;
      for (let a = lo; a <= hi; a++) if (road(a, other)) hits++;
      // A parallel road runs alongside at least half the drag.
      if (hits * 2 < hi - lo + 1) continue;
      const gap = d - 1;
      const target = LOT_GAPS.reduce<number>((best, g) => (Math.abs(g - gap) < Math.abs(best - gap) ? g : best), LOT_GAPS[0]);
      if (Math.abs(target - gap) !== 1) return { shift: 0, gap };
      const shift = side * (gap - target);
      const moved = line + shift;
      if (moved < 0 || moved >= m.size) return { shift: 0, gap };
      return { shift, gap: target };
    }
  }
  return null;
}
