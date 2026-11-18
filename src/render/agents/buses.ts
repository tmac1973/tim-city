import { type Material, Vector3 } from 'three';
import { isRoad, isTunnel } from '@/shared/tiles';
import { findBusNetwork } from '@/sim/systems/transit';
import type { CityMirror } from '../mirror';
import { capOf, poolSize } from './budget';
import { type Agent, InstancePool, Mover, placeOnSurface, VEHICLE_SCALE } from './core';
import { MODELS } from './models';
import { DX, DY, type Dir } from './roadGraph';

const LANE = 0.17;
const CRUISE = 1.1;
/** Seconds a bus waits at each end of its route. */
const DWELL = 3;
const YELLOW = 0xf5c542;

/** One city bus, driving its route between two stops and back. */
export class Bus implements Agent {
  readonly label = 'City bus';
  alive = true;
  hidden = false;
  leaving = false;
  readonly pos = new Vector3();
  readonly dir = new Vector3(1, 0, 0);
  readonly chase = [1.1, 0.38] as const;
  readonly mover = new Mover(LANE, 'road');
  speed = 0;
  scale = 0;
  wait = 0;
  /** Tiles still to drive, the next one first. */
  path: [number, number][] = [];

  constructor(
    /** The two stops, as "a-b", so a rebuilt network can keep its buses. */
    readonly key: string,
    /** The route, one stop's road to the other's. */
    public route: [number, number][],
  ) {}
}

/** A bus's next leg: the route the other way round from where it stands. */
export function nextLeg(route: readonly [number, number][], at: [number, number]): [number, number][] {
  const first = route[0];
  const atStart = first !== undefined && first[0] === at[0] && first[1] === at[1];
  const leg = atStart ? [...route] : [...route].reverse();
  return leg.slice(1);
}

/**
 * Buses on the routes the sim links between bus stops (one per route, up
 * to the cap). Visual only: they read the mirror and never touch the sim.
 */
export class BusLayer {
  readonly buses: Bus[] = [];
  private readonly pool: InstancePool;
  private dirty = true;
  private clock = 0;

  constructor(
    private readonly mirror: CityMirror,
    private readonly surface: (x: number, z: number) => number,
    material: Material,
  ) {
    this.pool = new InstancePool(MODELS.bus(), material, poolSize('buses'), true, VEHICLE_SCALE);
  }

  get meshes() {
    return [this.pool.mesh];
  }

  markDirty(): void {
    this.dirty = true;
  }

  update(dt: number): void {
    this.clock += dt;
    if (this.dirty && this.clock >= 1) {
      this.clock = 0;
      this.dirty = false;
      this.syncRoutes();
    }
    for (const b of this.buses) this.step(b, dt);
    for (let i = this.buses.length - 1; i >= 0; i--) if (!this.buses[i]?.alive) this.buses.splice(i, 1);
    this.draw();
  }

  /** One bus per route: new routes get a bus, gone ones lose theirs. */
  private syncRoutes(): void {
    const m = this.mirror;
    const network = findBusNetwork(m.size, m.tiles);
    const wanted = new Map<string, [number, number][]>();
    network.links.forEach(([a, b], k) => {
      if (wanted.size >= capOf('buses')) return;
      const route = (network.routes[k] ?? []).map((t): [number, number] => [t % m.size, Math.floor(t / m.size)]);
      if (route.length >= 2) wanted.set(`${String(a)}-${String(b)}`, route);
    });
    for (const bus of this.buses) {
      const route = wanted.get(bus.key);
      if (!route) bus.leaving = true;
      else bus.route = route;
    }
    for (const [key, route] of wanted) {
      if (this.buses.some((b) => b.key === key && !b.leaving)) continue;
      const bus = new Bus(key, route);
      const [x, y] = route[0] ?? [0, 0];
      bus.path = route.slice(1);
      this.place(bus, x, y);
      this.buses.push(bus);
    }
  }

  private place(b: Bus, x: number, y: number): void {
    const next = b.path[0];
    const dout = next ? (([0, 1, 2, 3] as const).find((d) => x + DX[d] === next[0] && y + DY[d] === next[1]) ?? 1) : 1;
    b.mover.place(x, y, dout, dout, 0.5);
    placeOnSurface(b, b.mover.pose2, this.surface);
  }

  private choose(b: Bus, x: number, y: number, heading: Dir): Dir | null {
    if (!isRoad(this.mirror.tile(x, y))) return null;
    b.path.shift();
    const next = b.path[0];
    if (!next) return heading;
    return ([0, 1, 2, 3] as const).find((d) => x + DX[d] === next[0] && y + DY[d] === next[1]) ?? null;
  }

  private step(b: Bus, dt: number): void {
    b.scale = Math.min(1, Math.max(0, b.scale + (b.leaving ? -dt : dt) / 0.4));
    if (b.leaving && b.scale <= 0) {
      b.alive = false;
      return;
    }
    if (b.path.length === 0 && b.mover.t >= 0.5) {
      // At the stop: wait, then set off back the other way.
      b.speed = 0;
      b.wait += dt;
      if (b.wait >= DWELL) {
        b.wait = 0;
        const at: [number, number] = [b.mover.seg.x, b.mover.seg.y];
        b.path = nextLeg(b.route, at);
        this.place(b, at[0], at[1]);
      }
    } else {
      b.speed += (CRUISE - b.speed) * Math.min(1, dt * 2);
      if (!b.mover.advance(this.mirror, b.speed * dt, (x, y, h) => this.choose(b, x, y, h))) b.leaving = true;
    }
    b.hidden = isTunnel(this.mirror.tile(b.mover.seg.x, b.mover.seg.y));
    placeOnSurface(b, b.mover.pose2, this.surface);
  }

  private draw(): void {
    this.pool.begin();
    for (const b of this.buses) {
      if (!b.hidden) this.pool.push(b.pos.x, b.pos.y, b.pos.z, b.dir.x, b.dir.y, b.dir.z, b.scale, YELLOW);
    }
    this.pool.end();
  }
}
