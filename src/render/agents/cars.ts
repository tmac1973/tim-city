import { Color, type Material, MeshBasicMaterial, Vector3 } from 'three';
import { isRoad, isTunnel } from '@/shared/tiles';
import type { CityMirror } from '../mirror';
import { capOf, poolSize } from './budget';
import { type Agent, InstancePool, Mover, PAINT, placeOnSurface, VEHICLE_SCALE } from './core';
import { MODELS } from './models';
import { DX, DY, type Dir, exits, linkCount, links, reverse } from './roadGraph';
import type { VisualRng } from './visualRng';

/** Cars a 2×2 block shows for its traffic value: 0 to 3, and at least one on any road in use. */
export const carsForTraffic = (traffic: number): number => Math.min(3, Math.ceil(traffic / 64));

/**
 * Which blocks get a new car and which lose one this second. Spawns stop at
 * `cap` cars in all; culls remove the excess wherever a block has more cars
 * than its traffic asks for. `order` is a shuffled list of block indices so
 * the cap does not favour one corner of the map.
 */
export function planCars(
  targets: Uint8Array,
  counts: Uint16Array,
  total: number,
  cap: number,
  order: readonly number[],
): { spawn: number[]; cull: number[] } {
  const spawn: number[] = [];
  const cull: number[] = [];
  let live = total;
  for (const b of order) {
    const want = targets[b] ?? 0;
    const have = counts[b] ?? 0;
    for (let k = have; k > want; k--) cull.push(b);
    for (let k = have; k < want && live < cap; k++) {
      spawn.push(b);
      live++;
    }
  }
  return { spawn, cull };
}

type CarModel = 'sedan' | 'hatchback' | 'van' | 'truck' | 'bus' | 'taxi';
const MIX: [CarModel, number][] = [['sedan', 0.34], ['hatchback', 0.24], ['van', 0.12], ['truck', 0.1], ['bus', 0.08], ['taxi', 0.12]];
const LABELS: Record<CarModel, string> = { sedan: 'Car', hatchback: 'Car', van: 'Van', truck: 'Truck', bus: 'Bus', taxi: 'Taxi' };
const LENGTH: Record<CarModel, number> = { sedan: 0.35, hatchback: 0.3, van: 0.38, truck: 0.53, bus: 0.69, taxi: 0.35 };
const LANE = 0.17;
const FADE = 0.35;

class Car implements Agent {
  alive = true;
  hidden = false;
  readonly pos = new Vector3();
  readonly dir = new Vector3(1, 0, 0);
  readonly chase = [0.9, 0.32] as const;
  readonly mover = new Mover(LANE, 'road');
  readonly color = new Color();
  speed = 0;
  wait = 0;
  stuck = 0;
  life = 0;
  /** 0 → 1 while appearing; leaving counts back down. */
  scale = 0;
  leaving = false;

  constructor(
    readonly model: CarModel,
    readonly label: string,
    readonly cruise: number,
  ) {}
}

/** Ordinary traffic: cars, vans, trucks, buses and taxis, in numbers that follow the traffic field. */
export class CarLayer {
  readonly cars: Car[] = [];
  private readonly pools: Record<CarModel, InstancePool>;
  private traffic: Uint8Array | null = null;
  private roadBlocks: { block: number; tiles: number[] }[] = [];
  private roadsDirty = true;
  private clock = 0;
  private head: Int32Array;
  private next = new Int32Array(poolSize('cars'));
  private readonly lights: InstancePool;
  private readonly lightMaterial = new MeshBasicMaterial({ vertexColors: true });
  private night = 0;

  constructor(
    private readonly mirror: CityMirror,
    private readonly rng: VisualRng,
    private readonly surface: (x: number, z: number) => number,
    material: Material,
  ) {
    const pool = (m: CarModel) => new InstancePool(MODELS[m](), material, poolSize('cars'), true, VEHICLE_SCALE);
    this.pools = { sedan: pool('sedan'), hatchback: pool('hatchback'), van: pool('van'), truck: pool('truck'), bus: pool('bus'), taxi: pool('taxi') };
    this.head = new Int32Array(mirror.size * mirror.size);
    this.lights = new InstancePool(MODELS.carLights(), this.lightMaterial, poolSize('cars'), false, VEHICLE_SCALE);
  }

  get meshes() {
    return [...Object.values(this.pools).map((p) => p.mesh), this.lights.mesh];
  }

  /** Headlights and taillights come on as it gets dark (0 day … 1 night). */
  setNight(night: number): void {
    this.night = night;
    this.lightMaterial.color.setScalar(0.4 + night * 3);
  }

  setTraffic(data: Uint8Array): void {
    this.traffic = data;
  }

  markDirty(): void {
    this.roadsDirty = true;
  }

  update(dt: number): void {
    this.clock += dt;
    if (this.clock >= 1) {
      this.clock = 0;
      this.rebalance();
    }
    this.bucket();
    const m = this.mirror;
    for (const car of this.cars) {
      if (!car.alive) continue;
      car.life -= dt;
      if (car.life <= 0) car.leaving = true;
      car.scale = Math.min(1, Math.max(0, car.scale + (car.leaving ? -dt : dt) / FADE));
      if (car.leaving && car.scale <= 0) {
        car.alive = false;
        continue;
      }
      const gap = this.gapAhead(car);
      const target = car.wait > 0 ? 0 : gap < 0.12 ? 0 : gap < 0.45 ? car.cruise * 0.4 : car.cruise;
      car.wait = Math.max(0, car.wait - dt);
      car.speed += (target - car.speed) * Math.min(1, dt * (target < car.speed ? 8 : 2));
      // A car blocked for long gives up waiting rather than lock an intersection.
      car.stuck = car.speed < 0.05 && car.wait === 0 ? car.stuck + dt : 0;
      if (car.stuck > 4) car.speed = car.cruise * 0.5;
      const ok = car.mover.advance(m, car.speed * dt, (x, y, heading) => this.choose(car, x, y, heading));
      if (!ok) {
        car.alive = false;
        continue;
      }
      const { x, y } = car.mover.seg;
      car.hidden = isTunnel(m.tile(x, y));
      placeOnSurface(car, car.mover.pose2, this.surface);
    }
    // Compact the list now and then.
    if (this.cars.length > 64 && this.cars.filter((c) => c.alive).length < this.cars.length * 0.7) {
      const live = this.cars.filter((c) => c.alive);
      this.cars.length = 0;
      this.cars.push(...live);
    }
    this.draw();
  }

  private choose(car: Car, x: number, y: number, heading: Dir): Dir | null {
    if (!isRoad(this.mirror.tile(x, y))) return null;
    const options = exits(this.mirror, x, y, heading, 'road');
    // Mostly straight on; otherwise any way out.
    const straight = options.includes(heading) && this.rng.next() < 0.6;
    const out = straight ? heading : (this.rng.pick(options) ?? reverse(heading));
    if (linkCount(links(this.mirror, x, y, 'road')) >= 3 && this.rng.next() < 0.45) car.wait = this.rng.range(0.25, 0.8);
    return out;
  }

  /** Distance to the nearest car ahead in the same lane, from last frame's positions. */
  private gapAhead(car: Car): number {
    const { x, y, dout } = car.mover.seg;
    let gap = Infinity;
    const n = this.mirror.size;
    for (const [tx, ty] of [[x, y], [x + DX[dout], y + DY[dout]]] as const) {
      if (tx < 0 || ty < 0 || tx >= n || ty >= n) continue;
      for (let j = this.head[ty * n + tx] ?? -1; j >= 0; j = this.next[j] ?? -1) {
        const other = this.cars[j];
        if (!other || other === car || !other.alive) continue;
        const ox = other.pos.x - car.pos.x;
        const oz = other.pos.z - car.pos.z;
        const along = ox * car.dir.x + oz * car.dir.z;
        if (along <= 0.01) continue;
        const across = Math.abs(ox * car.dir.z - oz * car.dir.x);
        if (across > 0.12 || other.dir.x * car.dir.x + other.dir.z * car.dir.z < 0.2) continue;
        gap = Math.min(gap, along - (LENGTH[other.model] + LENGTH[car.model]) / 2);
      }
    }
    return gap;
  }

  /** Per-tile linked lists of cars, rebuilt each frame for the gap check. */
  private bucket(): void {
    this.head.fill(-1);
    if (this.next.length < this.cars.length) this.next = new Int32Array(this.cars.length * 2);
    const n = this.mirror.size;
    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i];
      if (!car?.alive) continue;
      const tile = car.mover.seg.y * n + car.mover.seg.x;
      this.next[i] = this.head[tile] ?? -1;
      this.head[tile] = i;
    }
  }

  private rebalance(): void {
    const m = this.mirror;
    const half = m.size >> 1;
    if (this.roadsDirty) {
      this.roadsDirty = false;
      const byBlock = new Map<number, number[]>();
      for (let i = 0; i < m.size * m.size; i++) {
        const kind = m.tiles[i] ?? 0;
        if (!isRoad(kind) || isTunnel(kind)) continue;
        const x = i % m.size;
        const y = (i - x) / m.size;
        if (links(m, x, y, 'road') === 0) continue;
        const b = (y >> 1) * half + (x >> 1);
        const list = byBlock.get(b) ?? [];
        list.push(i);
        byBlock.set(b, list);
      }
      this.roadBlocks = [...byBlock].map(([block, tiles]) => ({ block, tiles }));
    }
    const traffic = this.traffic;
    if (!traffic) return;
    const targets = new Uint8Array(half * half);
    for (const { block } of this.roadBlocks) targets[block] = carsForTraffic(traffic[block] ?? 0);
    const counts = new Uint16Array(half * half);
    let total = 0;
    const byBlock = new Map<number, Car[]>();
    for (const car of this.cars) {
      if (!car.alive || car.leaving) continue;
      const b = (car.mover.seg.y >> 1) * half + (car.mover.seg.x >> 1);
      counts[b] = (counts[b] ?? 0) + 1;
      total++;
      const list = byBlock.get(b) ?? [];
      list.push(car);
      byBlock.set(b, list);
    }
    const order = [...byBlock.keys(), ...this.roadBlocks.map((r) => r.block)];
    for (let i = order.length - 1; i > 0; i--) {
      const j = this.rng.int(i + 1);
      [order[i], order[j]] = [order[j] ?? 0, order[i] ?? 0];
    }
    const { spawn, cull } = planCars(targets, counts, total, capOf('cars'), [...new Set(order)]);
    for (const b of cull) {
      const victim = byBlock.get(b)?.pop();
      if (victim) victim.leaving = true;
    }
    const tilesOf = new Map(this.roadBlocks.map((r) => [r.block, r.tiles]));
    for (const b of spawn) {
      const tile = this.rng.pick(tilesOf.get(b) ?? []);
      if (tile !== undefined) this.spawn(tile % m.size, Math.floor(tile / m.size));
    }
  }

  private spawn(x: number, y: number): void {
    const mask = links(this.mirror, x, y, 'road');
    const ways: Dir[] = [];
    for (let d = 0; d < 4; d++) if (mask & (1 << d)) ways.push(d as Dir);
    const dout = this.rng.pick(ways);
    if (dout === undefined) return;
    let roll = this.rng.next();
    let model: CarModel = 'sedan';
    for (const [name, share] of MIX) {
      roll -= share;
      if (roll < 0) {
        model = name;
        break;
      }
    }
    const cruise = (model === 'bus' || model === 'truck' ? 1.05 : 1.35) * this.rng.range(0.85, 1.15);
    const car = new Car(model, LABELS[model], cruise);
    car.mover.place(x, y, dout, dout, this.rng.range(0, 0.6));
    car.life = this.rng.range(20, 60);
    car.speed = cruise * 0.5;
    car.color.setHex(model === 'taxi' ? 0xf1c40f : model === 'bus' ? (this.rng.next() < 0.5 ? 0x2e86de : 0xe67e22) : (this.rng.pick(PAINT) ?? 0xffffff));
    placeOnSurface(car, car.mover.pose2, this.surface);
    const slot = this.cars.findIndex((c) => !c.alive);
    if (slot >= 0) this.cars[slot] = car;
    else this.cars.push(car);
  }

  private draw(): void {
    for (const pool of Object.values(this.pools)) pool.begin();
    this.lights.begin();
    const lit = this.night > 0.05;
    for (const car of this.cars) {
      if (!car.alive || car.hidden) continue;
      const s = car.scale;
      this.pools[car.model].push(car.pos.x, car.pos.y, car.pos.z, car.dir.x, car.dir.y, car.dir.z, s, car.color);
      if (lit) this.lights.push(car.pos.x, car.pos.y, car.pos.z, car.dir.x, car.dir.y, car.dir.z, s, 0xffffff, LENGTH[car.model] / VEHICLE_SCALE);
    }
    for (const pool of Object.values(this.pools)) pool.end();
    this.lights.end();
  }
}
