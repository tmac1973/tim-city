import { isPark, TileFlag, TileKind, zoneOf, ZoneType } from '@/shared/tiles';
import type { System } from '../scheduler';
import type { CityState } from '../state';
import { blockGeometry, countAround, store } from './fields';
import { RESIDENTS_PER_LEVEL } from './zones';

/** Population-weighted centre of the city, or the map centre before anyone lives there. */
export function cityCentre(state: CityState): [number, number] {
  let sx = 0;
  let sy = 0;
  let total = 0;
  const { size, tiles, flags } = state;
  for (let i = 0; i < size * size; i++) {
    if (!((flags[i] ?? 0) & TileFlag.ZONE_CENTER)) continue;
    const zone = zoneOf(tiles[i] ?? 0);
    if (zone?.type !== ZoneType.R || zone.density === 0) continue;
    const w = zone.density * RESIDENTS_PER_LEVEL;
    sx += (i % size) * w;
    sy += Math.floor(i / size) * w;
    total += w;
  }
  return total > 0 ? [sx / total, sy / total] : [size / 2, size / 2];
}

/**
 * Monthly land value per block:
 *   128 − 1.5 × distance to the city centre
 *   + 30 with water within 3 tiles, + 5 per tree within 2 tiles (at most 40)
 *   + 40 with a park within 4 tiles, + 3 per step of height
 *   − half of pollution and crime.
 */
export function updateLandValue(state: CityState): void {
  const { side, centre } = blockGeometry(state);
  const [cx, cy] = cityCentre(state);
  const pollution = state.field('pollution');
  const crime = state.field('crime');
  const values = new Float32Array(side * side);
  for (let b = 0; b < values.length; b++) {
    const [tx, ty] = centre(b);
    let v = 128 - 1.5 * Math.hypot(tx - cx, ty - cy);
    if (countAround(state, tx, ty, 3, (k) => k === TileKind.Water) > 0) v += 30;
    v += Math.min(40, 5 * countAround(state, tx, ty, 2, (k) => k === TileKind.Tree));
    if (countAround(state, tx, ty, 4, isPark) > 0) v += 40;
    v += 3 * (state.heights[state.cornerIndex(tx, ty)] ?? 0);
    v -= (pollution[b] ?? 0) / 2 + (crime[b] ?? 0) / 2;
    values[b] = v;
  }
  store(state.field('landValue'), values);
}

export const landValueSystem: System = { name: 'landValue', phaseTicks: [4], run: updateLandValue };
