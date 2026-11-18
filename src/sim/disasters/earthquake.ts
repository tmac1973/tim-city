import type { ActiveDisaster } from '@/shared/protocol';
import { isRoad, TileFlag } from '@/shared/tiles';
import type { Rng } from '../rng';
import type { CityState } from '../state';
import { begin, destroy, ignite, isLand, randomTile } from './common';

export const QUAKE_RADIUS = 15;

/**
 * Within 15 tiles of the epicentre, each tile has a 15% chance to collapse
 * and a 3% chance to catch fire; every road cracks into potholes.
 */
export function startEarthquake(state: CityState, rng: Rng): ActiveDisaster | null {
  const at = randomTile(state, rng, (i) => isLand(state, i));
  if (!at) return null;
  const [cx, cy] = at;
  for (let y = cy - QUAKE_RADIUS; y <= cy + QUAKE_RADIUS; y++) {
    for (let x = cx - QUAKE_RADIUS; x <= cx + QUAKE_RADIUS; x++) {
      if (!state.inBounds(x, y) || Math.hypot(x - cx, y - cy) > QUAKE_RADIUS) continue;
      const i = state.index(x, y);
      if (isRoad(state.tiles[i] ?? 0)) {
        state.flags[i] = (state.flags[i] ?? 0) | TileFlag.POTHOLED;
        state.markDirty(x, y);
      }
      const roll = rng.nextFloat();
      if (roll < 0.15) destroy(state, x, y);
      else if (roll < 0.18) ignite(state, rng, x, y);
    }
  }
  // Stays "active" briefly so the renderer can shake the camera.
  return begin(state, 'earthquake', cx, cy, 16);
}
