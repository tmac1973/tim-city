import type { ActiveDisaster } from '@/shared/protocol';
import { TileKind } from '@/shared/tiles';
import type { Rng } from '../rng';
import type { CityState } from '../state';
import { begin, destroy, ignite } from './common';

/** Mean pollution over populated blocks above which the Mirebeast may stir on its own. */
export const MIREBEAST_POLLUTION = 120;
const MIREBEAST_TICKS = 120;

export function meanPopulatedPollution(state: CityState): number {
  const density = state.field('popDensity');
  const pollution = state.field('pollution');
  let sum = 0;
  let n = 0;
  for (let b = 0; b < density.length; b++) {
    if ((density[b] ?? 0) === 0) continue;
    sum += pollution[b] ?? 0;
    n++;
  }
  return n === 0 ? 0 : sum / n;
}

/** The most polluted block's centre tile (the map centre if the air is clean). */
function pollutionPeak(state: CityState): [number, number] {
  const pollution = state.field('pollution');
  const side = state.size >> 1;
  let best = -1;
  let at: [number, number] = [state.size >> 1, state.size >> 1];
  for (let b = 0; b < pollution.length; b++) {
    if ((pollution[b] ?? 0) > best) {
      best = pollution[b] ?? 0;
      at = [(b % side) * 2 + 1, Math.floor(b / side) * 2 + 1];
    }
  }
  return at;
}

/**
 * The Mirebeast rises from the water nearest the worst pollution and
 * lumbers towards it, crushing a 2×2 path and setting fires, for 120 ticks
 * or until it walks off the map.
 */
export function startMirebeast(state: CityState): ActiveDisaster | null {
  const [tx, ty] = pollutionPeak(state);
  let best = Infinity;
  let at: [number, number] | null = null;
  for (let i = 0; i < state.size * state.size; i++) {
    if (state.tiles[i] !== TileKind.Water) continue;
    const x = i % state.size;
    const y = (i - x) / state.size;
    const d = Math.hypot(x - tx, y - ty);
    if (d < best) {
      best = d;
      at = [x, y];
    }
  }
  if (!at) return null;
  const d = begin(state, 'mirebeast', at[0], at[1], MIREBEAST_TICKS);
  d.targetX = tx;
  d.targetY = ty;
  return d;
}

/** Returns true when the beast leaves the map. */
export function stepMirebeast(state: CityState, d: ActiveDisaster, rng: Rng): boolean {
  if (d.age % 2 !== 0) return false;
  for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) destroy(state, d.x + dx, d.y + dy);
  for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) if (rng.nextFloat() < 0.1) ignite(state, d.x + dx, d.y + dy);
  // Head for the target; once there, keep going the same way until off the map.
  const ex = d.targetX - d.x;
  const ey = d.targetY - d.y;
  if (ex === 0 && ey === 0) {
    d.targetX += d.targetX - (state.size >> 1) >= 0 ? state.size : -state.size;
    return false;
  }
  if (Math.abs(ex) >= Math.abs(ey)) {
    d.x += Math.sign(ex);
    d.heading = ex > 0 ? 1 : 3;
  } else {
    d.y += Math.sign(ey);
    d.heading = ey > 0 ? 2 : 0;
  }
  return !state.inBounds(d.x, d.y);
}
