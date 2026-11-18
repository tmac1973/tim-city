import { type Material, Vector3 } from 'three';
import { TileKind } from '@/shared/tiles';
import { hash3 } from '../hash';
import type { CityMirror } from '../mirror';
import { HEIGHT_UNIT } from '../units';
import { capOf, poolSize } from './budget';
import { type Agent, InstancePool } from './core';
import { MODELS } from './models';
import type { VisualRng } from './visualRng';

/** The airport model's runway runs along local x at z = 2, from -2.8 to 2.8. */
const RUNWAY_Z = 2;
const RUNWAY_HALF = 2.8;

interface Runway {
  origin: number;
  /** Start and end of the runway in world space, and its unit direction. */
  a: Vector3;
  b: Vector3;
  dir: Vector3;
  timer: number;
  departNext: boolean;
}

class Plane implements Agent {
  alive = true;
  hidden = false;
  readonly label = 'Plane';
  readonly pos = new Vector3();
  readonly dir = new Vector3(1, 0, 0);
  readonly chase = [2.2, 0.7] as const;
  speed = 0;
  /** Seconds since the plane appeared. */
  age = 0;
  scale = 1;

  constructor(
    readonly runway: Runway,
    readonly departing: boolean,
  ) {}
}

/** Airports launch and land a plane every 20–40 seconds. */
export class PlaneLayer {
  readonly planes: Plane[] = [];
  private runways: Runway[] = [];
  private dirty = true;
  private readonly pool: InstancePool;

  constructor(
    private readonly mirror: CityMirror,
    private readonly rng: VisualRng,
    material: Material,
  ) {
    this.pool = new InstancePool(MODELS.plane(), material, poolSize('planes'));
  }

  get meshes() {
    return [this.pool.mesh];
  }

  markDirty(): void {
    this.dirty = true;
  }

  private findRunways(): void {
    const m = this.mirror;
    const old = new Map(this.runways.map((r) => [r.origin, r]));
    this.runways = [];
    for (let i = 0; i < m.size * m.size; i++) {
      if (m.tiles[i] !== TileKind.Airport || m.parts[i] !== 1) continue;
      const tx = i % m.size;
      const ty = (i - tx) / m.size;
      const kept = old.get(i);
      if (kept) {
        this.runways.push(kept);
        continue;
      }
      // Same turn and height the building layer gives the airport model.
      const turns = Math.floor(hash3(tx, ty, 6) * 4);
      let top = 0;
      for (let dy = 0; dy <= 6; dy++) for (let dx = 0; dx <= 6; dx++) top = Math.max(top, m.corner(tx + dx, ty + dy));
      const y = top * HEIGHT_UNIT + 0.02;
      const center = new Vector3(tx + 3, y, ty + 3);
      const up = new Vector3(0, 1, 0);
      const angle = (turns * Math.PI) / 2;
      const a = new Vector3(-RUNWAY_HALF, 0, RUNWAY_Z).applyAxisAngle(up, angle).add(center);
      const b = new Vector3(RUNWAY_HALF, 0, RUNWAY_Z).applyAxisAngle(up, angle).add(center);
      // Each airport uses its runway in one direction, picked at random.
      const flip = this.rng.next() < 0.5;
      const [s, e] = flip ? [b, a] : [a, b];
      this.runways.push({ origin: i, a: s, b: e, dir: e.clone().sub(s).normalize(), timer: this.rng.range(3, 10), departNext: this.rng.next() < 0.5 });
    }
    for (const p of this.planes) if (!this.runways.includes(p.runway)) p.alive = false;
  }

  update(dt: number): void {
    if (this.dirty) {
      this.dirty = false;
      this.findRunways();
    }
    for (const r of this.runways) {
      r.timer -= dt;
      if (r.timer > 0) continue;
      r.timer = this.rng.range(20, 40);
      if (this.planes.filter((p) => p.alive).length >= capOf('planes')) continue;
      const plane = new Plane(r, r.departNext);
      r.departNext = !r.departNext;
      if (plane.departing) {
        plane.pos.copy(r.a);
      } else {
        // Final approach: 3° glide down to the threshold, starting far out.
        plane.pos.copy(r.a).addScaledVector(r.dir, -30).setY(r.a.y + 30 * 0.12);
        plane.speed = 3.2;
      }
      plane.dir.copy(r.dir);
      this.planes.push(plane);
    }
    const limit = this.mirror.size * 1.6;
    for (const p of this.planes) {
      if (!p.alive) continue;
      p.age += dt;
      const r = p.runway;
      if (p.departing) {
        const rolled = p.pos.clone().sub(r.a).dot(r.dir);
        if (rolled < RUNWAY_HALF * 1.3) {
          p.speed = Math.min(3.4, p.speed + dt * 1.1);
          p.dir.copy(r.dir);
        } else {
          p.speed = Math.min(6, p.speed + dt * 0.8);
          p.dir.copy(r.dir).setY(0.2).normalize();
        }
        p.pos.addScaledVector(p.dir, p.speed * dt);
        if (Math.abs(p.pos.x - this.mirror.size / 2) > limit / 2 || Math.abs(p.pos.z - this.mirror.size / 2) > limit / 2 || p.pos.y > 40) p.alive = false;
      } else {
        const toGo = r.a.clone().sub(p.pos).dot(r.dir);
        if (toGo > 0) {
          // Glide toward the threshold.
          const target = r.a.clone().sub(p.pos).normalize();
          p.dir.copy(target);
          p.speed = Math.max(2.6, p.speed - dt * 0.05);
        } else {
          p.dir.copy(r.dir);
          p.pos.y = r.a.y;
          p.speed = Math.max(0, p.speed - dt * 1.2);
          if (p.speed === 0) {
            p.scale -= dt / 0.6;
            if (p.scale <= 0) p.alive = false;
          }
        }
        p.pos.addScaledVector(p.dir, p.speed * dt);
      }
    }
    for (let i = this.planes.length - 1; i >= 0; i--) if (!this.planes[i]?.alive) this.planes.splice(i, 1);
    this.pool.begin();
    for (const p of this.planes) this.pool.push(p.pos.x, p.pos.y, p.pos.z, p.dir.x, p.dir.y, p.dir.z, Math.max(0, p.scale), 0xffffff);
    this.pool.end();
  }
}
