import { isPark, TileFlag, TileKind, zoneOf, ZoneType } from '@/shared/tiles';
import type { System } from '../scheduler';
import type { CityState } from '../state';
import { blockGeometry, blur, store } from './fields';

/** Pollution a coal plant puts into its block before spreading. */
export const COAL_POLLUTION = 255;
const INDUSTRY_PER_LEVEL = 20;
const PARK_CLEANING = 30;
const TREE_CLEANING = 5;

/**
 * Monthly pollution: industry by density, coal plants and half of each
 * block's traffic pollute; parks and trees clean; then it spreads by one
 * box blur.
 */
export function updatePollution(state: CityState): void {
  const { side } = blockGeometry(state);
  const acc = new Float32Array(side * side);
  const traffic = state.field('traffic');
  for (let b = 0; b < acc.length; b++) acc[b] = (traffic[b] ?? 0) / 2;

  const { size, tiles, flags, parts } = state;
  for (let i = 0; i < size * size; i++) {
    const kind = tiles[i] ?? 0;
    const x = i % size;
    const y = (i - x) / size;
    const b = state.blockIndex(x, y);
    if ((flags[i] ?? 0) & TileFlag.ZONE_CENTER) {
      const zone = zoneOf(kind);
      if (zone?.type === ZoneType.I) acc[b] = (acc[b] ?? 0) + INDUSTRY_PER_LEVEL * zone.density;
    } else if (kind === TileKind.CoalPlant && parts[i] === 1) {
      const c = state.blockIndex(x + 2, y + 2);
      acc[c] = (acc[c] ?? 0) + COAL_POLLUTION;
    } else if (isPark(kind)) {
      acc[b] = (acc[b] ?? 0) - PARK_CLEANING;
    } else if (kind === TileKind.Tree) {
      acc[b] = (acc[b] ?? 0) - TREE_CLEANING;
    }
  }
  for (let b = 0; b < acc.length; b++) acc[b] = Math.max(0, acc[b] ?? 0);
  store(state.field('pollution'), blur(acc, side));
}

export const pollutionSystem: System = { name: 'pollution', phaseTicks: [2], run: updatePollution };
