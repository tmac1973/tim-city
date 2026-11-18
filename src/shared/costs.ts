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
} as const;

/** Power each plant supplies; each zone draws 1 unit per density level (at least 1). */
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
