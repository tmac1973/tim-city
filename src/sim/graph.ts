import { isRail, isRoad, TileFlag } from '@/shared/tiles';
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
export function stepCost(state: CityState, a: number, b: number): number {
  const ka = state.tiles[a] ?? 0;
  const kb = state.tiles[b] ?? 0;
  let best = Infinity;
  if (isRoad(ka) && isRoad(kb)) {
    // Potholes on either tile double the cost of driving between them.
    const worn = ((state.flags[a] ?? 0) | (state.flags[b] ?? 0)) & TileFlag.POTHOLED;
    best = worn ? 2 * ROAD_COST : ROAD_COST;
  }
  if (isRail(ka) && isRail(kb)) best = Math.min(best, RAIL_COST);
  if (best === Infinity && (isRoad(ka) || isRail(ka)) && (isRoad(kb) || isRail(kb))) best = TRANSFER_COST;
  return best;
}

export function isTransport(state: CityState, i: number): boolean {
  const k = state.tiles[i] ?? 0;
  return isRoad(k) || isRail(k);
}
