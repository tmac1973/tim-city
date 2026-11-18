import { SEA_LEVEL } from '@/shared/constants';
import type { ActiveDisaster } from '@/shared/protocol';
import { TileFlag, TileKind, zoneKind, zoneOf } from '@/shared/tiles';
import type { Rng } from '../rng';
import type { CityState } from '../state';
import { footprintAt, placeFootprint } from '../tools/footprint';
import { corners } from '../tools/plan';
import { begin, DIRECTIONS, randomTile } from './common';

/** Ticks the water rises (two months), then the ticks it takes to recede. */
export const FLOOD_RISE = 32;
const FLOOD_RECEDE = 16;
const FLOOD_REACH = 14;
const SPREAD = 0.35;

/** Low land floods: tiles whose lowest corner is at most one step above the sea. */
function lowLying(state: CityState, x: number, y: number): boolean {
  return Math.min(...corners(state, x, y)) <= SEA_LEVEL + 1;
}

export function startFlood(state: CityState, rng: Rng): ActiveDisaster | null {
  // Water next to low dry land: a coast or riverbank.
  const at = randomTile(state, rng, (i) => {
    if (state.tiles[i] !== TileKind.Water) return false;
    const x = i % state.size;
    const y = (i - x) / state.size;
    return DIRECTIONS.some(([dx, dy]) => {
      const nx = x + dx;
      const ny = y + dy;
      return state.inBounds(nx, ny) && state.tiles[state.index(nx, ny)] !== TileKind.Water && lowLying(state, nx, ny);
    });
  });
  return at ? begin(state, 'flood', at[0], at[1], FLOOD_RISE + FLOOD_RECEDE) : null;
}

export function stepFlood(state: CityState, d: ActiveDisaster, rng: Rng): void {
  const r = FLOOD_REACH;
  const flooded = (x: number, y: number) =>
    state.inBounds(x, y) &&
    (state.tiles[state.index(x, y)] === TileKind.Water || ((state.flags[state.index(x, y)] ?? 0) & TileFlag.FLOODED) !== 0);
  for (let y = Math.max(0, d.y - r); y <= Math.min(state.size - 1, d.y + r); y++) {
    for (let x = Math.max(0, d.x - r); x <= Math.min(state.size - 1, d.x + r); x++) {
      const i = state.index(x, y);
      const f = state.flags[i] ?? 0;
      if (d.age < FLOOD_RISE) {
        if (f & TileFlag.FLOODED || state.tiles[i] === TileKind.Water || !lowLying(state, x, y)) continue;
        if (!DIRECTIONS.some(([dx, dy]) => flooded(x + dx, y + dy)) || rng.nextFloat() >= SPREAD) continue;
        state.flags[i] = f | TileFlag.FLOODED;
        state.fireTicks[i] = 0;
        state.flags[i] = (state.flags[i] ?? 0) & ~TileFlag.BURNING;
        state.markDirty(x, y);
        // Flooded homes and businesses lose a level, once, when water reaches their centre.
        if (f & TileFlag.ZONE_CENTER) {
          const zone = zoneOf(state.tiles[i] ?? 0);
          const lot = footprintAt(state, x, y);
          if (zone && lot && zone.density > 0) placeFootprint(state, lot.x, lot.y, zoneKind(zone.type, zone.density - 1, zone.landValueClass));
        }
      } else if (f & TileFlag.FLOODED) {
        // Recede evenly over the remaining ticks.
        const left = d.duration - d.age;
        if (left <= 1 || rng.nextFloat() < 1 / left) {
          state.flags[i] = f & ~TileFlag.FLOODED;
          state.markDirty(x, y);
        }
      }
    }
  }
}
