import { type BufferGeometry, Color, InstancedMesh, type Material, Vector3 } from 'three';
import type { Network } from '@/shared/tiles';
import { AGENT_CULL_DISTANCE } from '../lod';
import { DX, DY, type Dir, type Grid, links, type Pose2, Segment } from './roadGraph';

/** Anything the camera can follow. Layers update these fields every frame. */
export interface Agent {
  readonly label: string;
  alive: boolean;
  /** Hidden in a tunnel. */
  hidden: boolean;
  readonly pos: Vector3;
  /** Unit heading in 3D. */
  readonly dir: Vector3;
  /** Chase-camera distance behind and height above. */
  readonly chase: readonly [number, number];
}

/**
 * One InstancedMesh refilled every frame: begin(), push() each visible
 * agent, end(). Matrices are written straight into the instance buffer.
 */
export class InstancePool {
  /** The camera position; pools that cull skip instances farther than AGENT_CULL_DISTANCE. */
  static readonly viewer = new Vector3(Infinity, 0, 0);

  /** Whether a model is big enough for its shadow to be worth drawing. */
  static bigShadows(geometry: BufferGeometry): boolean {
    geometry.computeBoundingSphere();
    return (geometry.boundingSphere?.radius ?? 0) > 0.35;
  }
  /** Skip far instances (cars and trains: tiny at that range; planes and ships stay). */
  cull = false;
  readonly mesh: InstancedMesh;
  private n = 0;
  private readonly color = new Color();

  constructor(
    geometry: BufferGeometry,
    material: Material,
    readonly capacity: number,
    shadows = true,
    /** Multiplies every instance's scale. */
    private readonly baseScale = 1,
  ) {
    this.mesh = new InstancedMesh(geometry, material, capacity);
    this.mesh.count = 0;
    // Vehicle shadows are a few pixels; only big agents (planes, ships) cast them.
    this.mesh.castShadow = shadows && InstancePool.bigShadows(geometry);
    this.mesh.receiveShadow = false;
    // Agents roam the whole map; skip per-mesh culling against a stale bound.
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, this.color.set(1, 1, 1));
  }

  begin(): void {
    this.n = 0;
  }

  /** Place one instance at p facing f (need not be unit), scaled by s, and stretched by sx along f. */
  push(px: number, py: number, pz: number, fx: number, fy: number, fz: number, scale: number, rgb: Color | number, sx = 1): void {
    if (this.n >= this.capacity) return;
    if (this.cull) {
      const v = InstancePool.viewer;
      const dx = px - v.x;
      const dy = py - v.y;
      const dz = pz - v.z;
      if (dx * dx + dy * dy + dz * dz > AGENT_CULL_DISTANCE * AGENT_CULL_DISTANCE) return;
    }
    const s = scale * this.baseScale;
    const fl = Math.hypot(fx, fy, fz) || 1;
    const ax = fx / fl;
    const ay = fy / fl;
    const az = fz / fl;
    // Z = X × up, Y = Z × X: an upright frame that pitches with the heading.
    const hz = Math.hypot(ax, az) || 1;
    const zx = -az / hz;
    const zz = ax / hz;
    const yx = -zz * ay;
    const yy = zz * ax - zx * az;
    const yz = zx * ay;
    const e = this.mesh.instanceMatrix.array as Float32Array;
    const o = this.n * 16;
    e[o] = ax * s * sx; e[o + 1] = ay * s * sx; e[o + 2] = az * s * sx; e[o + 3] = 0;
    e[o + 4] = yx * s; e[o + 5] = yy * s; e[o + 6] = yz * s; e[o + 7] = 0;
    e[o + 8] = zx * s; e[o + 9] = 0; e[o + 10] = zz * s; e[o + 11] = 0;
    e[o + 12] = px; e[o + 13] = py; e[o + 14] = pz; e[o + 15] = 1;
    this.mesh.setColorAt(this.n, typeof rgb === 'number' ? this.color.setHex(rgb) : rgb);
    this.n++;
  }

  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/**
 * Moves along a road or rail network one tile segment at a time. `choose`
 * picks the exit heading for each new tile; returning null (or a broken
 * link) stops the mover, and the caller removes its vehicle.
 */
export class Mover {
  readonly seg = new Segment();
  t = 0;
  private readonly pose: Pose2 = { x: 0, z: 0, hx: 1, hz: 0 };

  constructor(
    readonly lane: number,
    readonly network: Network,
  ) {}

  place(x: number, y: number, din: Dir, dout: Dir, t = 0): void {
    this.seg.set(x, y, din, dout, this.lane);
    this.t = t;
  }

  /** Move `dist` along; false when the way ahead is gone. */
  advance(g: Grid, dist: number, choose: (x: number, y: number, heading: Dir) => Dir | null, onEnter?: (seg: Segment) => void): boolean {
    let left = dist;
    for (let guard = 0; guard < 8; guard++) {
      const remaining = (1 - this.t) * this.seg.length;
      if (left < remaining) {
        this.t += left / this.seg.length;
        return true;
      }
      left -= remaining;
      const { x, y, dout } = this.seg;
      if (!(links(g, x, y, this.network) & (1 << dout))) return false;
      const nx = x + DX[dout];
      const ny = y + DY[dout];
      const next = choose(nx, ny, dout);
      if (next === null) return false;
      this.seg.set(nx, ny, dout, next, this.lane);
      this.t = 0;
      onEnter?.(this.seg);
    }
    return true;
  }

  get pose2(): Pose2 {
    return this.seg.at(this.t, this.pose);
  }
}

/** Fill an Agent's pos and dir from a ground pose and a surface height function. */
export function placeOnSurface(agent: Agent, p: Pose2, surface: (x: number, z: number) => number): void {
  const y = surface(p.x, p.z);
  const ahead = surface(p.x + p.hx * 0.12, p.z + p.hz * 0.12);
  const behind = surface(p.x - p.hx * 0.12, p.z - p.hz * 0.12);
  agent.pos.set(p.x, y, p.z);
  agent.dir.set(p.hx, (ahead - behind) / 0.24, p.hz).normalize();
}

/** Road vehicles are drawn a little over true scale so they read at city zoom. */
export const VEHICLE_SCALE = 1.25;

export const PAINT = [0xc0392b, 0x2e86de, 0xf4f4f4, 0x2c3e50, 0x7f8c8d, 0x27ae60, 0xe67e22, 0x8e44ad, 0xbdc3c7, 0x16a085, 0x1f1f24, 0xd9c9a3];
