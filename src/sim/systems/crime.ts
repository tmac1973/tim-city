import type { System } from '../scheduler';
import type { CityState } from '../state';
import { store } from './fields';

/**
 * Monthly crime per block: crowding and poverty raise it, police lower it.
 *   popDensity / 2 + (255 − landValue) / 4 − policeCover / 2
 * Blocks where nobody lives have no crime.
 */
export function updateCrime(state: CityState): void {
  const density = state.field('popDensity');
  const landValue = state.field('landValue');
  const police = state.field('policeCover');
  const values = new Float32Array(density.length);
  for (let b = 0; b < values.length; b++) {
    const people = density[b] ?? 0;
    values[b] = people === 0 ? 0 : people / 2 + (255 - (landValue[b] ?? 0)) / 4 - (police[b] ?? 0) / 2;
  }
  store(state.field('crime'), values);
}

export const crimeSystem: System = { name: 'crime', phaseTicks: [6], run: updateCrime };
