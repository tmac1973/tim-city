import type { SimEvent, Valves } from '@/shared/protocol';
import type { System } from '../scheduler';
import type { CityState } from '../state';

export const VALVE_LIMIT = 2000;
/** Share of the gap to the target a valve closes each month. */
const VALVE_EASING = 0.2;

const clamp = (v: number) => Math.min(VALVE_LIMIT, Math.max(-VALVE_LIMIT, v));

/**
 * Where each valve is heading, from last month's census. Each sector chases
 * a desired size:
 *   residents  ≈ 1.1 × jobs + 600   (people move in for work, plus a base of newcomers)
 *   commercial ≈ 0.35 × residents + 50
 *   industrial ≈ 0.75 × residents + 300 (local jobs plus export trade)
 * Desired jobs slightly exceed residents, so a balanced city keeps growing
 * until other limits (pollution, crime, traffic, taxes, caps) push back.
 * Demand is the gap as a share of the desired size, scaled to ±2000.
 */
export function demandTargets(state: CityState): Valves {
  const { resPop, comJobs, indJobs } = state.census;
  const desiredRes = (comJobs + indJobs) * 1.1 + 600;
  const desiredCom = 0.35 * resPop + 50;
  const desiredInd = 0.75 * resPop + 300;
  const tax = (state.taxRate - 7) * 30;
  return {
    r: clamp((VALVE_LIMIT * (desiredRes - resPop)) / Math.max(desiredRes, 600) - tax),
    c: clamp((VALVE_LIMIT * (desiredCom - comJobs)) / Math.max(desiredCom, 200) - tax),
    i: clamp((VALVE_LIMIT * (desiredInd - indJobs)) / Math.max(desiredInd, 300) - tax),
  };
}

/**
 * Growth caps from the classic rules: past a size, a sector stops wanting
 * to grow until the city has the special building it needs.
 */
export const DEMAND_CAPS = [
  { zone: 'r', needs: 'stadium', limit: 50_000, measure: 'resPop' },
  { zone: 'i', needs: 'seaport', limit: 7_000, measure: 'indJobs' },
  { zone: 'c', needs: 'airport', limit: 10_000, measure: 'comJobs' },
] as const;

/** Which caps hold right now. */
export function activeCaps(state: CityState): (typeof DEMAND_CAPS)[number][] {
  return DEMAND_CAPS.filter((cap) => state.census[cap.measure] > cap.limit && state.census.specials[cap.needs] === 0);
}

export function demandSystem(emit: (event: SimEvent) => void): System {
  return {
    name: 'demand',
    phaseTicks: [1],
    run(state) {
      const target = demandTargets(state);
      const v = state.valves;
      v.r = Math.round(v.r + (target.r - v.r) * VALVE_EASING);
      v.c = Math.round(v.c + (target.c - v.c) * VALVE_EASING);
      v.i = Math.round(v.i + (target.i - v.i) * VALVE_EASING);
      for (const cap of activeCaps(state)) {
        v[cap.zone] = Math.min(0, v[cap.zone]);
        if (state.capNotified[cap.zone] !== state.date.year) {
          state.capNotified[cap.zone] = state.date.year;
          emit({ type: 'demandCap', zone: cap.zone, needs: cap.needs });
        }
      }
    },
  };
}
