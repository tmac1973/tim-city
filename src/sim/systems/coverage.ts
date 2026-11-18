import { UTILITY } from '@/shared/costs';
import { FOOTPRINTS, TileFlag, TileKind, zoneOf } from '@/shared/tiles';
import type { System } from '../scheduler';
import type { CityState } from '../state';
import { blockGeometry, store } from './fields';
import { updateLandmarkCover } from './landmarks';
import { hasRoadAccess } from './zones';

/** Tiles over which a station's coverage fades to nothing. */
export const COVERAGE_RADIUS = 20;

/**
 * Add a station's coverage to `target` (a block buffer): `strength` at its
 * centre (sx + 0.5, sy + 0.5), fading linearly to 0 at `radius` tiles.
 */
export function radiate(state: CityState, target: Float32Array, sx: number, sy: number, radius: number, strength: number): void {
  const { side, centre } = blockGeometry(state);
  const reach = Math.ceil(radius / 2);
  const sbx = sx >> 1;
  const sby = sy >> 1;
  for (let by = Math.max(0, sby - reach); by <= Math.min(side - 1, sby + reach); by++) {
    for (let bx = Math.max(0, sbx - reach); bx <= Math.min(side - 1, sbx + reach); bx++) {
      const b = by * side + bx;
      const [tx, ty] = centre(b);
      const d = Math.hypot(tx - (sx + 0.5), ty - (sy + 0.5));
      if (d < radius) target[b] = (target[b] ?? 0) + strength * (1 - d / radius);
    }
  }
}

/** Whether the building whose centre tile is (sx, sy) has power and a road nearby. */
function working(state: CityState, sx: number, sy: number): boolean {
  return ((state.flags[state.index(sx, sy)] ?? 0) & TileFlag.POWERED) !== 0 && hasRoadAccess(state, sx, sy);
}

/**
 * Monthly police and fire coverage. Each station radiates 255 × funding at
 * its centre, fading linearly to 0 at 20 tiles; overlapping stations add
 * up. A station without power or road access works at half strength.
 */
export function updateCoverage(state: CityState): void {
  const { side } = blockGeometry(state);
  const police = new Float32Array(side * side);
  const fire = new Float32Array(side * side);
  const { size, tiles, parts } = state;
  for (let i = 0; i < size * size; i++) {
    const kind = tiles[i] ?? 0;
    if (parts[i] !== 1 || (kind !== TileKind.PoliceStation && kind !== TileKind.FireStation)) continue;
    const sx = (i % size) + 1;
    const sy = Math.floor(i / size) + 1;
    const funding = kind === TileKind.PoliceStation ? state.funding.police : state.funding.fire;
    const strength = (255 * funding) / 100 * (working(state, sx, sy) ? 1 : 0.5);
    radiate(state, kind === TileKind.PoliceStation ? police : fire, sx, sy, COVERAGE_RADIUS, strength);
  }
  store(state.field('policeCover'), police);
  store(state.field('fireCover'), fire);
  updateUtilities(state);
  updateLandmarkCover(state);
}

/**
 * Monthly water and garbage coverage. Each water tower (and landfill)
 * serves the zone lots around it up to its capacity in zone levels: its
 * strength is 255 × min(1, capacity / levels in reach) × utilities funding,
 * halved without power or a road. Coverage fades with distance as police
 * coverage does.
 */
export function updateUtilities(state: CityState): void {
  const { side } = blockGeometry(state);
  const water = new Float32Array(side * side);
  const garbage = new Float32Array(side * side);
  const { size, tiles, parts, flags } = state;
  // Zone centres and their levels, gathered once.
  const lots: [number, number, number][] = [];
  for (let i = 0; i < size * size; i++) {
    if (!((flags[i] ?? 0) & TileFlag.ZONE_CENTER)) continue;
    const zone = zoneOf(tiles[i] ?? 0);
    if (zone) lots.push([i % size, Math.floor(i / size), Math.max(1, zone.density)]);
  }
  for (let i = 0; i < size * size; i++) {
    const kind = tiles[i] ?? 0;
    if (parts[i] !== 1 || (kind !== TileKind.WaterTower && kind !== TileKind.Landfill)) continue;
    const spec = kind === TileKind.WaterTower ? UTILITY.waterTower : UTILITY.landfill;
    const half = (FOOTPRINTS.get(kind) ?? 2) / 2;
    const cx = (i % size) + half;
    const cy = Math.floor(i / size) + half;
    let demand = 0;
    for (const [lx, ly, level] of lots) if (Math.hypot(lx + 0.5 - cx, ly + 0.5 - cy) < spec.radius) demand += level;
    const sx = Math.floor(cx);
    const sy = Math.floor(cy);
    const strength = 255 * Math.min(1, spec.capacity / Math.max(1, demand)) * (state.funding.utilities / 100) * (working(state, sx, sy) ? 1 : 0.5);
    radiate(state, kind === TileKind.WaterTower ? water : garbage, sx, sy, spec.radius, strength);
  }
  store(state.field('waterCover'), water);
  store(state.field('garbageCover'), garbage);
}

export const coverageSystem: System = { name: 'coverage', phaseTicks: [8], run: updateCoverage };
