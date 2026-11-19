import type { ActiveDisaster } from '@/shared/protocol';
import { AIRPORT_SIZE, isBridge, SEAPORT_SIZE, TileKind } from '@/shared/tiles';
import type { Rng } from '../rng';
import type { CityState } from '../state';
import { begin, DIRECTIONS, destroy, ignite, isLand, originsOf } from './common';

const CRASH_RANGE = 20;
const WRECK_RANGE = 12;
export const SPILL_POLLUTION = 200;
export const SPILL_MONTHS = 12;

function pick<T>(rng: Rng, list: readonly T[]): T | undefined {
  return list[rng.nextInt(list.length)];
}

/** A plane comes down within 20 tiles of an airport: a 3×3 wreck and fire. */
export function startPlaneCrash(state: CityState, rng: Rng): ActiveDisaster | null {
  const airport = pick(rng, originsOf(state, TileKind.Airport));
  if (airport === undefined) return null;
  const ax = (airport % state.size) + AIRPORT_SIZE / 2;
  const ay = Math.floor(airport / state.size) + AIRPORT_SIZE / 2;
  for (let attempt = 0; attempt < 50; attempt++) {
    const x = Math.round(ax + (rng.nextFloat() * 2 - 1) * CRASH_RANGE);
    const y = Math.round(ay + (rng.nextFloat() * 2 - 1) * CRASH_RANGE);
    if (!state.inBounds(x, y) || !isLand(state, state.index(x, y))) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) destroy(state, x + dx, y + dy);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (rng.nextFloat() < 0.5) ignite(state, x + dx, y + dy);
    return begin(state, 'planeCrash', x, y, 16);
  }
  return null;
}

/**
 * A ship near a seaport hits a bridge (taking out the whole span) or runs
 * aground on the shore; either way it spills oil for a year.
 */
export function startShipwreck(state: CityState, rng: Rng): ActiveDisaster | null {
  const port = pick(rng, originsOf(state, TileKind.Seaport));
  if (port === undefined) return null;
  const px = (port % state.size) + SEAPORT_SIZE / 2;
  const py = Math.floor(port / state.size) + SEAPORT_SIZE / 2;
  const bridges: number[] = [];
  const shore: number[] = [];
  for (let y = Math.floor(py - WRECK_RANGE); y <= py + WRECK_RANGE; y++) {
    for (let x = Math.floor(px - WRECK_RANGE); x <= px + WRECK_RANGE; x++) {
      if (!state.inBounds(x, y)) continue;
      const i = state.index(x, y);
      const kind = state.tiles[i] ?? 0;
      if (isBridge(kind)) bridges.push(i);
      else if (
        isLand(state, i) &&
        kind !== TileKind.Seaport &&
        DIRECTIONS.some(([dx, dy]) => state.inBounds(x + dx, y + dy) && state.tiles[state.index(x + dx, y + dy)] === TileKind.Water)
      ) {
        shore.push(i);
      }
    }
  }
  const target = bridges.length > 0 ? pick(rng, bridges) : pick(rng, shore);
  if (target === undefined) return null;
  const x = target % state.size;
  const y = Math.floor(target / state.size);
  if (bridges.length > 0) {
    // The whole span between the banks goes down.
    const kind = state.tiles[target];
    const queue = [target];
    const seen = new Set(queue);
    while (queue.length > 0) {
      const i = queue.pop() ?? 0;
      destroy(state, i % state.size, Math.floor(i / state.size));
      for (const [dx, dy] of DIRECTIONS) {
        const nx = (i % state.size) + dx;
        const ny = Math.floor(i / state.size) + dy;
        if (!state.inBounds(nx, ny)) continue;
        const n = state.index(nx, ny);
        if (!seen.has(n) && state.tiles[n] === kind) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
  } else {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) destroy(state, x + dx, y + dy);
  }
  state.pollutionSpills.push({ x, y, monthsLeft: SPILL_MONTHS });
  return begin(state, 'shipwreck', x, y, 16);
}
