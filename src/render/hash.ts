/**
 * Stable per-tile pseudo-random value in [0, 1) for visual variety (tree
 * placement, color jitter). Visual only: it never feeds the sim.
 */
export function hash3(x: number, y: number, k: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(k, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
