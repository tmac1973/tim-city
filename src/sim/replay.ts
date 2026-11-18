import { TICKS_PER_MONTH } from '@/shared/constants';
import type { CityInfo, SimCommand, SimEvent } from '@/shared/protocol';
import { Simulation } from './sim';

export interface ScriptAction {
  /** Absolute tick (0 = first tick) at whose start the command applies. */
  atTick: number;
  command: SimCommand;
}

export interface ReplayResult {
  sim: Simulation;
  events: SimEvent[];
}

/** Run the sim headless for a number of months with scripted commands. */
export function runScript(info: CityInfo, actions: readonly ScriptAction[], months: number): ReplayResult {
  const sim = new Simulation(info);
  const queue = [...actions].sort((a, b) => a.atTick - b.atTick);
  const events: SimEvent[] = [];
  let next = 0;

  const totalTicks = months * TICKS_PER_MONTH;
  for (let tick = 0; tick < totalTicks; tick++) {
    while (next < queue.length && queue[next]?.atTick === tick) {
      const action = queue[next];
      if (action) sim.enqueue(action.command);
      next++;
    }
    sim.step();
    events.push(...sim.drainEvents());
  }
  return { sim, events };
}
