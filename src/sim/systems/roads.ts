import { TileFlag, TileKind } from '@/shared/tiles';
import type { System } from '../scheduler';
import type { CityState } from '../state';

/**
 * Monthly road wear. Below full road funding, a share of plain road tiles
 * ((100 − funding) / 400 of them) is hit each month: a sound tile gets
 * potholes, an already potholed tile crumbles to rubble.
 */
export function updateRoads(state: CityState): void {
  const share = (100 - state.funding.road) / 400;
  if (share <= 0) return;
  const roads: number[] = [];
  const { size, tiles } = state;
  for (let i = 0; i < size * size; i++) {
    const kind = tiles[i] ?? 0;
    if (kind === TileKind.Road || kind === TileKind.RoadPower) roads.push(i);
  }
  const rng = state.random('roads');
  const expected = roads.length * share;
  // Whole tiles, plus one more with the leftover fraction as its chance.
  const hits = Math.floor(expected) + (rng.nextFloat() < expected % 1 ? 1 : 0);
  for (let n = 0; n < hits && roads.length > 0; n++) {
    const pick = rng.nextInt(roads.length);
    const i = roads[pick] ?? 0;
    roads.splice(pick, 1);
    const x = i % size;
    const y = (i - x) / size;
    if ((state.flags[i] ?? 0) & TileFlag.POTHOLED) {
      state.tiles[i] = TileKind.Rubble;
      state.flags[i] = 0;
    } else {
      state.flags[i] = (state.flags[i] ?? 0) | TileFlag.POTHOLED;
    }
    state.markDirtyAround(x, y);
  }
}

export const roadsSystem: System = { name: 'roads', phaseTicks: [14], run: updateRoads };
