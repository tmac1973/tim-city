import { TICKS_PER_MONTH } from '@/shared/constants';
import { isRoad, MAX_DENSITY, TileFlag, zoneKind, zoneOf, ZoneType } from '@/shared/tiles';
import { placeFootprint } from '../tools/footprint';
import type { System } from '../scheduler';
import type { CityState } from '../state';

/** A zone needs a road within this many tiles of its 3×3 edge to grow. */
export const ROAD_REACH = 3;
/** Monthly chance a zone that clears its threshold actually changes. */
const CHANGE_CHANCE = 0.25;
/** Monthly chance an unpowered zone loses a level. */
const DARK_DECAY_CHANCE = 0.1;

/** Demand (plus local bonus) a zone must exceed to grow past `density`. */
export const growThreshold = (density: number): number => 50 + 60 * density;
/** Negative demand beyond which a zone at `density` shrinks. */
export const shrinkThreshold = (density: number): number => 150 + 60 * density;

export const RESIDENTS_PER_LEVEL = 20;
export const JOBS_PER_LEVEL = 15;

/** Whether a road lies within ROAD_REACH tiles of the zone centred on (cx, cy). */
export function hasRoadAccess(state: CityState, cx: number, cy: number): boolean {
  const reach = 1 + ROAD_REACH;
  for (let y = cy - reach; y <= cy + reach; y++) {
    for (let x = cx - reach; x <= cx + reach; x++) {
      if (state.inBounds(x, y) && isRoad(state.tiles[state.index(x, y)] ?? 0)) return true;
    }
  }
  return false;
}

/**
 * Score that drives a zone's growth: its sector's demand, plus local
 * factors. Congestion at the zone holds it back; later phases add land
 * value, pollution and crime.
 */
export function zoneScore(state: CityState, x: number, y: number, type: ZoneType): number {
  const valve = type === ZoneType.R ? state.valves.r : type === ZoneType.C ? state.valves.c : state.valves.i;
  const traffic = state.field('traffic')[state.blockIndex(x, y)] ?? 0;
  return valve - traffic / 8;
}

function setDensity(state: CityState, cx: number, cy: number, type: ZoneType, density: number, lvClass: number): void {
  placeFootprint(state, cx - 1, cy - 1, zoneKind(type, density, lvClass));
}

/**
 * Each zone is evaluated once a month, on the tick given by its centre
 * tile's index, so the work spreads evenly over the month.
 */
export const zoneSystem: System = {
  name: 'zones',
  phaseTicks: Array.from({ length: TICKS_PER_MONTH }, (_, i) => i),
  run(state, tick) {
    const rng = state.random('zones');
    const { size, tiles, flags } = state;
    for (let i = tick; i < size * size; i += TICKS_PER_MONTH) {
      const f = flags[i] ?? 0;
      if (!(f & TileFlag.ZONE_CENTER)) continue;
      const zone = zoneOf(tiles[i] ?? 0);
      if (!zone) continue;
      const x = i % size;
      const y = (i - x) / size;
      const { type, density, landValueClass } = zone;

      if (!(f & TileFlag.POWERED)) {
        if (density > 0 && rng.nextFloat() < DARK_DECAY_CHANCE) {
          setDensity(state, x, y, type, density - 1, landValueClass);
        }
        continue;
      }
      // A zone grows only if its people can reach work, shops or homes.
      if (f & TileFlag.TRIP_FAILED || !hasRoadAccess(state, x, y)) continue;

      const score = zoneScore(state, x, y, type);
      const roll = rng.nextFloat();
      if (density < MAX_DENSITY && score > growThreshold(density) && roll < CHANGE_CHANCE) {
        setDensity(state, x, y, type, density + 1, landValueClass);
      } else if (density > 0 && score < -shrinkThreshold(density) && roll < CHANGE_CHANCE) {
        setDensity(state, x, y, type, density - 1, landValueClass);
      }
    }
  },
};
