import type { ActiveDisaster } from '@/shared/protocol';
import type { Rng } from '../rng';
import type { CityState } from '../state';
import { begin, DIRECTIONS, destroy, isLand, randomTile } from './common';

/** A twister touches down on land and wanders for 40–80 ticks, flattening a 3×3 swath. */
export function startTornado(state: CityState, rng: Rng): ActiveDisaster | null {
  const at = randomTile(state, rng, (i) => isLand(state, i));
  return at ? begin(state, 'tornado', at[0], at[1], 40 + rng.nextInt(41), rng.nextInt(4)) : null;
}

/** Returns true when the tornado leaves the map. */
export function stepTornado(state: CityState, d: ActiveDisaster, rng: Rng): boolean {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) destroy(state, d.x + dx, d.y + dy);
  // Mostly straight, sometimes veering left or right.
  const turn = rng.nextFloat();
  if (turn < 0.125) d.heading = (d.heading + 3) % 4;
  else if (turn < 0.25) d.heading = (d.heading + 1) % 4;
  const [mx, my] = DIRECTIONS[d.heading] ?? [0, 0];
  d.x += mx;
  d.y += my;
  return !state.inBounds(d.x, d.y);
}
