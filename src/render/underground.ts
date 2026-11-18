import { BoxGeometry, Color, Group, InstancedMesh, type Material, Matrix4, Mesh, MeshBasicMaterial, Quaternion, Vector3 } from 'three';
import { TileKind } from '@/shared/tiles';
import type { CityMirror } from './mirror';
import { HEIGHT_UNIT } from './units';

/** Track runs this far below the lowest corner of its tile. */
const DEPTH = 0.4;
const TRAIN_SPEED = 6;
/** Seconds a train waits at each station. */
const TRAIN_DWELL = 2;
const MAX_TRAINS = 30;
const MAX_PIECES = 16_384;
const MAX_SHAFTS = 512;

/** Track tiles between two stations, start first: one train runs back and forth along each. */
export function trainRuns(size: number, subway: ArrayLike<number>, tiles: ArrayLike<number>): number[][] {
  const runs: number[][] = [];
  const seen = new Uint8Array(size * size);
  const isStation = (i: number) => tiles[i] === TileKind.SubwayStation && subway[i] === 1;
  for (let s = 0; s < size * size && runs.length < MAX_TRAINS; s++) {
    if (!isStation(s) || seen[s]) continue;
    // From each station not yet reached, a breadth-first search along the track to every other station.
    const parent = new Int32Array(size * size).fill(-2);
    parent[s] = -1;
    const queue = [s];
    seen[s] = 1;
    for (let q = 0; q < queue.length; q++) {
      const t = queue[q] ?? 0;
      if (t !== s && isStation(t) && !seen[t]) {
        seen[t] = 1;
        const run: number[] = [];
        for (let p = t; p >= 0; p = parent[p] ?? -1) run.push(p);
        runs.push(run.reverse());
        if (runs.length >= MAX_TRAINS) break;
      }
      const x = t % size;
      for (const n of [x > 0 ? t - 1 : -1, x < size - 1 ? t + 1 : -1, t - size, t + size]) {
        if (n < 0 || n >= size * size || subway[n] !== 1 || parent[n] !== -2) continue;
        parent[n] = t;
        queue.push(n);
      }
    }
  }
  return runs;
}

interface Train {
  run: number[];
  /** Position along the run, in tiles. */
  at: number;
  forward: boolean;
  wait: number;
}

/**
 * The underground view: subway track as glowing orange tubes below the
 * ground, cyan shafts up to the stations, and trains as moving lights.
 * Hidden unless the view is on.
 */
export class UndergroundLayer {
  readonly group = new Group();
  private readonly pieces: InstancedMesh;
  private readonly shafts: InstancedMesh;
  private readonly trains: InstancedMesh;
  private running: Train[] = [];
  private dirty = true;
  private readonly matrix = new Matrix4();
  private readonly q = new Quaternion();

  constructor(private readonly mirror: CityMirror) {
    this.group.name = 'underground';
    this.group.visible = false;
    const glow = (hex: number): Material => new MeshBasicMaterial({ color: new Color(hex), toneMapped: false, depthTest: false, transparent: true, opacity: 0.95 });
    this.pieces = new InstancedMesh(new BoxGeometry(1, 1, 1), glow(0xff8a2a), MAX_PIECES);
    this.shafts = new InstancedMesh(new BoxGeometry(1, 1, 1), glow(0x4fd8ff), MAX_SHAFTS);
    this.trains = new InstancedMesh(new BoxGeometry(1, 1, 1), glow(0xffffff), MAX_TRAINS);
    for (const mesh of [this.pieces, this.shafts, this.trains]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      // Drawn over the faded surface so the network reads clearly.
      mesh.renderOrder = 6;
      this.group.add(mesh);
    }
  }

  markDirty(): void {
    this.dirty = true;
  }

  setVisible(on: boolean): void {
    this.group.visible = on;
    if (on) this.dirty = true;
  }

  private depthAt(i: number): number {
    const m = this.mirror;
    const x = i % m.size;
    const y = (i - x) / m.size;
    return Math.min(m.corner(x, y), m.corner(x + 1, y), m.corner(x, y + 1), m.corner(x + 1, y + 1)) * HEIGHT_UNIT - DEPTH;
  }

  private centre(i: number): Vector3 {
    const x = i % this.mirror.size;
    return new Vector3(x + 0.5, this.depthAt(i), (i - x) / this.mirror.size + 0.5);
  }

  private rebuild(): void {
    this.dirty = false;
    const m = this.mirror;
    let n = 0;
    let shafts = 0;
    const put = (mesh: InstancedMesh, k: number, pos: Vector3, scale: Vector3) => {
      mesh.setMatrixAt(k, this.matrix.compose(pos, this.q, scale));
    };
    for (let i = 0; i < m.size * m.size && n < MAX_PIECES - 2; i++) {
      if (m.subway[i] !== 1) continue;
      const here = this.centre(i);
      put(this.pieces, n++, here, new Vector3(0.22, 0.22, 0.22));
      // A tube to the east and south neighbours, so each join is drawn once.
      const x = i % m.size;
      for (const j of [x < m.size - 1 ? i + 1 : -1, i + m.size]) {
        if (j < 0 || j >= m.size * m.size || m.subway[j] !== 1) continue;
        const there = this.centre(j);
        const mid = here.clone().add(there).multiplyScalar(0.5);
        const alongX = j === i + 1;
        put(this.pieces, n++, mid, new Vector3(alongX ? 1 : 0.14, 0.14 + Math.abs(there.y - here.y), alongX ? 0.14 : 1));
      }
      if (m.tiles[i] === TileKind.SubwayStation && shafts < MAX_SHAFTS) {
        const top = m.corner(x, (i - x) / m.size) * HEIGHT_UNIT + 0.3;
        const height = top - here.y;
        put(this.shafts, shafts++, new Vector3(here.x, here.y + height / 2, here.z), new Vector3(0.3, height, 0.3));
      }
    }
    this.pieces.count = n;
    this.shafts.count = shafts;
    this.pieces.instanceMatrix.needsUpdate = true;
    this.shafts.instanceMatrix.needsUpdate = true;
    // Keep trains on runs that still exist.
    const runs = trainRuns(m.size, m.subway, m.tiles);
    this.running = runs.map((run) => this.running.find((t) => t.run[0] === run[0] && t.run.at(-1) === run.at(-1)) ?? { run, at: 0, forward: true, wait: 0 });
    for (const t of this.running) t.run = runs.find((r) => r[0] === t.run[0] && r.at(-1) === t.run.at(-1)) ?? t.run;
  }

  update(dt: number, paused: boolean): void {
    if (!this.group.visible) return;
    if (this.dirty) this.rebuild();
    let k = 0;
    for (const train of this.running) {
      const last = train.run.length - 1;
      if (!paused) {
        if (train.wait > 0) train.wait -= dt;
        else {
          train.at += (train.forward ? 1 : -1) * TRAIN_SPEED * dt;
          if (train.at >= last || train.at <= 0) {
            train.at = Math.max(0, Math.min(last, train.at));
            train.forward = !train.forward;
            train.wait = TRAIN_DWELL;
          }
        }
      }
      const a = Math.floor(train.at);
      const b = Math.min(last, a + 1);
      const p = this.centre(train.run[a] ?? 0).lerp(this.centre(train.run[b] ?? 0), train.at - a);
      p.y += 0.02;
      this.trains.setMatrixAt(k++, this.matrix.compose(p, this.q, new Vector3(0.36, 0.2, 0.36)));
    }
    this.trains.count = k;
    this.trains.instanceMatrix.needsUpdate = true;
  }

  /** Meshes, for disposal and tests. */
  get meshes(): Mesh[] {
    return [this.pieces, this.shafts, this.trains];
  }
}
