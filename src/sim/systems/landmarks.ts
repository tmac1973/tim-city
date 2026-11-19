import { LANDMARK_APPROVAL, LANDMARK_REACH, type LandmarkName, MAX_LANDMARK_APPROVAL, TOURISM_BASE } from '@/shared/costs';
import { isLandmark, LANDMARK_SIZES, TileFlag, TileKind } from '@/shared/tiles';
import type { System } from '../scheduler';
import type { CityState } from '../state';
import { radiate } from './coverage';
import { blockGeometry, store } from './fields';
import { reachesEdge } from './traffic';
import { hasRoadAccess } from './zones';

const NAMES: Record<number, LandmarkName> = {
  [TileKind.CityHall]: 'cityHall',
  [TileKind.Hospital]: 'hospital',
  [TileKind.University]: 'university',
  [TileKind.Museum]: 'museum',
  [TileKind.Zoo]: 'zoo',
  [TileKind.AmusementPark]: 'amusementPark',
  [TileKind.Statue]: 'statue',
  [TileKind.ClockTower]: 'clockTower',
  [TileKind.TimSign]: 'timSign',
};

export const landmarkName = (kind: number): LandmarkName | undefined => NAMES[kind];

export interface Landmark {
  name: LandmarkName;
  kind: number;
  /** Top-left tile and side. */
  x: number;
  y: number;
  size: number;
  /** The tile at the middle of the footprint. */
  cx: number;
  cy: number;
  /** Powered and beside a road; a landmark that isn't works at half. */
  working: boolean;
}

/** Every landmark in the city, in map order. */
export function landmarks(state: CityState): Landmark[] {
  const out: Landmark[] = [];
  const { size, tiles, parts } = state;
  for (let i = 0; i < size * size; i++) {
    const kind = tiles[i] ?? 0;
    if (parts[i] !== 1 || !isLandmark(kind)) continue;
    const name = NAMES[kind];
    if (!name) continue;
    const side = LANDMARK_SIZES[kind] ?? 1;
    const x = i % size;
    const y = Math.floor(i / size);
    const cx = x + Math.floor(side / 2);
    const cy = y + Math.floor(side / 2);
    const working = ((state.flags[state.index(cx, cy)] ?? 0) & TileFlag.POWERED) !== 0 && hasRoadAccess(state, cx, cy);
    out.push({ name, kind, x, y, size: side, cx, cy, working });
  }
  return out;
}

const strengthOf = (l: Landmark) => (LANDMARK_REACH[l.name]?.strength ?? 0) * (l.working ? 1 : 0.5);

/** Monthly health (hospitals) and education (the university) coverage. */
export function updateLandmarkCover(state: CityState): void {
  const { side } = blockGeometry(state);
  const health = new Float32Array(side * side);
  const education = new Float32Array(side * side);
  for (const l of landmarks(state)) {
    const reach = LANDMARK_REACH[l.name];
    if (!reach) continue;
    if (l.name === 'hospital') radiate(state, health, l.cx, l.cy, reach.radius, strengthOf(l));
    if (l.name === 'university') radiate(state, education, l.cx, l.cy, reach.radius, strengthOf(l));
  }
  store(state.field('healthCover'), health);
  store(state.field('educationCover'), education);
}

/** Land value added around leisure landmarks and monuments, per block. */
export function landmarkLandValue(state: CityState): Float32Array {
  const { side } = blockGeometry(state);
  const boost = new Float32Array(side * side);
  for (const l of landmarks(state)) {
    if (l.name === 'hospital' || l.name === 'university') continue;
    const reach = LANDMARK_REACH[l.name];
    if (reach) radiate(state, boost, l.cx, l.cy, reach.radius, strengthOf(l));
  }
  return boost;
}

/** Approval the city's landmarks add (half for one that isn't working), capped. */
export function landmarkApproval(state: CityState): number {
  let bonus = 0;
  for (const l of landmarks(state)) bonus += (LANDMARK_APPROVAL[l.name] ?? 0) * (l.working ? 1 : 0.5);
  return Math.min(MAX_LANDMARK_APPROVAL, Math.floor(bonus));
}

/** Yearly upkeep of the city's landmarks. */
export function landmarkUpkeep(state: CityState, upkeep: Record<LandmarkName, number>): number {
  return landmarks(state).reduce((sum, l) => sum + upkeep[l.name], 0);
}

/** This month's tourism from one landmark: none unless it works and a road reaches it from the map edge. */
export function tourismFrom(state: CityState, l: Landmark): number {
  const base = TOURISM_BASE[l.name] ?? 0;
  if (base === 0 || !l.working || !reachesEdge(state, l.cx, l.cy)) return 0;
  const b = state.blockIndex(l.cx, l.cy);
  const spoil = ((state.field('crime')[b] ?? 0) + (state.field('pollution')[b] ?? 0)) / 510;
  return Math.floor(base * (1 - spoil));
}

/** Tourism income for the month, from every leisure landmark. */
export function updateTourism(state: CityState): void {
  state.tourism = landmarks(state).reduce((sum, l) => sum + tourismFrom(state, l), 0);
}

export const tourismSystem: System = { name: 'tourism', phaseTicks: [9], run: updateTourism };
