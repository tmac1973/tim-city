import { COSTS, type LandmarkName } from '@/shared/costs';
import type { SimEvent, ToolCommand, ToolResult } from '@/shared/protocol';
import { isUnlocked, lockedMessage } from '@/shared/unlocks';
import { AIRPORT_SIZE, LANDFILL_SIZE, LANDMARK_SIZES, PLANT_SIZE, SEAPORT_SIZE, STADIUM_SIZE, TileKind, WATER_TOWER_SIZE, WIND_SIZE, ZONE_SIZE, ZoneType } from '@/shared/tiles';
import type { CommandQueue } from '../commands';
import type { CityState } from '../state';
import { stopEntry } from '../systems/transit';
import { planBlock } from './block';
import { planBulldoze } from './bulldoze';
import { planNetwork } from './network';
import { planBuilding, planParks, planZones } from './place';
import { fail, type ToolPlan } from './plan';
import { planTerraform } from './terraform';

/** Plan a tool use, including the funds check. Never changes state. */
export function planTool(state: CityState, cmd: ToolCommand): ToolPlan {
  if (state.bankrupt) return fail('The city is bankrupt');
  if (!state.inBounds(cmd.x0, cmd.y0)) return fail('Off the map');
  if (!isUnlocked(cmd.tool, state.classReached)) return fail(lockedMessage(cmd.tool));
  let plan: ToolPlan;
  switch (cmd.tool) {
    case 'block':
      plan = planBlock(state, cmd);
      break;
    case 'road':
    case 'rail':
    case 'power':
      plan = planNetwork(state, cmd, cmd.tool);
      break;
    case 'bulldoze':
      plan = planBulldoze(state, cmd);
      break;
    case 'raise':
    case 'lower':
    case 'level':
      plan = planTerraform(state, cmd);
      break;
    case 'residential':
      plan = planZones(state, cmd, ZoneType.R);
      break;
    case 'commercial':
      plan = planZones(state, cmd, ZoneType.C);
      break;
    case 'industrial':
      plan = planZones(state, cmd, ZoneType.I);
      break;
    case 'coal':
      plan = planBuilding(state, cmd, TileKind.CoalPlant, PLANT_SIZE, COSTS.coalPlant);
      break;
    case 'nuclear':
      plan = planBuilding(state, cmd, TileKind.NuclearPlant, PLANT_SIZE, COSTS.nuclearPlant);
      break;
    case 'solar':
      plan = planBuilding(state, cmd, TileKind.SolarFarm, PLANT_SIZE, COSTS.solarFarm);
      break;
    case 'wind':
      // A turbine stands on any open tile, hillsides included.
      plan = planBuilding(state, cmd, TileKind.WindTurbine, WIND_SIZE, COSTS.windTurbine, { maxSlope: Infinity });
      break;
    case 'gas':
      plan = planBuilding(state, cmd, TileKind.GasPlant, PLANT_SIZE, COSTS.gasPlant);
      break;
    case 'oil':
      plan = planBuilding(state, cmd, TileKind.OilPlant, PLANT_SIZE, COSTS.oilPlant);
      break;
    case 'police':
      plan = planBuilding(state, cmd, TileKind.PoliceStation, ZONE_SIZE, COSTS.policeStation);
      break;
    case 'fire':
      plan = planBuilding(state, cmd, TileKind.FireStation, ZONE_SIZE, COSTS.fireStation);
      break;
    case 'largePark':
      plan = planBuilding(state, cmd, TileKind.LargePark, ZONE_SIZE, COSTS.largePark);
      break;
    case 'park':
      plan = planParks(state, cmd);
      break;
    case 'stadium':
      plan = planBuilding(state, cmd, TileKind.Stadium, STADIUM_SIZE, COSTS.stadium);
      break;
    case 'seaport':
      plan = planBuilding(state, cmd, TileKind.Seaport, SEAPORT_SIZE, COSTS.seaport, { needsWaterEdge: true });
      break;
    case 'busStop':
      plan = planBusStop(state, cmd);
      break;
    case 'waterTower':
      plan = planBuilding(state, cmd, TileKind.WaterTower, WATER_TOWER_SIZE, COSTS.waterTower);
      break;
    case 'landfill':
      plan = planBuilding(state, cmd, TileKind.Landfill, LANDFILL_SIZE, COSTS.landfill);
      break;
    case 'cityHall':
    case 'hospital':
    case 'university':
    case 'museum':
    case 'zoo':
    case 'amusementPark':
    case 'statue':
    case 'clockTower':
    case 'timSign':
      plan = planLandmark(state, cmd, cmd.tool);
      break;
    case 'airport':
      // Runways need nearly flat ground.
      plan = planBuilding(state, cmd, TileKind.Airport, AIRPORT_SIZE, COSTS.airport, { maxSlope: 1 });
      break;
  }
  if (plan.ok && plan.cost > state.funds) return fail('Not enough funds', plan.tiles);
  // Explain a refusal caused by contaminated ground.
  if (!plan.ok && plan.bad.some((i) => state.tiles[i] === TileKind.Radiation)) {
    return fail('Radioactive', plan.tiles, plan.bad);
  }
  return plan;
}

/** A bus stop: one open tile that shares an edge with a road. */
function planBusStop(state: CityState, cmd: ToolCommand): ToolPlan {
  if (!state.inBounds(cmd.x1, cmd.y1)) return fail('Off the map');
  const i = state.index(cmd.x1, cmd.y1);
  if (stopEntry(state.size, state.tiles, i) < 0) return fail('Must be beside a road', [i], [i]);
  return planBuilding(state, cmd, TileKind.BusStop, 1, COSTS.busStop);
}

/** Tile kind of each landmark tool. */
export const LANDMARK_KINDS: Record<LandmarkName, number> = {
  cityHall: TileKind.CityHall,
  hospital: TileKind.Hospital,
  university: TileKind.University,
  museum: TileKind.Museum,
  zoo: TileKind.Zoo,
  amusementPark: TileKind.AmusementPark,
  statue: TileKind.Statue,
  clockTower: TileKind.ClockTower,
  timSign: TileKind.TimSign,
};
/** Landmarks a city may only have one of. */
const ONE_PER_CITY = new Set<LandmarkName>(['cityHall', 'university']);

function planLandmark(state: CityState, cmd: ToolCommand, name: LandmarkName): ToolPlan {
  const kind = LANDMARK_KINDS[name];
  if (ONE_PER_CITY.has(name) && state.tiles.some((k, i) => k === kind && state.parts[i] === 1)) return fail('Only one per city');
  return planBuilding(state, cmd, kind, LANDMARK_SIZES[kind] ?? 1, COSTS[name]);
}

export function toResult(cmd: ToolCommand, plan: ToolPlan): ToolResult {
  const result: ToolResult = {
    type: 'toolResult',
    requestId: cmd.requestId,
    dryRun: cmd.dryRun,
    ok: plan.ok,
    cost: plan.cost,
    tiles: plan.tiles,
    bad: plan.bad,
  };
  if (plan.reason !== undefined) result.reason = plan.reason;
  if (plan.label !== undefined) result.label = plan.label;
  return result;
}

/** Plan, charge and apply a tool command; report the outcome as an event. */
export function runTool(state: CityState, cmd: ToolCommand): ToolResult {
  const plan = planTool(state, cmd);
  if (plan.ok && !cmd.dryRun) {
    plan.apply();
    state.funds -= plan.cost;
    state.constructionThisYear += plan.cost;
  }
  return toResult(cmd, plan);
}

export function registerToolCommands(queue: CommandQueue, emit: (event: SimEvent) => void): void {
  queue.on('tool', (state, cmd) => {
    emit(runTool(state, cmd));
  });
}
