import { TileFlag, TileKind } from '@/shared/tiles';
import type { System } from '../scheduler';
import type { CityState } from '../state';
import { blockGeometry, store } from './fields';
import { hasRoadAccess } from './zones';

/** Tiles over which a station's coverage fades to nothing. */
export const COVERAGE_RADIUS = 20;

/**
 * Monthly police and fire coverage. Each station radiates 255 × funding at
 * its centre, fading linearly to 0 at 20 tiles; overlapping stations add
 * up. A station without power or road access works at half strength.
 */
export function updateCoverage(state: CityState): void {
  const { side, centre } = blockGeometry(state);
  const police = new Float32Array(side * side);
  const fire = new Float32Array(side * side);
  const { size, tiles, parts, flags } = state;
  for (let i = 0; i < size * size; i++) {
    const kind = tiles[i] ?? 0;
    if (parts[i] !== 1 || (kind !== TileKind.PoliceStation && kind !== TileKind.FireStation)) continue;
    const sx = (i % size) + 1;
    const sy = Math.floor(i / size) + 1;
    const working = ((flags[state.index(sx, sy)] ?? 0) & TileFlag.POWERED) !== 0 && hasRoadAccess(state, sx, sy);
    const funding = kind === TileKind.PoliceStation ? state.funding.police : state.funding.fire;
    const strength = (255 * funding) / 100 * (working ? 1 : 0.5);
    const target = kind === TileKind.PoliceStation ? police : fire;
    const reach = Math.ceil(COVERAGE_RADIUS / 2);
    const sbx = sx >> 1;
    const sby = sy >> 1;
    for (let by = Math.max(0, sby - reach); by <= Math.min(side - 1, sby + reach); by++) {
      for (let bx = Math.max(0, sbx - reach); bx <= Math.min(side - 1, sbx + reach); bx++) {
        const b = by * side + bx;
        const [tx, ty] = centre(b);
        const d = Math.hypot(tx - (sx + 0.5), ty - (sy + 0.5));
        if (d < COVERAGE_RADIUS) target[b] = (target[b] ?? 0) + strength * (1 - d / COVERAGE_RADIUS);
      }
    }
  }
  store(state.field('policeCover'), police);
  store(state.field('fireCover'), fire);
}

export const coverageSystem: System = { name: 'coverage', phaseTicks: [8], run: updateCoverage };
