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
  zone: 100,
  coalPlant: 3000,
  nuclearPlant: 5000,
} as const;

/** Power each plant supplies; each zone draws 1 unit per density level (at least 1). */
export const POWER_SUPPLY = { coal: 700, nuclear: 2000 } as const;

export function networkCost(network: Network): number {
  return COSTS[network];
}
