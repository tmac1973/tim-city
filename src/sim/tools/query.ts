import { POWER_SUPPLY } from '@/shared/costs';
import type { QueryResult } from '@/shared/protocol';
import { isBridge, isPower, isRoad, isTunnel, MAX_DENSITY, TileFlag, TileKind, zoneOf, ZoneType } from '@/shared/tiles';
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
};

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
    return result;
  }

  result.title = NAMES[kind] ?? 'Unknown';
  if (kind === TileKind.CoalPlant || kind === TileKind.NuclearPlant) {
    const output = kind === TileKind.CoalPlant ? POWER_SUPPLY.coal : POWER_SUPPLY.nuclear;
    details.push(['Output', `${String(output)} units`]);
    details.push(['City load', `${String(state.census.powerDemand)} of ${String(state.census.powerSupply)} units`]);
  } else if (isPower(kind)) {
    details.push(['Power', powered ? 'Live' : 'Not connected to a plant']);
  }
  if (isRoad(kind)) details.push(['Traffic', trafficLabel(state.field('traffic')[state.blockIndex(x, y)] ?? 0)]);
  if (!isBridge(kind) && !isTunnel(kind) && kind !== TileKind.Water) {
    details.push(['Height', String(Math.min(...corners(state, x, y)))]);
  }
  return result;
}
