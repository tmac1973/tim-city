import { Group, type Vector3 } from 'three';
import type { ActiveDisaster } from '@/shared/protocol';
import type { CityMirror } from '../mirror';
import { type Impact, Meltdown, PlaneCrash, QuakeCracks, Shipwreck } from './impacts';
import { MirebeastFx } from './mirebeast';
import { Particles } from './particles';
import { Shake } from './quake';
import { TileFx } from './tiles';
import { TornadoFx } from './tornado';

/**
 * Cinematic disaster effects. Everything here follows the sim (tile flags,
 * rubble, the active disaster list) and never feeds back into it.
 */
export class FxLayer {
  readonly group = new Group();
  readonly particles = new Particles();
  readonly tiles: TileFx;
  readonly shake = new Shake();
  private readonly movers = new Map<number, TornadoFx | MirebeastFx>();
  private readonly impacts: Impact[] = [];
  private readonly seen = new Set<number>();
  private active: ActiveDisaster[] = [];

  constructor(private readonly mirror: CityMirror) {
    this.tiles = new TileFx(mirror, this.particles);
    this.group.add(this.tiles.group, this.particles.smoke.mesh, this.particles.glow.mesh, this.particles.flash.mesh);
    this.group.name = 'fx';
  }

  rebuild(id: number): void {
    this.tiles.rebuild(id);
  }

  setActive(disasters: ActiveDisaster[]): void {
    this.active = disasters;
    for (const d of disasters) {
      if (this.seen.has(d.id)) continue;
      this.seen.add(d.id);
      const x = d.x + 0.5;
      const z = d.y + 0.5;
      // A disaster first seen part-way through (a loaded game) skips its opening.
      const fresh = d.age <= 2;
      if (d.type === 'tornado') this.addMover(d.id, new TornadoFx(this.mirror, this.particles, x, z));
      else if (d.type === 'mirebeast') this.addMover(d.id, new MirebeastFx(this.mirror, this.particles, x, z, d.heading));
      else if (!fresh) continue;
      else if (d.type === 'planeCrash') this.addImpact(new PlaneCrash(this.particles, this.mirror, x, z));
      else if (d.type === 'shipwreck') this.addImpact(new Shipwreck(this.particles, x, z));
      else if (d.type === 'meltdown') {
        this.addImpact(new Meltdown(this.particles, this.mirror, x, z));
        this.shake.add(0.6);
      } else if (d.type === 'earthquake') {
        this.addImpact(new QuakeCracks(this.mirror, x, z));
      }
    }
    const live = new Set(disasters.map((d) => d.id));
    for (const [id, mover] of this.movers) if (!live.has(id)) mover.ending = true;
  }

  private addMover(id: number, mover: TornadoFx | MirebeastFx): void {
    this.movers.set(id, mover);
    this.group.add(mover.group);
  }

  private addImpact(impact: Impact): void {
    this.impacts.push(impact);
    this.group.add(impact.group);
  }

  update(dt: number, target: Vector3): void {
    this.particles.update(dt);
    this.tiles.update(dt, target);
    const byId = new Map(this.active.map((d) => [d.id, d]));
    for (const [id, mover] of this.movers) {
      const d = byId.get(id);
      const tx = d ? d.x + 0.5 : mover.group.position.x;
      const tz = d ? d.y + 0.5 : mover.group.position.z;
      const done = mover instanceof TornadoFx ? mover.update(dt, tx, tz) : mover.update(dt, tx, tz, d?.heading ?? 0);
      if (done) {
        this.group.remove(mover.group);
        mover.dispose();
        this.movers.delete(id);
      }
    }
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const impact = this.impacts[i];
      if (impact?.update(dt)) {
        this.group.remove(impact.group);
        impact.dispose();
        this.impacts.splice(i, 1);
      }
    }
    // An earthquake shakes the camera while it lasts, harder the closer it is.
    for (const d of this.active) {
      if (d.type !== 'earthquake') continue;
      const dist = Math.hypot(d.x - target.x, d.y - target.z);
      this.shake.hold(Math.max(0.25, 1 - dist / 90) * (1 - d.age / d.duration));
    }
    // Buildings falling nearby give a small jolt too.
    for (const [x, y] of this.tiles.collapses) {
      if (Math.hypot(x - target.x, y - target.z) < 25) this.shake.add(0.03);
    }
    this.tiles.collapses.length = 0;
    this.shake.update(dt);
  }
}
