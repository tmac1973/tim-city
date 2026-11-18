import { POWER_SUPPLY } from '@/shared/costs';
import type { QueryResult } from '@/shared/protocol';
import { isBridge, isOpenLand, isPark, isPower, isRoad, isTunnel, MAX_DENSITY, TileFlag, TileKind, zoneOf, ZoneType } from '@/shared/tiles';
import { COVERAGE_RADIUS } from '../systems/coverage';
import type { CityState } from '../state';
import { hasRoadAccess, JOBS_PER_LEVEL, RESIDENTS_PER_LEVEL } from '../systems/zones';
import { footprintAt } from './footprint';
import { corners } from './plan';

const NAMES: Partial<Record<number, string>> = {
  [TileKind.Empty]: 'Open land',
  [TileKind.Water]: 'Water',
  [TileKind.Tree]: 'Forest',
  [TileKind.Rubble]: 'Rubble',
  [TileKind.Road]: 'Road',
  [TileKind.Rail]: 'Rail',
  [TileKind.PowerLine]: 'Power line',
  [TileKind.RoadPower]: 'Road with power line',
  [TileKind.RailPower]: 'Rail with power line',
  [TileKind.RoadRail]: 'Level crossing',
  [TileKind.RoadBridge]: 'Road bridge',
  [TileKind.RailBridge]: 'Rail bridge',
  [TileKind.PowerBridge]: 'Power line over water',
  [TileKind.RoadTunnel]: 'Road tunnel',
  [TileKind.RailTunnel]: 'Rail tunnel',
  [TileKind.CoalPlant]: 'Coal power plant',
  [TileKind.NuclearPlant]: 'Nuclear power plant',
  [TileKind.PoliceStation]: 'Police station',
  [TileKind.FireStation]: 'Fire station',
  [TileKind.Park]: 'Park',
  [TileKind.LargePark]: 'Large park',
  [TileKind.Stadium]: 'Stadium',
  [TileKind.Seaport]: 'Seaport',
  [TileKind.Airport]: 'Airport',
};

const UNLOCKS: Partial<Record<number, string>> = {
  [TileKind.Stadium]: 'Homes past 50,000 residents',
  [TileKind.Seaport]: 'Industry past 7,000 jobs, and exports',
  [TileKind.Airport]: 'Commerce past 10,000 jobs',
};

/** A 0–255 field value as a word and a number. */
function level(value: number, words: readonly [string, string, string, string]): string {
  return `${words[Math.min(3, value >> 6)] ?? ''} (${String(value)})`;
}

/** Field readings shared by zones and open ground. */
function fieldDetails(state: CityState, x: number, y: number): [string, string][] {
  const b = state.blockIndex(x, y);
  const f = (name: string) => state.field(name)[b] ?? 0;
  return [
    ['Land value', level(f('landValue'), ['Low', 'Fair', 'Good', 'Prime'])],
    ['Pollution', level(f('pollution'), ['Clean', 'Some', 'Dirty', 'Toxic'])],
    ['Crime', level(f('crime'), ['Safe', 'Some', 'High', 'Dangerous'])],
    ['Police', level(f('policeCover'), ['None', 'Weak', 'Good', 'Strong'])],
    ['Fire cover', level(f('fireCover'), ['None', 'Weak', 'Good', 'Strong'])],
  ];
}

const ZONE_NAMES = ['Residential zone', 'Commercial zone', 'Industrial zone'] as const;

function trafficLabel(value: number): string {
  const level = value < 20 ? 'Quiet' : value < 80 ? 'Light' : value < 160 ? 'Busy' : 'Congested';
  return `${level} (${String(value)})`;
}

/** Describe a tile for the query tool. Never changes state. */
export function queryTile(state: CityState, x: number, y: number, requestId: number): QueryResult {
  const result: QueryResult = { type: 'queryResult', requestId, x, y, title: 'Off the map', details: [] };
  if (!state.inBounds(x, y)) return result;
  const i = state.index(x, y);
  const kind = state.tiles[i] ?? 0;
  const powered = ((state.flags[i] ?? 0) & TileFlag.POWERED) !== 0;
  const details = result.details;

  const zone = zoneOf(kind);
  const lot = footprintAt(state, x, y);
  if (zone && lot) {
    result.title = ZONE_NAMES[zone.type];
    details.push(['Density', zone.density === 0 ? 'Empty lot' : `${String(zone.density)} of ${String(MAX_DENSITY)}`]);
    if (zone.type === ZoneType.R) details.push(['Residents', String(zone.density * RESIDENTS_PER_LEVEL)]);
    else details.push(['Jobs', String(zone.density * JOBS_PER_LEVEL)]);
    details.push(['Power', powered ? 'On' : 'Off']);
    details.push(['Road access', hasRoadAccess(state, lot.x + 1, lot.y + 1) ? 'Yes' : 'No — build a road within 3 tiles']);
    const center = state.index(lot.x + 1, lot.y + 1);
    const failed = ((state.flags[center] ?? 0) & TileFlag.TRIP_FAILED) !== 0;
    const goal = zone.type === ZoneType.R ? 'jobs or shops' : zone.type === ZoneType.C ? 'customers' : 'workers or the map edge';
    details.push(['Commute', failed ? `No route to ${goal}` : 'OK']);
    details.push(['Traffic', trafficLabel(state.field('traffic')[state.blockIndex(x, y)] ?? 0)]);
    details.push(...fieldDetails(state, x, y));
    return result;
  }

  result.title = NAMES[kind] ?? 'Unknown';
  if (kind === TileKind.CoalPlant || kind === TileKind.NuclearPlant) {
    const output = kind === TileKind.CoalPlant ? POWER_SUPPLY.coal : POWER_SUPPLY.nuclear;
    details.push(['Output', `${String(output)} units`]);
    details.push(['City load', `${String(state.census.powerDemand)} of ${String(state.census.powerSupply)} units`]);
  } else if (isPower(kind)) {
    details.push(['Power', powered ? 'Live' : 'Not connected to a plant']);
  } else if (UNLOCKS[kind]) {
    details.push(['Unlocks', UNLOCKS[kind] ?? '']);
    details.push(['Power', powered ? 'On' : 'Off — has no effect until powered']);
  } else if (kind === TileKind.PoliceStation || kind === TileKind.FireStation) {
    const funding = kind === TileKind.PoliceStation ? state.funding.police : state.funding.fire;
    details.push(['Covers', `${String(COVERAGE_RADIUS)} tiles around`]);
    details.push(['Funding', `${String(funding)}%`]);
    details.push(['Power', powered ? 'On' : 'Off — half strength']);
  }
  if (isRoad(kind)) {
    details.push(['Traffic', trafficLabel(state.field('traffic')[state.blockIndex(x, y)] ?? 0)]);
    if ((state.flags[i] ?? 0) & TileFlag.POTHOLED) details.push(['Condition', 'Potholed — rebuild to repair']);
  }
  if (isOpenLand(kind) || isPark(kind)) details.push(...fieldDetails(state, x, y));
  if (!isBridge(kind) && !isTunnel(kind) && kind !== TileKind.Water) {
    details.push(['Height', String(Math.min(...corners(state, x, y)))]);
  }
  return result;
}
