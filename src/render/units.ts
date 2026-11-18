import { SEA_LEVEL } from '@/shared/constants';

/** World units: a tile is 1 × 1; one height step is HEIGHT_UNIT tall. */
export const HEIGHT_UNIT = 0.5;

/**
 * Water surface height. River and lake beds are carved to sea level, so the
 * surface sits a little above it to give them visible depth.
 */
export const WATER_Y = SEA_LEVEL * HEIGHT_UNIT + 0.2;

/** Bottom of the diorama slab's side skirt. */
export const SKIRT_BOTTOM_Y = -3;

/**
 * Which diagonal splits a tile into two triangles. Splitting between two
 * equal corners keeps one triangle flat; otherwise use the flatter diagonal.
 * Terrain meshing and picking must agree, so both use this.
 */
export function splitsNwSe(nw: number, ne: number, se: number, sw: number): boolean {
  if (nw === se) return true;
  if (ne === sw) return false;
  return Math.abs(nw - se) <= Math.abs(ne - sw);
}

/**
 * Height inside a tile at fraction (fx, fz), on the same two triangles the
 * terrain mesh draws for corners nw, ne, se, sw.
 */
export function tileHeight(nw: number, ne: number, se: number, sw: number, fx: number, fz: number): number {
  if (splitsNwSe(nw, ne, se, sw)) {
    return fz > fx ? nw + (se - sw) * fx + (sw - nw) * fz : nw + (ne - nw) * fx + (se - ne) * fz;
  }
  return fx + fz <= 1 ? nw + (ne - nw) * fx + (sw - nw) * fz : se + (sw - se) * (1 - fx) + (ne - se) * (1 - fz);
}
