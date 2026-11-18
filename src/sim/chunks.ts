import { CHUNK_SIZE } from '@/shared/constants';
import type { ChunkSlice } from '@/shared/protocol';
import type { CityState } from './state';

/** Copy one chunk's tiles, flags and corner heights out of the state. */
export function extractChunk(state: CityState, id: number): ChunkSlice {
  const x0 = (id % state.chunksPerSide) * CHUNK_SIZE;
  const y0 = Math.floor(id / state.chunksPerSide) * CHUNK_SIZE;

  const tiles = new Uint16Array(CHUNK_SIZE * CHUNK_SIZE);
  const flags = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  const parts = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  const zoneTier = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
  for (let row = 0; row < CHUNK_SIZE; row++) {
    const from = state.index(x0, y0 + row);
    tiles.set(state.tiles.subarray(from, from + CHUNK_SIZE), row * CHUNK_SIZE);
    flags.set(state.flags.subarray(from, from + CHUNK_SIZE), row * CHUNK_SIZE);
    parts.set(state.parts.subarray(from, from + CHUNK_SIZE), row * CHUNK_SIZE);
    zoneTier.set(state.zoneTier.subarray(from, from + CHUNK_SIZE), row * CHUNK_SIZE);
  }

  const side = CHUNK_SIZE + 1;
  const heights = new Uint8Array(side * side);
  for (let row = 0; row < side; row++) {
    const from = state.cornerIndex(x0, y0 + row);
    heights.set(state.heights.subarray(from, from + side), row * side);
  }

  return { id, tiles, flags, parts, zoneTier, heights };
}

/** Extract and clear every dirty chunk, in ascending id order. */
export function takeDirtyChunks(state: CityState): ChunkSlice[] {
  const ids = [...state.dirtyChunks].sort((a, b) => a - b);
  state.dirtyChunks.clear();
  return ids.map((id) => extractChunk(state, id));
}
