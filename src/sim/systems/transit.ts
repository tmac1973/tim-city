import { isRoad, TileKind } from '@/shared/tiles';
import type { CityState } from '../state';

/** Two stops are linked when one's road is within this many road tiles of the other's. */
export const BUS_LINK_TILES = 12;
/** A lot rides the bus when a stop lies within this many tiles of its edge. */
export const BUS_BOARD_TILES = 4;
/** Share of the road cost a bus lane saves at full transit funding. */
export const BUS_LANE_DISCOUNT = 0.4;
/** Share of a trip's car load a bus leg adds to the road. */
export const BUS_LOAD_SHARE = 0.25;

/** The road a stop serves: its first road neighbour west, east, north or south; -1 if none. */
export function stopEntry(size: number, tiles: ArrayLike<number>, i: number): number {
  const x = i % size;
  for (const n of [x > 0 ? i - 1 : -1, x < size - 1 ? i + 1 : -1, i - size, i + size]) {
    if (n >= 0 && n < size * size && isRoad(tiles[n] ?? 0)) return n;
  }
  return -1;
}

export interface BusNetwork {
  /** Stop tile pairs (lower index first) joined by a bus route. */
  links: [number, number][];
  /** Road tile indices of each link's route, entry to entry. */
  routes: number[][];
}

/**
 * Bus routes: from each stop's road, a breadth-first search over road tiles
 * up to BUS_LINK_TILES steps; every other stop whose road it reaches is
 * linked, along the path found. Works on any tile grid, so the renderer
 * can draw buses on the same routes the sim uses.
 */
export function findBusNetwork(size: number, tiles: ArrayLike<number>): BusNetwork {
  const stops: number[] = [];
  for (let i = 0; i < size * size; i++) if (tiles[i] === TileKind.BusStop) stops.push(i);
  const entries = stops.map((s) => stopEntry(size, tiles, s));
  const byEntry = new Map<number, number[]>();
  entries.forEach((e, k) => {
    if (e < 0) return;
    const list = byEntry.get(e) ?? [];
    list.push(k);
    byEntry.set(e, list);
  });
  const links: [number, number][] = [];
  const routes: number[][] = [];
  const parent = new Int32Array(size * size);
  const stamp = new Uint32Array(size * size);
  const depth = new Uint8Array(size * size);
  let run = 0;
  stops.forEach((stop, a) => {
    const from = entries[a] ?? -1;
    if (from < 0) return;
    run++;
    stamp[from] = run;
    parent[from] = -1;
    depth[from] = 0;
    const queue = [from];
    for (let q = 0; q < queue.length; q++) {
      const t = queue[q] ?? 0;
      for (const b of byEntry.get(t) ?? []) {
        const other = stops[b] ?? 0;
        if (other <= stop) continue;
        const route: number[] = [];
        for (let p = t; p >= 0; p = parent[p] ?? -1) route.push(p);
        links.push([stop, other]);
        routes.push(route.reverse());
      }
      if ((depth[t] ?? 0) >= BUS_LINK_TILES) continue;
      const x = t % size;
      for (const n of [x > 0 ? t - 1 : -1, x < size - 1 ? t + 1 : -1, t - size, t + size]) {
        if (n < 0 || n >= size * size || stamp[n] === run || !isRoad(tiles[n] ?? 0)) continue;
        stamp[n] = run;
        parent[n] = t;
        depth[n] = (depth[t] ?? 0) + 1;
        queue.push(n);
      }
    }
  });
  return { links, routes };
}

/** Rebuild the bus lanes (the road tiles on any route) and the stop count. */
export function buildBusLanes(state: CityState): void {
  const lanes = state.busLane;
  lanes.fill(0);
  const network = findBusNetwork(state.size, state.tiles);
  for (const route of network.routes) for (const t of route) lanes[t] = 1;
  state.busLinks = network.links;
}

/** Whether a bus stop lies within BUS_BOARD_TILES of the 3×3 lot centred on (cx, cy). */
export function nearStop(state: CityState, cx: number, cy: number): boolean {
  const r = 1 + BUS_BOARD_TILES;
  for (let y = Math.max(0, cy - r); y <= Math.min(state.size - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(state.size - 1, cx + r); x++) {
      if (state.tiles[state.index(x, y)] === TileKind.BusStop) return true;
    }
  }
  return false;
}

/** The cost of a bus-lane step at the city's transit funding. */
export const busLaneCost = (state: CityState): number => 1 - (BUS_LANE_DISCOUNT * state.funding.transit) / 100;
