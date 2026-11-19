import { Group, MeshStandardMaterial, type Ray, type Vector3 } from 'three';
import { Changed, type CityMirror } from '../mirror';
import { BusLayer } from './buses';
import { CarLayer } from './cars';
import { type Agent, InstancePool } from './core';
import { EmergencyLayer } from './emergency';
import { PedestrianLayer } from './pedestrians';
import { PlaneLayer } from './planes';
import { ShipLayer } from './ships';
import { TrainLayer } from './trains';
import { VisualRng } from './visualRng';

/**
 * Everything that moves: visual only. Agents read the mirror and the
 * traffic field and never write to the sim, so they cannot change a city.
 */
export class AgentLayer {
  readonly group = new Group();
  readonly cars: CarLayer;
  readonly trains: TrainLayer;
  readonly planes: PlaneLayer;
  readonly ships: ShipLayer;
  readonly pedestrians: PedestrianLayer;
  readonly emergency: EmergencyLayer;
  readonly buses: BusLayer;
  /** While paused, everything holds still. */
  paused = false;
  /**
   * How fast the game clock runs against normal speed. Fire trucks and police
   * keep pace with it, so a truck reaches a fire about when the sim's crews do.
   */
  clockScale = 1;

  constructor(
    mirror: CityMirror,
    roadSurface: (x: number, z: number) => number,
    railSurface: (x: number, z: number) => number,
  ) {
    this.group.name = 'agents';
    const rng = new VisualRng(0x5eed);
    const material = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.6, metalness: 0.05 });
    this.cars = new CarLayer(mirror, rng, roadSurface, material);
    this.trains = new TrainLayer(mirror, rng, railSurface, material);
    this.planes = new PlaneLayer(mirror, rng, material);
    this.ships = new ShipLayer(mirror, rng, material);
    this.pedestrians = new PedestrianLayer(mirror, rng, material);
    this.emergency = new EmergencyLayer(mirror, rng, roadSurface, material);
    this.buses = new BusLayer(mirror, roadSurface, material);
    this.group.add(
      ...this.cars.meshes,
      ...this.trains.meshes,
      ...this.planes.meshes,
      ...this.ships.meshes,
      ...this.pedestrians.meshes,
      ...this.emergency.meshes,
      ...this.buses.meshes,
    );
    mirror.onChunkChanged((_id, changed) => {
      // Agents follow roads, rail, water and buildings: only tile changes matter.
      if (!(changed & (Changed.TILES | Changed.PARTS))) return;
      this.cars.markDirty();
      this.trains.markDirty();
      this.planes.markDirty();
      this.ships.markDirty();
      this.pedestrians.markDirty();
      this.emergency.markDirty();
      this.buses.markDirty();
    });
  }

  setTraffic(data: Uint8Array): void {
    this.cars.setTraffic(data);
  }

  update(dt: number, target: Vector3, cameraDistance: number, night = 0, camera?: Vector3): void {
    const step = this.paused ? 0 : dt;
    if (camera) InstancePool.viewer.copy(camera);
    this.cars.setNight(night);
    this.cars.update(step);
    this.trains.update(step);
    this.planes.update(step);
    this.ships.update(step);
    this.emergency.update(step * this.clockScale);
    this.buses.update(step);
    this.pedestrians.update(step, target, cameraDistance);
  }

  /** Every vehicle the camera can follow. */
  vehicles(): Agent[] {
    return [
      ...this.cars.cars.filter((c) => c.alive && !c.leaving),
      ...this.trains.agents,
      ...this.planes.planes,
      ...this.ships.ships,
      ...this.emergency.units.filter((u) => !u.leaving),
      ...this.buses.buses.filter((b) => !b.leaving),
    ];
  }

  /** The vehicle nearest the camera along a ray, if one passes within reach of it. */
  pick(ray: Ray): Agent | null {
    let best: Agent | null = null;
    let bestT = Infinity;
    for (const a of this.vehicles()) {
      if (a.hidden) continue;
      const reach = a.chase[0] > 1.5 ? 0.5 : 0.25;
      if (ray.distanceSqToPoint(a.pos) > reach * reach) continue;
      const t = a.pos.clone().sub(ray.origin).dot(ray.direction);
      if (t > 0 && t < bestT) {
        bestT = t;
        best = a;
      }
    }
    return best;
  }

  /** Another vehicle to follow: the nearest one not followed recently. */
  nextAfter(current: Agent | null, recent: readonly Agent[]): Agent | null {
    const all = this.vehicles().filter((a) => a !== current && !a.hidden && !recent.includes(a));
    const from = current?.pos;
    if (!from) return all[0] ?? null;
    let best: Agent | null = null;
    let bestD = Infinity;
    for (const a of all) {
      const d = a.pos.distanceToSquared(from);
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    return best;
  }
}
