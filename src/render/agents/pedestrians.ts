import { Color, type Material, Vector3 } from 'three';
import { isPark, isRoad, TileKind, ZoneType, zoneOf } from '@/shared/tiles';
import type { CityMirror } from '../mirror';
import { capOf, PEDESTRIAN_RANGE, poolSize } from './budget';
import { InstancePool } from './core';
import { MODELS } from './models';
import { DX, DY } from './roadGraph';
import type { VisualRng } from './visualRng';

const SHIRTS = [0xc0392b, 0x2e86de, 0x27ae60, 0xf1c40f, 0xe67e22, 0x8e44ad, 0xecf0f1, 0x34495e, 0x16a085, 0xd35400];

/** A walk: back and forth between two points, or round a circle. */
interface Walker {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** Circle walks: centre and radius (radius 0 for a line). */
  r: number;
  t: number;
  speed: number;
  phase: number;
  color: Color;
}

/**
 * Pedestrians near the camera only: on the sidewalks of busy commercial
 * streets (density 3 and up), in parks, and around the stadium.
 */
export class PedestrianLayer {
  private walkers: Walker[] = [];
  private readonly pool: InstancePool;
  private center = new Vector3(Infinity, 0, Infinity);
  private dirty = true;
  private time = 0;

  constructor(
    private readonly mirror: CityMirror,
    private readonly rng: VisualRng,
    material: Material,
  ) {
    // Drawn at about 1.6× true scale, like the vehicles, so people read from above.
    this.pool = new InstancePool(MODELS.pedestrian(), material, poolSize('pedestrians'), false, 1.6);
  }

  get meshes() {
    return [this.pool.mesh];
  }

  markDirty(): void {
    this.dirty = true;
  }

  update(dt: number, target: Vector3, cameraDistance: number): void {
    this.time += dt;
    this.pool.begin();
    if (cameraDistance >= PEDESTRIAN_RANGE) {
      this.pool.end();
      return;
    }
    if (this.dirty || Math.hypot(target.x - this.center.x, target.z - this.center.z) > 6) this.populate(target);
    const m = this.mirror;
    for (const w of this.walkers) {
      w.t += (w.speed * dt) / Math.max(0.2, w.r > 0 ? w.r * Math.PI * 2 : Math.hypot(w.bx - w.ax, w.bz - w.az));
      let x: number;
      let z: number;
      let fx: number;
      let fz: number;
      if (w.r > 0) {
        const a = w.t * Math.PI * 2;
        x = w.ax + Math.cos(a) * w.r;
        z = w.az + Math.sin(a) * w.r;
        fx = -Math.sin(a);
        fz = Math.cos(a);
      } else {
        // Ping-pong along the line.
        const u = w.t % 2;
        const s = u < 1 ? u : 2 - u;
        x = w.ax + (w.bx - w.ax) * s;
        z = w.az + (w.bz - w.az) * s;
        const sign = u < 1 ? 1 : -1;
        fx = (w.bx - w.ax) * sign;
        fz = (w.bz - w.az) * sign;
      }
      const bob = Math.abs(Math.sin(this.time * 9 + w.phase)) * 0.008;
      this.pool.push(x, m.heightAt(x, z) + 0.02 + bob, z, fx, 0, fz, 1, w.color);
    }
    this.pool.end();
  }

  private populate(target: Vector3): void {
    this.dirty = false;
    this.center.copy(target);
    this.walkers = [];
    const m = this.mirror;
    const reach = 24;
    const x0 = Math.max(0, Math.floor(target.x - reach));
    const x1 = Math.min(m.size - 1, Math.floor(target.x + reach));
    const y0 = Math.max(0, Math.floor(target.z - reach));
    const y1 = Math.min(m.size - 1, Math.floor(target.z + reach));
    const spots: (() => void)[] = [];
    const add = (w: Omit<Walker, 't' | 'speed' | 'phase' | 'color'>) => {
      spots.push(() => {
        this.walkers.push({
          ...w,
          t: this.rng.next() * 2,
          speed: this.rng.range(0.18, 0.32),
          phase: this.rng.next() * 6,
          color: new Color(this.rng.pick(SHIRTS) ?? 0xffffff),
        });
      });
    };
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const kind = m.tile(x, y);
        if (isRoad(kind)) {
          // The sidewalk on each side that faces a busy shop or office.
          for (let d = 0; d < 4; d++) {
            const nx = x + DX[d as 0];
            const ny = y + DY[d as 0];
            if (nx < 0 || ny < 0 || nx >= m.size || ny >= m.size) continue;
            const zone = zoneOf(m.tile(nx, ny));
            if (zone?.type !== ZoneType.C || zone.density < 3) continue;
            const ex = x + 0.5 + DX[d as 0] * 0.43;
            const ez = y + 0.5 + DY[d as 0] * 0.43;
            const px = DY[d as 0] * 0.45;
            const pz = DX[d as 0] * 0.45;
            add({ ax: ex - px, az: ez - pz, bx: ex + px, bz: ez + pz, r: 0 });
            add({ ax: ex + px, az: ez + pz, bx: ex - px, bz: ez - pz, r: 0 });
          }
        } else if (isPark(kind)) {
          add({ ax: x + 0.2, az: y + 0.2 + this.rng.next() * 0.6, bx: x + 0.8, bz: y + 0.2 + this.rng.next() * 0.6, r: 0 });
        } else if (kind === TileKind.Stadium && m.parts[y * m.size + x] === 1) {
          for (let k = 0; k < 24; k++) add({ ax: x + 2, az: y + 2, bx: 0, bz: 0, r: 2.08 + this.rng.next() * 0.1 });
        }
      }
    }
    // Random subset up to the cap.
    for (let i = spots.length - 1; i > 0; i--) {
      const j = this.rng.int(i + 1);
      [spots[i], spots[j]] = [spots[j] ?? (() => undefined), spots[i] ?? (() => undefined)];
    }
    for (const spawn of spots.slice(0, capOf('pedestrians'))) spawn();
  }
}
