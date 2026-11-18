import { TICKS_PER_MONTH } from '@/shared/constants';
import type { CityState } from './state';

/**
 * A sim system runs on the ticks of the month it lists, so heavy monthly
 * passes can be spread across the 16 ticks instead of landing on one.
 */
export interface System {
  readonly name: string;
  readonly phaseTicks: readonly number[];
  run(state: CityState, tick: number): void;
}

export const EVERY_TICK: readonly number[] = Array.from({ length: TICKS_PER_MONTH }, (_, i) => i);

export class Scheduler {
  private readonly byTick: System[][] = Array.from({ length: TICKS_PER_MONTH }, () => []);

  /** Systems run in registration order within a tick. */
  register(system: System): void {
    for (const tick of system.phaseTicks) {
      const slot = this.byTick[tick];
      if (!slot) throw new Error(`System ${system.name} lists invalid tick ${String(tick)}`);
      slot.push(system);
    }
  }

  /** When set, total milliseconds per system name (dev profiling; never affects results). */
  timings: Map<string, number> | null = null;

  runTick(state: CityState, tick: number): void {
    const timings = this.timings;
    for (const system of this.byTick[tick] ?? []) {
      if (!timings) {
        system.run(state, tick);
        continue;
      }
      const t0 = performance.now();
      system.run(state, tick);
      timings.set(system.name, (timings.get(system.name) ?? 0) + performance.now() - t0);
    }
  }
}
