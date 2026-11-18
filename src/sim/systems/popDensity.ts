import { TileFlag, zoneOf, ZoneType } from '@/shared/tiles';
import type { System } from '../scheduler';
import type { CityState } from '../state';
import { blockGeometry, blur, store } from './fields';
import { RESIDENTS_PER_LEVEL } from './zones';

/** Monthly residents per block, smoothed by one box blur. */
export function updatePopDensity(state: CityState): void {
  const { side } = blockGeometry(state);
  const acc = new Float32Array(side * side);
  const { size, tiles, flags } = state;
  for (let i = 0; i < size * size; i++) {
    if (!((flags[i] ?? 0) & TileFlag.ZONE_CENTER)) continue;
    const zone = zoneOf(tiles[i] ?? 0);
    if (zone?.type !== ZoneType.R) continue;
    const b = state.blockIndex(i % size, Math.floor(i / size));
    acc[b] = (acc[b] ?? 0) + zone.density * RESIDENTS_PER_LEVEL;
  }
  store(state.field('popDensity'), blur(acc, side));
}

/**
 * Monthly growth per block: 128 means no change, higher is growing, lower
 * is shrinking (two points per resident of change in density).
 */
export function updateGrowth(state: CityState): void {
  const now = state.field('popDensity');
  const prev = state.field('popPrev');
  const growth = state.field('growth');
  for (let b = 0; b < now.length; b++) {
    growth[b] = Math.min(255, Math.max(0, 128 + 2 * ((now[b] ?? 0) - (prev[b] ?? 0))));
    prev[b] = now[b] ?? 0;
  }
}

export const popDensitySystem: System = { name: 'popDensity', phaseTicks: [10], run: updatePopDensity };
export const growthSystem: System = { name: 'growth', phaseTicks: [12], run: updateGrowth };
