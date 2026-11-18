import { TICKS_PER_MONTH } from '@/shared/constants';
import { isRoad, TileFlag, TileKind, zoneOf, ZoneType } from '@/shared/tiles';
import { isTransport, stepCost, subwayCost, TRANSFER_COST } from '../graph';
import type { System } from '../scheduler';
import type { CityState } from '../state';
import { BUS_LOAD_SHARE, buildBusLanes, busLaneCost, nearStop } from './transit';
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


function reachBox(state: CityState, cx: number, cy: number, visit: (i: number) => void): void {
  const r = 1 + ROAD_REACH;
  for (let y = Math.max(0, cy - r); y <= Math.min(state.size - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(state.size - 1, cx + r); x++) visit(state.index(x, y));
  }
}

/** Rebuild state.serviceMap: per tile, the zone types whose lots lie within road reach. */
export function buildServiceMap(state: CityState): Uint8Array {
  const { size } = state;
  const map = state.serviceMap;
  map.fill(0);
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
    // Two layers of nodes: the surface, then the subway track under it (size² + tile).
    this.dist = new Float32Array(2 * size * size);
    this.parent = new Int32Array(2 * size * size);
    this.stamp = new Uint32Array(2 * size * size);
    this.blockStamp = new Uint32Array((size >> 1) * (size >> 1));
  }

  /** Add `load` once to every block holding a road tile of the path. */
  loadPath(state: CityState, path: readonly number[], load: number, traffic: Uint8Array, bus = false): void {
    this.trip++;
    // A block takes the trip's load once, from its first road tile on the path.
    for (const t of path) {
      // Underground legs add no road traffic.
      if (t >= state.size * state.size || !isRoad(state.tiles[t] ?? 0)) continue;
      const b = state.blockIndex(t % state.size, Math.floor(t / state.size));
      if (this.blockStamp[b] === this.trip) continue;
      this.blockStamp[b] = this.trip;
      // A bus leg puts a quarter of the cars on the road.
      const share = bus && state.busLane[t] === 1 ? Math.max(1, Math.floor(load * BUS_LOAD_SHARE)) : load;
      traffic[b] = Math.min(255, (traffic[b] ?? 0) + share);
    }
  }

  /** Path (tile indices, start first) to the nearest tile serving `want`, or null. */
  find(
    state: CityState,
    starts: readonly number[],
    want: number,
    service: Uint8Array,
    maxCost = MAX_TRIP_COST,
    maxExpansions = MAX_EXPANSIONS,
    busCost = 0,
  ): number[] | null {
    this.run++;
    this.heapSize = 0;
    for (const s of starts) this.visit(s, 0, -1);
    let expansions = 0;
    const total = this.size * this.size;
    const ride = subwayCost(state);
    const { subway, tiles } = state;
    while (this.heapSize > 0 && expansions < maxExpansions) {
      const [node, cost] = this.pop();
      if (cost > (this.dist[node] ?? Infinity)) continue;
      expansions++;
      const under = node >= total;
      const tile = under ? node - total : node;
      // Trips end on the surface.
      if (!under && (service[node] ?? 0) & want) return this.path(node);
      // Four neighbours, without allocating: west, east, north, south.
      const x = tile % this.size;
      for (let d = 0; d < 4; d++) {
        const n = d === 0 ? (x > 0 ? tile - 1 : -1) : d === 1 ? (x < this.size - 1 ? tile + 1 : -1) : d === 2 ? tile - this.size : tile + this.size;
        if (n < 0 || n >= total) continue;
        if (under) {
          if (subway[n] !== 1) continue;
          const next = cost + ride;
          if (next <= maxCost) this.visit(n + total, next, node);
          continue;
        }
        if (!isTransport(state, n)) continue;
        const next = cost + stepCost(state, node, n, busCost);
        if (next <= maxCost) this.visit(n, next, node);
      }
      // Down to the track, or up to the street, at a station.
      if (tiles[tile] === TileKind.SubwayStation && subway[tile] === 1) {
        const next = cost + TRANSFER_COST;
        if (next <= maxCost) this.visit(under ? tile : tile + total, next, node);
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
export function runTrip(state: CityState, i: number, loadScale = 1): boolean {
  const zone = zoneOf(state.tiles[i] ?? 0);
  if (!zone) return false;
  const service = state.serviceMap;
  let search = searches.get(state);
  if (!search) {
    search = new TripSearch(state.size);
    searches.set(state, search);
  }
  const starts: number[] = [];
  reachBox(state, i % state.size, Math.floor(i / state.size), (t) => {
    if (isTransport(state, t)) starts.push(t);
  });
  const cx = i % state.size;
  const cy = Math.floor(i / state.size);
  // Lots with a bus stop nearby can ride the bus routes.
  const bus = nearStop(state, cx, cy);
  const path = starts.length > 0 ? search.find(state, starts, WANTS[zone.type], service, MAX_TRIP_COST, MAX_EXPANSIONS, bus ? busLaneCost(state) : 0) : null;
  if (!path) return false;
  if (bus && path.some((t) => state.busLane[t] === 1)) state.busRiders++;
  if (path.some((t) => t >= state.size * state.size)) state.subwayRiders++;
  const traffic = state.field('traffic');
  const load = zone.density * TRAFFIC_PER_LEVEL * loadScale;
  // Each block the trip drives through takes its load once.
  if (load > 0) search.loadPath(state, path, load, traffic, bus);
  return true;
}

/**
 * Whether a road route from the roads around tile (cx, cy) reaches the map
 * edge (tourists arrive that way). Tourists travel farther than commuters:
 * any distance on the map, searching at most half its tiles.
 */
export function reachesEdge(state: CityState, cx: number, cy: number): boolean {
  let search = searches.get(state);
  if (!search) {
    search = new TripSearch(state.size);
    searches.set(state, search);
  }
  const starts: number[] = [];
  reachBox(state, cx, cy, (t) => {
    if (isRoad(state.tiles[t] ?? 0)) starts.push(t);
  });
  if (starts.length === 0) return false;
  // The service map marks edge roads; build it if this month's hasn't been yet.
  const edge = new Uint8Array(state.size * state.size);
  for (let k = 0; k < state.size; k++) {
    for (const i of [k, (state.size - 1) * state.size + k, k * state.size, k * state.size + state.size - 1]) edge[i] = SERVES_EDGE;
  }
  return search.find(state, starts, SERVES_EDGE, edge, Infinity, (state.size * state.size) >> 1) !== null;
}

/**
 * Months a zone waits between trips: 1 on 128 maps; 2 on larger maps,
 * where each trip carries double load so traffic levels match. It depends
 * only on the map size, so a city replays identically.
 */
export const tripPeriod = (size: number): number => (size > 128 ? 2 : 1);

/**
 * Each zone sends one trip a month (every other month on big maps), on the
 * tick given by its centre index. At the start of the month old traffic
 * fades and the service map is rebuilt for the month's trips.
 */
export const trafficSystem: System = {
  name: 'traffic',
  phaseTicks: Array.from({ length: TICKS_PER_MONTH }, (_, i) => i),
  run(state, tick) {
    if (tick === 0) {
      const traffic = state.field('traffic');
      for (let b = 0; b < traffic.length; b++) traffic[b] = Math.floor((traffic[b] ?? 0) * TRAFFIC_KEEP);
      buildServiceMap(state);
      buildBusLanes(state);
      state.busRiders = 0;
      state.subwayRiders = 0;
    }
    const { size, flags } = state;
    const period = tripPeriod(size);
    const month = state.date.year * 12 + state.date.month;
    const slot = tick + TICKS_PER_MONTH * (month % period);
    for (let i = slot; i < size * size; i += TICKS_PER_MONTH * period) {
      const f = flags[i] ?? 0;
      if (!(f & TileFlag.ZONE_CENTER)) continue;
      flags[i] = runTrip(state, i, period) ? f & ~TileFlag.TRIP_FAILED : f | TileFlag.TRIP_FAILED;
    }
  },
};
