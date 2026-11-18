import { TileFlag, TileKind, zoneOf, ZoneType } from '@/shared/tiles';
import type { System } from '../scheduler';
import { type CityState, emptyCensus } from '../state';
import { plantName, plantSupply, zoneDemand } from './power';
import { hasGarbage, hasWater, utilityRulesActive } from './utilityRules';
import { JOBS_PER_LEVEL, RESIDENTS_PER_LEVEL } from './zones';

export function takeCensus(state: CityState): void {
  const census = emptyCensus();
  const { size, tiles, flags, parts } = state;
  for (let i = 0; i < size * size; i++) {
    const kind = tiles[i] ?? 0;
    if (parts[i] === 1) {
      const lit = ((flags[i] ?? 0) & TileFlag.POWERED) !== 0;
      if (kind === TileKind.Airport) census.landmarks.airport++;
      if (kind === TileKind.Seaport) census.landmarks.seaport++;
      if (lit && kind === TileKind.Stadium) census.specials.stadium++;
      else if (lit && kind === TileKind.Seaport) census.specials.seaport++;
      else if (lit && kind === TileKind.Airport) census.specials.airport++;
      const plant = plantName(kind);
      if (plant) {
        census.plants[plant]++;
        census.powerSupply += plantSupply(state, i);
      }
    }
    if (kind === TileKind.Water) census.water++;
    if (kind === TileKind.BusStop) census.busStops++;
    const f = flags[i] ?? 0;
    if (!(f & TileFlag.ZONE_CENTER)) continue;
    const zone = zoneOf(kind);
    if (!zone) continue;
    census.powerDemand += zoneDemand(zone.density);
    if (!(f & TileFlag.POWERED)) census.unpoweredZones++;
    const x = i % size;
    const y = (i - x) / size;
    if (!hasWater(state, x, y)) census.unwateredLots++;
    if (!hasGarbage(state, x, y)) census.ungarbagedLots++;
    if (zone.type === ZoneType.R) {
      census.zones.r++;
      census.resPop += zone.density * RESIDENTS_PER_LEVEL;
    } else if (zone.type === ZoneType.C) {
      census.zones.c++;
      census.comJobs += zone.density * JOBS_PER_LEVEL;
    } else {
      census.zones.i++;
      census.indJobs += zone.density * JOBS_PER_LEVEL;
    }
  }
  census.utilityRules = utilityRulesActive(state);
  census.tourism = state.tourism;
  census.busRiders = state.busRiders;
  state.census = census;
}

/** Runs on the last tick, so each month's demand uses a complete count. */
export const censusSystem: System = {
  name: 'census',
  phaseTicks: [15],
  run(state) {
    takeCensus(state);
  },
};
