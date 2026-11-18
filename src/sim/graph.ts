import { isRail, isRoad, isTransportKind, TileFlag } from '@/shared/tiles';
import type { CityState } from './state';

/** Cost of moving one tile by road. */
export const ROAD_COST = 1;
/** Rail is fast: trains carry trips at under half the cost of driving. */
export const RAIL_COST = 0.4;
/** Changing between road and rail (at any rail tile beside a road). */
export const TRANSFER_COST = 2;

/**
 * Cost to move from tile `a` to its neighbour `b` on the transport network,
 * or Infinity if they are not connected. Neighbours are read straight from
 * the tiles, so the network is always current without a separate graph to
 * patch.
 */
export function stepCost(state: CityState, a: number, b: number, busCost = 0): number {
  const ka = state.tiles[a] ?? 0;
  const kb = state.tiles[b] ?? 0;
  let best = Infinity;
  if (isRoad(ka) && isRoad(kb)) {
    // Potholes on either tile double the cost of driving between them.
    const worn = ((state.flags[a] ?? 0) | (state.flags[b] ?? 0)) & TileFlag.POTHOLED;
    // On a bus route, a trip that boards the bus moves more cheaply.
    const base = busCost > 0 && state.busLane[a] === 1 && state.busLane[b] === 1 ? busCost : ROAD_COST;
    best = worn ? 2 * base : base;
  }
  if (isRail(ka) && isRail(kb)) best = Math.min(best, RAIL_COST);
  if (best === Infinity && (isRoad(ka) || isRail(ka)) && (isRoad(kb) || isRail(kb))) best = TRANSFER_COST;
  return best;
}

export function isTransport(state: CityState, i: number): boolean {
  return isTransportKind(state.tiles[i] ?? 0);
}
