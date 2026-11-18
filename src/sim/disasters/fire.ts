import { TileFlag } from '@/shared/tiles';
import type { System } from '../scheduler';
import type { CityState } from '../state';
import { DIRECTIONS, destroy, ignite } from './common';

/** Chance per tick a fire spreads to each flammable neighbour, without fire cover. */
export const SPREAD_CHANCE = 0.08;
/** Chance per tick fire crews put a tile out at full coverage. */
export const EXTINGUISH_CHANCE = 0.3;

/**
 * Every tick, each burning tile may be put out by fire crews (in proportion
 * to fire coverage), may spread to its neighbours (less with coverage), and
 * burns down. A tile that burns out wrecks its whole building.
 */
export function updateFires(state: CityState): void {
  const rng = state.random('fire');
  const cover = state.field('fireCover');
  const { size } = state;
  for (let i = 0; i < size * size; i++) {
    const left = state.fireTicks[i] ?? 0;
    if (left === 0) continue;
    const x = i % size;
    const y = (i - x) / size;
    const protection = (cover[state.blockIndex(x, y)] ?? 0) / 255;
    if (rng.nextFloat() < protection * EXTINGUISH_CHANCE) {
      state.fireTicks[i] = 0;
      state.flags[i] = (state.flags[i] ?? 0) & ~TileFlag.BURNING;
      state.markDirty(x, y);
      continue;
    }
    for (const [dx, dy] of DIRECTIONS) {
      if (rng.nextFloat() < SPREAD_CHANCE * (1 - protection)) ignite(state, rng, x + dx, y + dy);
    }
    state.fireTicks[i] = left - 1;
    if (left === 1) state.burnedThisYear += destroy(state, x, y);
  }
}

export const fireSystem: System = {
  name: 'fire',
  phaseTicks: Array.from({ length: 16 }, (_, i) => i),
  run: updateFires,
};
