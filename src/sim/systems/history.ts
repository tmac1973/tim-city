import { MONTHS_PER_YEAR } from '@/shared/constants';
import type { HistorySample } from '@/shared/protocol';
import type { System } from '../scheduler';
import type { CityState } from '../state';

/** Ten years of months, and 120 years of years. */
export const MONTHLY_SAMPLES = 120;
export const YEARLY_SAMPLES = 120;

function meanField(state: CityState, name: string): number {
  const f = state.field(name);
  let sum = 0;
  for (const v of f) sum += v;
  return Math.round(sum / f.length);
}

export function sample(state: CityState): HistorySample {
  return {
    year: state.date.year,
    month: state.date.month,
    population: state.census.resPop,
    comJobs: state.census.comJobs,
    indJobs: state.census.indJobs,
    funds: state.funds,
    crime: meanField(state, 'crime'),
    pollution: meanField(state, 'pollution'),
    traffic: meanField(state, 'traffic'),
    landValue: meanField(state, 'landValue'),
    approval: state.evaluation?.approval ?? 0,
    score: state.evaluation?.score ?? 0,
  };
}

/** Append, dropping the oldest once the buffer is full. */
export function record(buffer: HistorySample[], s: HistorySample, limit: number): void {
  buffer.push(s);
  if (buffer.length > limit) buffer.splice(0, buffer.length - limit);
}

/** Samples on the last tick of each month, after the census and evaluation. */
export const historySystem: System = {
  name: 'history',
  phaseTicks: [15],
  run(state) {
    const s = sample(state);
    record(state.history.monthly, s, MONTHLY_SAMPLES);
    if (state.date.month === MONTHS_PER_YEAR - 1) record(state.history.yearly, s, YEARLY_SAMPLES);
  },
};
