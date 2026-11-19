import type { Network } from './tiles';

/** Construction prices in dollars. */
export const COSTS = {
  road: 10,
  rail: 20,
  power: 5,
  bridge: 50,
  tunnel: 100,
  /** Clearing trees, rubble or a network tile. */
  bulldoze: 1,
  /** Demolishing one tile of a building. */
  bulldozeBuilding: 5,
  /** Per corner, per height step. */
  terraform: 20,
  /** Zoning a lot at low density; see ZONE_TIER_COSTS for the others. */
  zone: 100,
  /** Least a change of density tier costs (a move up pays the difference). */
  rezone: 50,
  coalPlant: 3000,
  nuclearPlant: 5000,
  solarFarm: 2500,
  windTurbine: 400,
  gasPlant: 2200,
  oilPlant: 2600,
  policeStation: 500,
  fireStation: 500,
  park: 10,
  largePark: 150,
  stadium: 5000,
  seaport: 3000,
  airport: 10000,
  waterTower: 600,
  busStop: 150,
  /** Per tile of subway track. */
  subway: 40,
  subwayStation: 800,
  landfill: 1000,
  cityHall: 3000,
  hospital: 2500,
  university: 6000,
  museum: 3000,
  zoo: 4000,
  amusementPark: 8000,
  statue: 500,
  clockTower: 1500,
  timSign: 2500,
} as const;

/** Power each plant supplies; each zone draws 1 unit per density level (at least 1). */
/** Running costs a year, at full funding (a road tile costs $1, a police station $100). */
export const UPKEEP = {
  busStop: 10,
  /** Per tile of track. */
  subway: 2,
  subwayStation: 60,
  waterTower: 60,
  landfill: 90,
  cityHall: 150,
  hospital: 250,
  university: 400,
  museum: 120,
  zoo: 180,
  amusementPark: 300,
  statue: 0,
  clockTower: 15,
  timSign: 15,
} as const;
export type LandmarkName = 'cityHall' | 'hospital' | 'university' | 'museum' | 'zoo' | 'amusementPark' | 'statue' | 'clockTower' | 'timSign';
/**
 * What each landmark spreads around it: a coverage field (hospital, university)
 * or a land-value boost, at `strength` in the centre fading to 0 at `radius` tiles.
 */
export const LANDMARK_REACH: Partial<Record<LandmarkName, { radius: number; strength: number }>> = {
  hospital: { radius: 24, strength: 255 },
  university: { radius: 32, strength: 255 },
  museum: { radius: 24, strength: 60 },
  zoo: { radius: 24, strength: 60 },
  amusementPark: { radius: 24, strength: 60 },
  statue: { radius: 8, strength: 30 },
  clockTower: { radius: 8, strength: 30 },
  timSign: { radius: 8, strength: 30 },
};
/** Monthly tourism from a working leisure landmark reached by road from the map edge, before crime and pollution. */
export const TOURISM_BASE: Partial<Record<LandmarkName, number>> = { museum: 30, zoo: 40, amusementPark: 60 };
/** Approval each landmark adds; the total is capped. */
export const LANDMARK_APPROVAL: Partial<Record<LandmarkName, number>> = { cityHall: 5, statue: 1, clockTower: 2, timSign: 3 };
export const MAX_LANDMARK_APPROVAL = 15;
/** Reach (tiles) and capacity (zone levels served) of each utility building. */
export const UTILITY = {
  waterTower: { radius: 24, capacity: 300 },
  landfill: { radius: 34, capacity: 500 },
} as const;

/** Zoning one lot at low, medium and high density. */
export const ZONE_TIER_COSTS = [100, 200, 400] as const;
export const zoneCost = (tier: number): number => ZONE_TIER_COSTS[Math.min(2, Math.max(0, tier)) as 0 | 1 | 2];

export const POWER_SUPPLY = { coal: 700, nuclear: 2000, solar: 300, wind: 40, gas: 500, oil: 1000 } as const;
export type PlantName = keyof typeof POWER_SUPPLY;
/** Smoke each plant puts out, relative to a coal plant. */
export const PLANT_POLLUTION: Record<PlantName, number> = { coal: 1, nuclear: 0, solar: 0, wind: 0, gas: 0.5, oil: 1.5 };
/** Solar output in an overcast month, and wind output on high ground, as factors. */
export const SOLAR_OVERCAST = 0.6;
export const WIND_HIGH_GROUND = 1.5

export function networkCost(network: Network): number {
  return COSTS[network];
}
