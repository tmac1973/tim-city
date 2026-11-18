import { FIELD_NAMES, type CityState } from './state';

/**
 * Save-format version. Bump it whenever the registry or header changes and
 * add a migration in migrate.ts that turns the previous version into this one.
 */
export const FORMAT_VERSION = 2;

/**
 * Every typed array a city owns, in the fixed order they are written. New
 * state goes on the end, with a version bump and a migration.
 */
export function savedArrays(state: CityState): [string, Uint8Array | Uint16Array][] {
  return [
    ['tiles', state.tiles],
    ['flags', state.flags],
    ['heights', state.heights],
    ['parts', state.parts],
    ['densityAtYearStart', state.densityAtYearStart],
    ['serviceMap', state.serviceMap],
    ...FIELD_NAMES.map((name): [string, Uint8Array] => [`field:${name}`, state.field(name)]),
    // Version 2: disasters.
    ['fireTicks', state.fireTicks],
  ];
}

/** Every plain value a city owns, as JSON for the save header. */
export function savedHeader(state: CityState): Record<string, unknown> {
  return {
    name: state.name,
    seed: state.seed,
    size: state.size,
    date: { ...state.date },
    funds: state.funds,
    taxRate: state.taxRate,
    difficulty: state.difficulty,
    randomDisasters: state.randomDisasters,
    funding: { ...state.funding },
    bonds: state.bonds,
    constructionThisYear: state.constructionThisYear,
    lastYear: state.lastYear,
    bankrupt: state.bankrupt,
    brownout: state.brownout,
    capNotified: { ...state.capNotified },
    census: state.census,
    valves: { ...state.valves },
    evaluation: state.evaluation,
    classReached: state.classReached,
    lastYearApproval: state.lastYearApproval,
    lastYearScore: state.lastYearScore,
    lastYearPop: state.lastYearPop,
    burnedThisYear: state.burnedThisYear,
    history: state.history,
    random: state.randomStates(),
    disasters: state.disasters,
    nextDisasterId: state.nextDisasterId,
    radiation: [...state.radiation.entries()],
    pollutionSpills: state.pollutionSpills,
  };
}
