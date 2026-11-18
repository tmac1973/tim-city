import type { ActiveDisaster } from '@/shared/protocol';
import { PLANT_SIZE, TileKind } from '@/shared/tiles';
import type { Rng } from '../rng';
import type { System } from '../scheduler';
import type { CityState } from '../state';
import { clearPart, footprintAt } from '../tools/footprint';
import { begin, originsOf } from './common';

export const MELTDOWN_RADIUS = 8;
export const RADIATION_YEARS = 50;

/**
 * A nuclear plant melts down: every land tile within 8 tiles becomes
 * radioactive (buildings cut by the edge fall to rubble), and the water
 * there is poisoned too, for 50 years.
 */
export function startMeltdown(state: CityState, rng: Rng): ActiveDisaster | null {
  const plants = originsOf(state, TileKind.NuclearPlant);
  const origin = plants[rng.nextInt(plants.length)];
  if (origin === undefined) return null;
  const cx = (origin % state.size) + PLANT_SIZE / 2;
  const cy = Math.floor(origin / state.size) + PLANT_SIZE / 2;
  const r = MELTDOWN_RADIUS;
  for (let y = Math.floor(cy - r); y <= cy + r; y++) {
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if (!state.inBounds(x, y) || Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > r) continue;
      const i = state.index(x, y);
      // Buildings that straddle the edge: the part outside becomes rubble.
      const lot = footprintAt(state, x, y);
      if (lot) {
        for (let dy = 0; dy < lot.size; dy++) {
          for (let dx = 0; dx < lot.size; dx++) {
            const t = state.index(lot.x + dx, lot.y + dy);
            state.tiles[t] = TileKind.Rubble;
            clearPart(state, t);
            state.flags[t] = 0;
            state.fireTicks[t] = 0;
            state.markDirtyAround(lot.x + dx, lot.y + dy);
          }
        }
      }
      if (state.tiles[i] !== TileKind.Water) {
        state.tiles[i] = TileKind.Radiation;
        state.flags[i] = 0;
        state.fireTicks[i] = 0;
      }
      state.radiation.set(i, RADIATION_YEARS);
      state.markDirtyAround(x, y);
    }
  }
  return begin(state, 'meltdown', Math.floor(cx), Math.floor(cy), 16);
}

/** At each year end, contamination fades by a year; clean land becomes empty again. */
export const radiationSystem: System = {
  name: 'radiation',
  phaseTicks: [15],
  run(state) {
    if (state.date.month !== 11 || state.radiation.size === 0) return;
    for (const [i, years] of state.radiation) {
      if (years > 1) {
        state.radiation.set(i, years - 1);
        continue;
      }
      state.radiation.delete(i);
      if (state.tiles[i] === TileKind.Radiation) {
        state.tiles[i] = TileKind.Empty;
        state.markDirtyAround(i % state.size, Math.floor(i / state.size));
      }
    }
  },
};
