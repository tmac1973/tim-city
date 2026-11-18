import type { SimEvent } from '@/shared/protocol';
import type { Scheduler } from '../scheduler';
import { censusSystem } from './census';
import { demandSystem } from './demand';
import { powerSystem } from './power';
import { trafficSystem } from './traffic';
import { zoneSystem } from './zones';

/** Every sim system, in the order they run within a tick. */
export function registerSystems(scheduler: Scheduler, emit: (event: SimEvent) => void): void {
  scheduler.register(powerSystem(emit));
  scheduler.register(demandSystem);
  scheduler.register(trafficSystem);
  scheduler.register(zoneSystem);
  scheduler.register(censusSystem);
}
