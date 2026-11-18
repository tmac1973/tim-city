import { DIFFICULTY } from '@/shared/difficulty';
import type { ActiveDisaster, DisasterType, SimEvent } from '@/shared/protocol';
import { TileKind } from '@/shared/tiles';
import type { Rng } from '../rng';
import type { System } from '../scheduler';
import type { CityState } from '../state';
import { ignite, isFlammable, randomTile } from './common';
import { startEarthquake } from './earthquake';
import { startFlood, stepFlood } from './flood';
import { startPlaneCrash, startShipwreck } from './impacts';
import { startMeltdown } from './meltdown';
import { meanPopulatedPollution, MIREBEAST_POLLUTION, startMirebeast, stepMirebeast } from './mirebeast';
import { startTornado, stepTornado } from './tornado';

/** Base chance of a random disaster each month, scaled by difficulty. */
export const MONTHLY_CHANCE = 0.015;

/** Relative weights for the random pick (renormalised over those that can start). */
export const WEIGHTS: Record<DisasterType, number> = {
  fire: 30,
  flood: 15,
  tornado: 15,
  earthquake: 10,
  planeCrash: 10,
  shipwreck: 10,
  meltdown: 5,
  mirebeast: 5,
};

interface DisasterDef {
  /** Why it cannot start now, or null if it can. `manual` relaxes the Mirebeast's pollution rule. */
  blocked(state: CityState, manual: boolean): string | null;
  start(state: CityState, rng: Rng): ActiveDisaster | null;
  /** One tick of an active disaster; true when it ends early. */
  step?(state: CityState, d: ActiveDisaster, rng: Rng): boolean;
}

const hasKind = (state: CityState, kind: number) => state.tiles.includes(kind);

/** How much likelier an oil plant tile is to be where a fire starts. */
export const OIL_FIRE_WEIGHT = 3;

export const DEFS: Record<DisasterType, DisasterDef> = {
  fire: {
    blocked: (s) => (s.tiles.some((k) => isFlammable(k) && k !== TileKind.Tree) ? null : 'Nothing built to burn'),
    start(state, rng) {
      // Oil plants catch fire three times as easily as anything else.
      const at = randomTile(
        state,
        rng,
        (i) => isFlammable(state.tiles[i] ?? 0) && state.tiles[i] !== TileKind.Tree,
        (i) => (state.tiles[i] === TileKind.OilPlant ? OIL_FIRE_WEIGHT : 1),
      );
      if (!at) return null;
      ignite(state, rng, at[0], at[1]);
      return { id: state.nextDisasterId++, type: 'fire', x: at[0], y: at[1], age: 0, duration: 1, heading: 0, targetX: at[0], targetY: at[1] };
    },
  },
  flood: { blocked: (s) => (s.census.water > 0 || hasKind(s, TileKind.Water) ? null : 'No water on the map'), start: startFlood, step: (s, d, r) => (stepFlood(s, d, r), false) },
  tornado: { blocked: () => null, start: startTornado, step: stepTornado },
  earthquake: { blocked: () => null, start: startEarthquake },
  planeCrash: { blocked: (s) => (hasKind(s, TileKind.Airport) ? null : 'Needs an airport'), start: startPlaneCrash },
  shipwreck: { blocked: (s) => (hasKind(s, TileKind.Seaport) ? null : 'Needs a seaport'), start: startShipwreck },
  meltdown: { blocked: (s) => (hasKind(s, TileKind.NuclearPlant) ? null : 'Needs a nuclear plant'), start: startMeltdown },
  mirebeast: {
    blocked(state, manual) {
      if (!hasKind(state, TileKind.Water)) return 'Needs water to rise from';
      if (!manual && meanPopulatedPollution(state) <= MIREBEAST_POLLUTION) return 'The city is too clean';
      return null;
    },
    start: (s) => startMirebeast(s),
    step: stepMirebeast,
  },
};

/** Start a disaster now; emits `disaster` or, when it cannot, `disasterRefused`. */
export function triggerDisaster(state: CityState, type: DisasterType, emit: (e: SimEvent) => void, manual = true): boolean {
  const reason = DEFS[type].blocked(state, manual);
  const d = reason === null ? DEFS[type].start(state, state.random(`disaster/${type}`)) : null;
  if (!d) {
    emit({ type: 'disasterRefused', disaster: type, reason: reason ?? 'Nowhere for it to happen' });
    return false;
  }
  // Fires live on as burning tiles, not as an active disaster.
  if (type === 'fire') state.disasters = state.disasters.filter((x) => x.id !== d.id);
  emit({ type: 'disaster', disaster: type, x: d.x, y: d.y });
  return true;
}

/** The monthly roll for a random disaster (tick 3), honouring the toggle and difficulty. */
export function rollRandomDisaster(state: CityState, emit: (e: SimEvent) => void): DisasterType | null {
  if (!state.randomDisasters) return null;
  const rng = state.random('disaster/roll');
  if (rng.nextFloat() >= MONTHLY_CHANCE * DIFFICULTY[state.difficulty].disasterRate) return null;
  const options = (Object.keys(WEIGHTS) as DisasterType[]).filter((t) => DEFS[t].blocked(state, false) === null);
  const total = options.reduce((sum, t) => sum + WEIGHTS[t], 0);
  if (total === 0) return null;
  let pick = rng.nextFloat() * total;
  for (const t of options) {
    pick -= WEIGHTS[t];
    if (pick < 0) return triggerDisaster(state, t, emit, false) ? t : null;
  }
  return null;
}

/** Steps active disasters every tick; rolls for a random one once a month. */
export function disasterSystem(emit: (e: SimEvent) => void): System {
  return {
    name: 'disasters',
    phaseTicks: Array.from({ length: 16 }, (_, i) => i),
    run(state, tick) {
      if (tick === 3) rollRandomDisaster(state, emit);
      if (state.disasters.length === 0) return;
      const rng = state.random('disaster/step');
      state.disasters = state.disasters.filter((d) => {
        const ended = DEFS[d.type].step?.(state, d, rng) ?? false;
        d.age++;
        return !ended && d.age < d.duration;
      });
    },
  };
}
