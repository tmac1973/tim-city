import type { CityState } from '../state';

/** One 3×3 box blur of a block field, edges clamped. */
export function blur(values: Float32Array, side: number): Float32Array {
  const out = new Float32Array(values.length);
  for (let by = 0; by < side; by++) {
    for (let bx = 0; bx < side; bx++) {
      let sum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = bx + dx;
          const y = by + dy;
          if (x < 0 || y < 0 || x >= side || y >= side) continue;
          sum += values[y * side + x] ?? 0;
          n++;
        }
      }
      out[by * side + bx] = sum / n;
    }
  }
  return out;
}

/** Write floats into a 0–255 block field. */
export function store(target: Uint8Array, values: Float32Array): void {
  for (let i = 0; i < target.length; i++) target[i] = Math.min(255, Math.max(0, Math.round(values[i] ?? 0)));
}

/** Blocks per side, and the tile at the centre of block b (its top-left + 1). */
export function blockGeometry(state: CityState): { side: number; centre: (b: number) => [number, number] } {
  const side = state.size >> 1;
  return { side, centre: (b) => [(b % side) * 2 + 1, Math.floor(b / side) * 2 + 1] };
}

/** Visit every tile in the square of radius r around (cx, cy) that lies on the map. */
export function around(state: CityState, cx: number, cy: number, r: number, visit: (i: number) => void): void {
  for (let y = Math.max(0, cy - r); y <= Math.min(state.size - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(state.size - 1, cx + r); x++) visit(y * state.size + x);
  }
}

/** Number of tiles within radius r of (cx, cy) matching the test. */
export function countAround(state: CityState, cx: number, cy: number, r: number, test: (kind: number) => boolean): number {
  let n = 0;
  around(state, cx, cy, r, (i) => {
    if (test(state.tiles[i] ?? 0)) n++;
  });
  return n;
}
