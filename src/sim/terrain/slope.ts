import type { CityState } from '../state';

/** Corner heights of tile (x, y) in order NW, NE, SE, SW. */
export function tileCorners(state: CityState, x: number, y: number): [number, number, number, number] {
  const h = state.heights;
  const nw = state.cornerIndex(x, y);
  const sw = state.cornerIndex(x, y + 1);
  return [h[nw] ?? 0, h[nw + 1] ?? 0, h[sw + 1] ?? 0, h[sw] ?? 0];
}

/** Difference between the highest and lowest corner of a tile. */
export function maxCornerDelta(state: CityState, x: number, y: number): number {
  const c = tileCorners(state, x, y);
  return Math.max(...c) - Math.min(...c);
}

export function isFlat(state: CityState, x: number, y: number): boolean {
  return maxCornerDelta(state, x, y) === 0;
}
