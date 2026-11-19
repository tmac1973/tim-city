import { MONTHS_PER_YEAR } from '@/shared/constants';
import { CITY_CLASSES, CLASS_THRESHOLDS, type CityClass, type Evaluation, type Problem, type ProblemId, type SimEvent, type UnlockId } from '@/shared/protocol';
import { unlocksAt } from '@/shared/unlocks';
import { isRoad, TileFlag, zoneOf, ZoneType } from '@/shared/tiles';
import type { System } from '../scheduler';
import type { CityState } from '../state';
import { blockGeometry } from './fields';
import { findHotspot } from './hotspots';
import { landmarkApproval } from './landmarks';
import { monthIndex } from './utilityRules';

export { CLASS_THRESHOLDS };

export function cityClassFor(population: number): number {
  let index = 0;
  CLASS_THRESHOLDS.forEach((threshold, i) => {
    if (population >= threshold) index = i;
  });
  return index;
}

/** Mean of a block field over the blocks matching `include`, as 0–100. */
function meanOf(field: Uint8Array, include: (b: number) => boolean): number {
  let sum = 0;
  let n = 0;
  for (let b = 0; b < field.length; b++) {
    if (!include(b)) continue;
    sum += field[b] ?? 0;
    n++;
  }
  return n === 0 ? 0 : sum / n / 2.55;
}

/** Each problem's 0–100 score, from the city as it is now. */
export function problemScores(state: CityState): Record<ProblemId, number> {
  const density = state.field('popDensity');
  const populated = (b: number) => (density[b] ?? 0) > 0;
  const { side } = blockGeometry(state);

  // Blocks holding road, and blocks holding dense homes.
  const roadBlocks = new Uint8Array(side * side);
  const denseHomes = new Uint8Array(side * side);
  const { size, tiles, flags } = state;
  for (let i = 0; i < size * size; i++) {
    const kind = tiles[i] ?? 0;
    const b = state.blockIndex(i % size, Math.floor(i / size));
    if (isRoad(kind)) roadBlocks[b] = 1;
    if ((flags[i] ?? 0) & TileFlag.ZONE_CENTER) {
      const zone = zoneOf(kind);
      if (zone?.type === ZoneType.R && zone.density >= 5) denseHomes[b] = 1;
    }
  }

  const { resPop, comJobs, indJobs } = state.census;
  const employment = resPop === 0 ? 1 : (comJobs + indJobs) / resPop;
  const fireCover = state.field('fireCover');
  let populatedBlocks = 0;
  let unprotected = 0;
  for (let b = 0; b < density.length; b++) {
    if (!populated(b)) continue;
    populatedBlocks++;
    if ((fireCover[b] ?? 0) < 64) unprotected++;
  }
  const lots = state.census.zones.r + state.census.zones.c + state.census.zones.i;
  const lotShare = (n: number) => (lots === 0 || !state.census.utilityRules ? 0 : (n / lots) * 100);
  const fireGap = populatedBlocks === 0 ? 0 : (unprotected / populatedBlocks) * 100;

  return {
    crime: meanOf(state.field('crime'), populated),
    pollution: meanOf(state.field('pollution'), populated),
    // Housing only becomes a complaint above average land value (96 of 255).
    housing: Math.max(0, (meanOf(state.field('landValue'), (b) => denseHomes[b] === 1) * 2.55 - 96) / 1.59),
    taxes: Math.min(100, Math.max(0, state.taxRate - 7) * 8),
    traffic: meanOf(state.field('traffic'), (b) => roadBlocks[b] === 1),
    unemployment: Math.max(0, 1 - employment) * 100,
    fires: Math.min(100, fireGap + 2 * state.burnedThisYear),
    // Shares of zone lots without service, once the rules apply.
    water: lotShare(state.census.unwateredLots),
    garbage: lotShare(state.census.ungarbagedLots),
  };
}

/** Approval from the three worst problems: 100 − (0.5 · 1st + 0.3 · 2nd + 0.2 · 3rd). */
export function approvalFrom(sorted: readonly number[]): number {
  const [a = 0, b = 0, c = 0] = sorted;
  return Math.round(Math.min(100, Math.max(0, 100 - (0.5 * a + 0.3 * b + 0.2 * c))));
}

/** The full evaluation: problems (worst first, with poll shares and hotspots), approval, score, class. */
export function evaluate(state: CityState): Evaluation {
  const scores = problemScores(state);
  const ranked = (Object.entries(scores) as [ProblemId, number][]).sort((a, b) => b[1] - a[1]);
  const pollTotal = ranked.slice(0, 4).reduce((sum, [, s]) => sum + s, 0);
  const problems: Problem[] = ranked.map(([id, score], i) => {
    const spot = findHotspot(state, id);
    return {
      id,
      score: Math.round(score),
      percent: i < 4 && pollTotal > 0 ? Math.round((score / pollTotal) * 100) : 0,
      x: spot.x,
      y: spot.y,
      cause: spot.cause,
    };
  });
  // City Hall and monuments lift the mood, up to a cap.
  const approval = Math.min(100, approvalFrom(ranked.map(([, s]) => s)) + landmarkApproval(state));

  const density = state.field('popDensity');
  const police = state.field('policeCover');
  const fire = state.field('fireCover');
  let cover = 0;
  let n = 0;
  for (let b = 0; b < density.length; b++) {
    if ((density[b] ?? 0) === 0) continue;
    cover += ((police[b] ?? 0) + (fire[b] ?? 0)) / 2;
    n++;
  }
  const population = state.census.resPop;
  const growth = state.lastYearPop > 0 ? ((population - state.lastYearPop) / state.lastYearPop) * 100 : 0;
  const score = Math.round(approval * 5 + Math.min(250, Math.max(0, growth) * 25) + (n === 0 ? 0 : cover / n / 255) * 250);
  return {
    approval,
    score,
    scoreChange: score - state.lastYearScore,
    cityClass: CITY_CLASSES[cityClassFor(population)] as CityClass,
    population,
    problems,
  };
}

/** Headlines for a city's first bus riders, first subway trip and first tourists, once each. */
function announceFirsts(state: CityState, emit: (event: SimEvent) => void): void {
  const once = (flag: string, happened: boolean, headline: string) => {
    if (!happened || state.newsFlags.includes(flag)) return;
    state.newsFlags.push(flag);
    emit({ type: 'news', headline, x: null, y: null });
  };
  const c = state.census;
  once('bus', c.busRiders > 0, 'The first bus riders are on their way');
  once('subway', c.subwayRiders > 0, 'The subway opens! Trains are carrying their first passengers');
  once('tourism', state.tourism > 0, `Tourists arrive: $${state.tourism.toLocaleString('en-US')} this month`);
}

/** For a city saved before utilities: warn as the grace period runs out, then say the rules apply. */
function announceUtilityRules(state: CityState, emit: (event: SimEvent) => void): void {
  if (state.utilityGraceUntil === 0) return;
  const left = state.utilityGraceUntil - monthIndex(state);
  const news = (headline: string) => {
    emit({ type: 'news', headline, x: null, y: null });
  };
  if (left === 6 || left === 1) {
    news(`Water and garbage service will matter in ${left === 1 ? 'a month' : 'six months'}: build water towers and landfills near your neighbourhoods`);
  } else if (left === 0) news('Water and garbage rules are now in force: homes and shops without water stop at level 4');
}

/**
 * Monthly evaluation (so advisors are current), with promotions announced
 * as they happen and the yearly verdict at year end.
 */
export function evaluationSystem(emit: (event: SimEvent) => void): System {
  return {
    name: 'evaluation',
    phaseTicks: [13],
    run(state) {
      const evaluation = evaluate(state);
      state.evaluation = evaluation;
      const reached = cityClassFor(evaluation.population);
      if (reached > state.classReached) {
        // Every class passed this month unlocks its tools.
        const unlocked: UnlockId[] = [];
        for (let c = state.classReached + 1; c <= reached; c++) unlocked.push(...unlocksAt(c));
        state.classReached = reached;
        emit({ type: 'milestone', cityClass: evaluation.cityClass, population: evaluation.population, unlocked });
      }
      announceUtilityRules(state, emit);
      announceFirsts(state, emit);
      if (state.date.month !== MONTHS_PER_YEAR - 1) return;
      emit({
        type: 'evaluation',
        year: state.date.year,
        approval: evaluation.approval,
        approvalChange: state.lastYearApproval === null ? 0 : evaluation.approval - state.lastYearApproval,
        score: evaluation.score,
        scoreChange: evaluation.scoreChange,
      });
      state.lastYearApproval = evaluation.approval;
      state.lastYearScore = evaluation.score;
      state.lastYearPop = evaluation.population;
      state.burnedThisYear = 0;
      // Remember each zone's density, to spot where people leave next year.
      for (let i = 0; i < state.size * state.size; i++) {
        const zone = (state.flags[i] ?? 0) & TileFlag.ZONE_CENTER ? zoneOf(state.tiles[i] ?? 0) : null;
        state.densityAtYearStart[i] = zone?.density ?? 0;
      }
    },
  };
}

