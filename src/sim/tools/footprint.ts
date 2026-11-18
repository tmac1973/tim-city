import { FOOTPRINTS } from '@/shared/tiles';
import type { CityState } from '../state';

/** Fill a size×size footprint of `kind` with its top-left tile at (x, y). */
export function placeFootprint(state: CityState, x: number, y: number, kind: number): void {
  const size = FOOTPRINTS.get(kind);
  if (size === undefined) throw new Error(`Kind ${String(kind)} has no footprint`);
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const i = state.index(x + dx, y + dy);
      state.tiles[i] = kind;
      state.parts[i] = 1 + dx + 16 * dy;
      state.markDirtyAround(x + dx, y + dy);
    }
  }
}

/** Forget that tile `i` belonged to a footprint (it was cleared or wrecked). */
export function clearPart(state: CityState, i: number): void {
  state.parts[i] = 0;
  state.zoneTier[i] = 0;
}

/** Top-left tile and side length of the footprint containing tile (x, y), if any. */
export function footprintAt(state: CityState, x: number, y: number): { x: number; y: number; size: number } | null {
  const part = state.parts[state.index(x, y)] ?? 0;
  if (part === 0) return null;
  const dx = (part - 1) % 16;
  const dy = Math.floor((part - 1) / 16);
  const ox = x - dx;
  const oy = y - dy;
  const size = FOOTPRINTS.get(state.tiles[state.index(ox, oy)] ?? 0);
  return size === undefined ? null : { x: ox, y: oy, size };
}
