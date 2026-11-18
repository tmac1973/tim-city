import { isWinter } from '@/shared/constants';
import type { System } from '../scheduler';
import type { CityState } from '../state';

/** Chance a month is overcast, by season. */
export function overcastChance(month: number): number {
  if (isWinter(month)) return 0.25;
  const wet = (month >= 2 && month <= 4) || (month >= 8 && month <= 10);
  return wet ? 0.3 : 0.15;
}

/**
 * At the start of each month, roll whether it is overcast. Solar farms give
 * less in an overcast month, and the renderer leans the sky cloudy.
 */
export function rollClimate(state: CityState): void {
  state.overcast = state.random('climate').nextFloat() < overcastChance(state.date.month);
}

export const climateSystem: System = { name: 'climate', phaseTicks: [0], run: rollClimate };
