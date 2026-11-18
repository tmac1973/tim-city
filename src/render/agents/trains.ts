import { Color, type Material, Vector3 } from 'three';
import { isRail, isTunnel } from '@/shared/tiles';
import type { CityMirror } from '../mirror';
import { AGENT_CAPS } from './budget';
import { type Agent, InstancePool, placeOnSurface } from './core';
import { MODELS } from './models';
import { components, DX, DY, type Dir, exits, links, type Pose2, reverse, Segment } from './roadGraph';
import type { VisualRng } from './visualRng';

const SPACING = 0.56;
const TRAIL = 12;

/** One train per connected rail network per 30 tiles, up to the global cap. */
export function trainsFor(networkSizes: readonly number[], cap = AGENT_CAPS.trains): number[] {
  const want = networkSizes.map((n) => Math.floor(n / 30));
  let left = cap;
  return want.map((w) => {
    const take = Math.min(w, left);
    left -= take;
    return take;
  });
}

class Car implements Agent {
  alive = true;
  hidden = false;
  readonly pos = new Vector3();
  readonly dir = new Vector3(1, 0, 0);
  readonly chase = [1.4, 0.45] as const;
  constructor(readonly label: string) {}
}

/**
 * A train is a head moving tile by tile plus a trail of the segments it
 * passed through; each car sits a fixed distance back along that trail.
 * At a dead end the train stops, waits, and the last car becomes the head.
 */
class Train {
  /** Oldest first; the head is on the last one. */
  segs: Segment[] = [];
  headT = 0;
  speed = 0;
  wait = 0;
  readonly cars: Car[];
  readonly colors: Color[];
  readonly kinds: ('locomotive' | 'coach' | 'freight')[];
  network: number;

  constructor(length: number, freight: boolean, rng: VisualRng, network: number) {
    this.network = network;
    this.kinds = Array.from({ length }, (_, i) => (i === 0 ? 'locomotive' : freight ? 'freight' : 'coach'));
    this.cars = this.kinds.map((k) => new Car(k === 'locomotive' ? 'Train' : freight ? 'Freight train' : 'Passenger train'));
    const loco = rng.pick([0xc0392b, 0x2c3e50, 0x27ae60, 0xe67e22]) ?? 0xc0392b;
    this.colors = this.kinds.map((k) =>
      new Color(k === 'locomotive' ? loco : k === 'coach' ? 0xdfe3e6 : (rng.pick([0xc0392b, 0x2e86de, 0x27ae60, 0xe67e22, 0x7f8c8d]) ?? 0x7f8c8d)),
    );
  }

  get head(): Segment | undefined {
    return this.segs[this.segs.length - 1];
  }

  /** Segment and t at `back` units behind the head. */
  locate(back: number): [Segment, number] | null {
    let i = this.segs.length - 1;
    let seg = this.segs[i];
    if (!seg) return null;
    let along = this.headT * seg.length - back;
    while (along < 0) {
      i--;
      const prev = this.segs[i];
      if (!prev) return [seg, 0];
      seg = prev;
      along += seg.length;
    }
    return [seg, along / seg.length];
  }

  /** Turn around in place: the last car leads, along the reversed trail. */
  reverseDirection(): void {
    const tailBack = (this.cars.length - 1) * SPACING;
    const at = this.locate(tailBack);
    if (!at) return;
    const [tailSeg, tailT] = at;
    const k = this.segs.indexOf(tailSeg);
    const kept = this.segs.slice(Math.max(0, k)).reverse();
    for (const s of kept) s.reversed(0);
    this.segs = kept;
    this.headT = 1 - tailT;
    this.cars.reverse();
    this.colors.reverse();
    this.kinds.reverse();
  }
}

/** Trains on every rail network, sized to its length. */
export class TrainLayer {
  readonly trains: Train[] = [];
  private readonly pools: Record<'locomotive' | 'coach' | 'freight', InstancePool>;
  private dirty = true;
  private readonly pose: Pose2 = { x: 0, z: 0, hx: 1, hz: 0 };

  constructor(
    private readonly mirror: CityMirror,
    private readonly rng: VisualRng,
    private readonly surface: (x: number, z: number) => number,
    material: Material,
  ) {
    const cap = AGENT_CAPS.trains * 6;
    this.pools = {
      locomotive: new InstancePool(MODELS.locomotive(), material, AGENT_CAPS.trains * 2),
      coach: new InstancePool(MODELS.coach(), material, cap),
      freight: new InstancePool(MODELS.freight(), material, cap),
    };
  }

  get meshes() {
    return Object.values(this.pools).map((p) => p.mesh);
  }

  get agents(): Agent[] {
    return this.trains.flatMap((t) => t.cars.slice(0, 1));
  }

  markDirty(): void {
    this.dirty = true;
  }

  update(dt: number): void {
    if (this.dirty) this.rebalance();
    for (const train of this.trains) this.step(train, dt);
    this.draw();
  }

  private rebalance(): void {
    this.dirty = false;
    const m = this.mirror;
    // Trains whose track was torn up go first.
    for (let i = this.trains.length - 1; i >= 0; i--) {
      const t = this.trains[i];
      if (t && !t.segs.every((s) => isRail(m.tile(s.x, s.y)))) {
        for (const c of t.cars) c.alive = false;
        this.trains.splice(i, 1);
      }
    }
    const parts = components(m, 'rail');
    const wanted = trainsFor(parts.map((p) => p.length));
    const have = new Map<number, Train[]>();
    const owner = new Int32Array(m.size * m.size).fill(-1);
    parts.forEach((p, k) => {
      for (const i of p) owner[i] = k;
    });
    for (const t of this.trains) {
      const head = t.head;
      t.network = head ? (owner[head.y * m.size + head.x] ?? -1) : -1;
      const list = have.get(t.network) ?? [];
      list.push(t);
      have.set(t.network, list);
    }
    parts.forEach((part, k) => {
      const list = have.get(k) ?? [];
      const want = wanted[k] ?? 0;
      while (list.length > want) {
        const t = list.pop();
        if (t) this.remove(t);
      }
      for (let n = list.length; n < want; n++) {
        const tile = this.rng.pick(part);
        if (tile !== undefined) this.spawn(tile % m.size, Math.floor(tile / m.size), k);
      }
    });
  }

  private remove(train: Train): void {
    for (const c of train.cars) c.alive = false;
    const i = this.trains.indexOf(train);
    if (i >= 0) this.trains.splice(i, 1);
  }

  private spawn(x: number, y: number, network: number): void {
    const m = this.mirror;
    const mask = links(m, x, y, 'rail');
    const ways: Dir[] = [];
    for (let d = 0; d < 4; d++) if (mask & (1 << d)) ways.push(d as Dir);
    const dout = this.rng.pick(ways);
    if (dout === undefined) return;
    const train = new Train(3 + this.rng.int(3), this.rng.next() < 0.5, this.rng, network);
    train.segs = [new Segment().set(x, y, dout, dout, 0)];
    // Run the head ahead (unseen) so the whole train has a trail to sit on.
    for (let k = 0; k < 40 && this.trailLength(train) < train.cars.length * SPACING + 0.5; k++) this.move(train, 0.5);
    this.trains.push(train);
  }

  private trailLength(train: Train): number {
    let sum = train.headT * (train.head?.length ?? 0);
    for (let i = 0; i < train.segs.length - 1; i++) sum += train.segs[i]?.length ?? 0;
    return sum;
  }

  /** Advance the head; returns false at a dead end. */
  private move(train: Train, dist: number): boolean {
    let left = dist;
    for (let guard = 0; guard < 8; guard++) {
      const head = train.head;
      if (!head) return false;
      const remaining = (1 - train.headT) * head.length;
      if (left < remaining) {
        train.headT += left / head.length;
        return true;
      }
      left -= remaining;
      const nx = head.x + DX[head.dout];
      const ny = head.y + DY[head.dout];
      if (!(links(this.mirror, head.x, head.y, 'rail') & (1 << head.dout))) {
        train.headT = 1;
        return false;
      }
      const options = exits(this.mirror, nx, ny, head.dout, 'rail');
      const back = reverse(head.dout);
      const forward = options.filter((d) => d !== back);
      if (forward.length === 0) {
        // Dead end ahead: stop at the end of this tile.
        train.headT = 1;
        return false;
      }
      const out = forward.includes(head.dout) && this.rng.next() < 0.7 ? head.dout : (this.rng.pick(forward) ?? head.dout);
      const seg = train.segs.length >= TRAIL ? (train.segs.shift() ?? new Segment()) : new Segment();
      train.segs.push(seg.set(nx, ny, head.dout, out, 0));
      train.headT = 0;
    }
    return true;
  }

  private step(train: Train, dt: number): void {
    if (train.wait > 0) {
      train.wait -= dt;
      if (train.wait <= 0) train.reverseDirection();
      this.place(train);
      return;
    }
    const head = train.head;
    const target = head?.turning ? 0.9 : 2.0;
    train.speed += (target - train.speed) * Math.min(1, dt * 1.5);
    if (!this.move(train, train.speed * dt)) {
      train.speed = 0;
      train.wait = 2.5;
    }
    this.place(train);
  }

  private place(train: Train): void {
    const m = this.mirror;
    train.cars.forEach((car, i) => {
      const at = train.locate(i * SPACING);
      if (!at) return;
      const [seg, t] = at;
      car.hidden = isTunnel(m.tile(seg.x, seg.y));
      placeOnSurface(car, seg.at(t, this.pose), this.surface);
    });
  }

  private draw(): void {
    for (const pool of Object.values(this.pools)) pool.begin();
    for (const train of this.trains) {
      train.cars.forEach((car, i) => {
        if (car.hidden) return;
        const kind = train.kinds[i] ?? 'coach';
        // The locomotive at the back of a reversed train still faces outward.
        const flip = kind === 'locomotive' && i > 0 ? -1 : 1;
        const color = train.colors[i] ?? 0xffffff;
        this.pools[kind].push(car.pos.x, car.pos.y, car.pos.z, car.dir.x * flip, car.dir.y * flip, car.dir.z * flip, 1, color);
      });
    }
    for (const pool of Object.values(this.pools)) pool.end();
  }
}
