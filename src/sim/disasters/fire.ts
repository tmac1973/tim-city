import { TileFlag, TileKind } from '@/shared/tiles';
import type { System } from '../scheduler';
import type { CityState } from '../state';
import { BURN_TICKS, DIRECTIONS, destroy, ignite } from './common';

/** Chance per tick a fire spreads to each flammable neighbour, without fire cover. */
export const SPREAD_CHANCE = 0.03;
/** Chance per tick fire crews, once there, put a tile out at full coverage. */
export const EXTINGUISH_CHANCE = 0.3;
/**
 * Tiles (straight line) a crew covers per tick on its way from the station:
 * at normal speed about the pace of the fire trucks on screen, which drive
 * the longer way by road.
 */
export const CREW_SPEED = 1;

/** Ticks before crews from the nearest fire station reach tile (x, y); Infinity with no station. */
export function crewDelay(stations: readonly [number, number][], x: number, y: number): number {
  let best = Infinity;
  for (const [sx, sy] of stations) best = Math.min(best, Math.hypot(sx - x, sy - y));
  return best / CREW_SPEED;
}

/**
 * Every tick, each burning tile may spread to its neighbours (less with
 * fire coverage) and burns down; a tile that burns out wrecks its whole
 * building. Once crews from the nearest fire station could have driven
 * there, they may put it out, in proportion to coverage.
 */
export function updateFires(state: CityState): void {
  if (!state.fireTicks.some((v) => v > 0)) return;
  const rng = state.random('fire');
  const cover = state.field('fireCover');
  const { size } = state;
  const stations: [number, number][] = [];
  for (let i = 0; i < size * size; i++) {
    if (state.tiles[i] === TileKind.FireStation && state.parts[i] === 1) stations.push([(i % size) + 1, Math.floor(i / size) + 1]);
  }
  for (let i = 0; i < size * size; i++) {
    const left = state.fireTicks[i] ?? 0;
    if (left === 0) continue;
    const x = i % size;
    const y = (i - x) / size;
    const protection = (cover[state.blockIndex(x, y)] ?? 0) / 255;
    const arrived = BURN_TICKS - left >= crewDelay(stations, x, y);
    if (arrived && rng.nextFloat() < protection * EXTINGUISH_CHANCE) {
      state.fireTicks[i] = 0;
      state.flags[i] = (state.flags[i] ?? 0) & ~TileFlag.BURNING;
      state.markDirty(x, y);
      continue;
    }
    for (const [dx, dy] of DIRECTIONS) {
      if (rng.nextFloat() < SPREAD_CHANCE * (1 - protection)) ignite(state, x + dx, y + dy);
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
