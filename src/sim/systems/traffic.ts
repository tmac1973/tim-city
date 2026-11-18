import { TICKS_PER_MONTH } from '@/shared/constants';
import { isRoad, TileFlag, TileKind, zoneOf, ZoneType } from '@/shared/tiles';
import { isTransport, stepCost } from '../graph';
import type { System } from '../scheduler';
import type { CityState } from '../state';
import { ROAD_REACH } from './zones';

/** Trips give up beyond this travel cost. */
export const MAX_TRIP_COST = 60;
/** And after expanding this many tiles. */
const MAX_EXPANSIONS = 4000;
/** Traffic a trip adds to each road block it uses, per density level. */
export const TRAFFIC_PER_LEVEL = 4;
/** Share of last month's traffic that remains before new trips add theirs. */
const TRAFFIC_KEEP = 0.75;

const SERVES = { [ZoneType.R]: 1, [ZoneType.C]: 2, [ZoneType.I]: 4 } as const;
/** Road tiles on the map edge lead out of town, where industry exports. */
const SERVES_EDGE = 8;

/** Which destinations each zone type travels to. */
export const WANTS: Record<ZoneType, number> = {
  [ZoneType.R]: SERVES[ZoneType.C] | SERVES[ZoneType.I],
  [ZoneType.C]: SERVES[ZoneType.R],
  [ZoneType.I]: SERVES[ZoneType.R] | SERVES_EDGE,
};

/** Per-tile bits: zone types whose lots lie within road reach of the tile. */
const serviceMaps = new WeakMap<CityState, Uint8Array>();

function reachBox(state: CityState, cx: number, cy: number, visit: (i: number) => void): void {
  const r = 1 + ROAD_REACH;
  for (let y = Math.max(0, cy - r); y <= Math.min(state.size - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(state.size - 1, cx + r); x++) visit(state.index(x, y));
  }
}

export function buildServiceMap(state: CityState): Uint8Array {
  const { size } = state;
  const map = new Uint8Array(size * size);
  for (let i = 0; i < size * size; i++) {
    if (!((state.flags[i] ?? 0) & TileFlag.ZONE_CENTER)) continue;
    const zone = zoneOf(state.tiles[i] ?? 0);
    if (!zone) continue;
    const bit = SERVES[zone.type];
    reachBox(state, i % size, Math.floor(i / size), (t) => (map[t] = (map[t] ?? 0) | bit));
  }
  for (let k = 0; k < size; k++) {
    for (const i of [k, (size - 1) * size + k, k * size, k * size + size - 1]) map[i] = (map[i] ?? 0) | SERVES_EDGE;
  }
  // A powered seaport is a way out for goods too.
  for (let i = 0; i < size * size; i++) {
    if (state.tiles[i] !== TileKind.Seaport || state.parts[i] !== 1) continue;
    if (!((state.flags[i] ?? 0) & TileFlag.POWERED)) continue;
    reachBox(state, (i % size) + 1, Math.floor(i / size) + 1, (t) => (map[t] = (map[t] ?? 0) | SERVES_EDGE));
  }
  serviceMaps.set(state, map);
  return map;
}

/** Uniform-cost search with buffers reused between trips. */
class TripSearch {
  private readonly dist: Float32Array;
  private readonly parent: Int32Array;
  private readonly stamp: Uint32Array;
  private run = 0;
  private heapNode = new Int32Array(1024);
  private heapCost = new Float32Array(1024);
  private heapSize = 0;
  /** Per 2×2 block: the trip that last loaded it, to load each block once per trip. */
  private readonly blockStamp: Uint32Array;
  private trip = 0;

  constructor(private readonly size: number) {
    this.dist = new Float32Array(size * size);
    this.parent = new Int32Array(size * size);
    this.stamp = new Uint32Array(size * size);
    this.blockStamp = new Uint32Array((size >> 1) * (size >> 1));
  }

  /** Add `load` once to every block holding a road tile of the path. */
  loadPath(state: CityState, path: readonly number[], load: number, traffic: Uint8Array): void {
    this.trip++;
    for (const t of path) {
      if (!isRoad(state.tiles[t] ?? 0)) continue;
      const b = state.blockIndex(t % state.size, Math.floor(t / state.size));
      if (this.blockStamp[b] === this.trip) continue;
      this.blockStamp[b] = this.trip;
      traffic[b] = Math.min(255, (traffic[b] ?? 0) + load);
    }
  }

  /** Path (tile indices, start first) to the nearest tile serving `want`, or null. */
  find(state: CityState, starts: readonly number[], want: number, service: Uint8Array): number[] | null {
    this.run++;
    this.heapSize = 0;
    for (const s of starts) this.visit(s, 0, -1);
    let expansions = 0;
    while (this.heapSize > 0 && expansions < MAX_EXPANSIONS) {
      const [node, cost] = this.pop();
      if (cost > (this.dist[node] ?? Infinity)) continue;
      expansions++;
      if ((service[node] ?? 0) & want) return this.path(node);
      // Four neighbours, without allocating: west, east, north, south.
      const x = node % this.size;
      const total = this.size * this.size;
      for (let d = 0; d < 4; d++) {
        const n = d === 0 ? (x > 0 ? node - 1 : -1) : d === 1 ? (x < this.size - 1 ? node + 1 : -1) : d === 2 ? node - this.size : node + this.size;
        if (n < 0 || n >= total || !isTransport(state, n)) continue;
        const next = cost + stepCost(state, node, n);
        if (next <= MAX_TRIP_COST) this.visit(n, next, node);
      }
    }
    return null;
  }

  private visit(node: number, cost: number, from: number): void {
    if (this.stamp[node] === this.run && cost >= (this.dist[node] ?? Infinity)) return;
    this.stamp[node] = this.run;
    this.dist[node] = cost;
    this.parent[node] = from;
    this.push(node, cost);
  }

  private path(end: number): number[] {
    const out: number[] = [];
    for (let n = end; n >= 0; n = this.parent[n] ?? -1) out.push(n);
    return out.reverse();
  }

  private push(node: number, cost: number): void {
    if (this.heapSize === this.heapNode.length) {
      const nodes = new Int32Array(this.heapSize * 2);
      nodes.set(this.heapNode);
      const costs = new Float32Array(this.heapSize * 2);
      costs.set(this.heapCost);
      this.heapNode = nodes;
      this.heapCost = costs;
    }
    let i = this.heapSize++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if ((this.heapCost[p] ?? 0) <= cost) break;
      this.heapNode[i] = this.heapNode[p] ?? 0;
      this.heapCost[i] = this.heapCost[p] ?? 0;
      i = p;
    }
    this.heapNode[i] = node;
    this.heapCost[i] = cost;
  }

  private pop(): [number, number] {
    const node = this.heapNode[0] ?? 0;
    const cost = this.heapCost[0] ?? 0;
    const lastNode = this.heapNode[--this.heapSize] ?? 0;
    const lastCost = this.heapCost[this.heapSize] ?? 0;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      if (l >= this.heapSize) break;
      const r = l + 1;
      const c = r < this.heapSize && (this.heapCost[r] ?? 0) < (this.heapCost[l] ?? 0) ? r : l;
      if ((this.heapCost[c] ?? 0) >= lastCost) break;
      this.heapNode[i] = this.heapNode[c] ?? 0;
      this.heapCost[i] = this.heapCost[c] ?? 0;
      i = c;
    }
    this.heapNode[i] = lastNode;
    this.heapCost[i] = lastCost;
    return [node, cost];
  }
}

const searches = new WeakMap<CityState, TripSearch>();

/**
 * Send one trip from the zone centred on tile `i`. Returns whether a
 * destination was reached; on success the road blocks along the way gain
 * traffic in proportion to the zone's density.
 */
export function runTrip(state: CityState, i: number): boolean {
  const zone = zoneOf(state.tiles[i] ?? 0);
  if (!zone) return false;
  const service = serviceMaps.get(state) ?? buildServiceMap(state);
  let search = searches.get(state);
  if (!search) {
    search = new TripSearch(state.size);
    searches.set(state, search);
  }
  const starts: number[] = [];
  reachBox(state, i % state.size, Math.floor(i / state.size), (t) => {
    if (isTransport(state, t)) starts.push(t);
  });
  const path = starts.length > 0 ? search.find(state, starts, WANTS[zone.type], service) : null;
  if (!path) return false;
  const traffic = state.field('traffic');
  const load = zone.density * TRAFFIC_PER_LEVEL;
  // Each block the trip drives through takes its load once.
  if (load > 0) search.loadPath(state, path, load, traffic);
  return true;
}

/**
 * Each zone sends one trip a month, on the tick given by its centre index.
 * At the start of the month old traffic fades and the service map is
 * rebuilt for the month's trips.
 */
export const trafficSystem: System = {
  name: 'traffic',
  phaseTicks: Array.from({ length: TICKS_PER_MONTH }, (_, i) => i),
  run(state, tick) {
    if (tick === 0) {
      const traffic = state.field('traffic');
      for (let b = 0; b < traffic.length; b++) traffic[b] = Math.floor((traffic[b] ?? 0) * TRAFFIC_KEEP);
      buildServiceMap(state);
    }
    const { size, flags } = state;
    for (let i = tick; i < size * size; i += TICKS_PER_MONTH) {
      const f = flags[i] ?? 0;
      if (!(f & TileFlag.ZONE_CENTER)) continue;
      flags[i] = runTrip(state, i) ? f & ~TileFlag.TRIP_FAILED : f | TileFlag.TRIP_FAILED;
    }
  },
};
