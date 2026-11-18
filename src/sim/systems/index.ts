import type { SimEvent } from '@/shared/protocol';
import type { Scheduler } from '../scheduler';
import { censusSystem } from './census';
import { coverageSystem } from './coverage';
import { crimeSystem } from './crime';
import { landValueSystem } from './landValue';
import { pollutionSystem } from './pollution';
import { growthSystem, popDensitySystem } from './popDensity';
import { roadsSystem } from './roads';
import { demandSystem } from './demand';
import { powerSystem } from './power';
import { trafficSystem } from './traffic';
import { zoneSystem } from './zones';

/** Every sim system, in the order they run within a tick. */
export function registerSystems(scheduler: Scheduler, emit: (event: SimEvent) => void): void {
  scheduler.register(powerSystem(emit));
  scheduler.register(demandSystem(emit));
  scheduler.register(trafficSystem);
  scheduler.register(zoneSystem);
  scheduler.register(pollutionSystem);
  scheduler.register(landValueSystem);
  scheduler.register(crimeSystem);
  scheduler.register(coverageSystem);
  scheduler.register(popDensitySystem);
  scheduler.register(growthSystem);
  scheduler.register(roadsSystem);
  scheduler.register(censusSystem);
}
