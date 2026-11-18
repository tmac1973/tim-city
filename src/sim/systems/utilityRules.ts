import type { CityState } from '../state';

/** Water or garbage cover at or above this counts as served (a quarter of full strength). */
export const SERVED = 64;
/** Highest level a lot reaches without water. */
export const DRY_CAP = 4;
/** Land value lost in a populated block whose garbage isn't collected. */
export const GARBAGE_PENALTY = 40;

/** Month index of the city's date, for comparing with utilityGraceUntil. */
export const monthIndex = (state: CityState): number => state.date.year * 12 + state.date.month;

/** Whether water and garbage rules are in force (an old save's grace period has ended). */
export const utilityRulesActive = (state: CityState): boolean => monthIndex(state) >= state.utilityGraceUntil;

/** Whether the block holding tile (x, y) has water service. */
export const hasWater = (state: CityState, x: number, y: number): boolean => (state.field('waterCover')[state.blockIndex(x, y)] ?? 0) >= SERVED;
/** Whether garbage is collected in the block holding tile (x, y). */
export const hasGarbage = (state: CityState, x: number, y: number): boolean => (state.field('garbageCover')[state.blockIndex(x, y)] ?? 0) >= SERVED;
