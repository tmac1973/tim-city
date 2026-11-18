import { CHUNK_SHIFT, CHUNK_SIZE, type MapSize } from '@/shared/constants';
import type { ChunkSlice } from '@/shared/protocol';
import { HEIGHT_UNIT } from './units';

type ChunkListener = (id: number) => void;

/** Main-thread copy of the sim's tile arrays, patched chunk by chunk. */
export class CityMirror {
  readonly chunksPerSide: number;
  readonly tiles: Uint16Array;
  readonly flags: Uint8Array;
  readonly heights: Uint8Array;
  private readonly listeners = new Set<ChunkListener>();

  constructor(readonly size: MapSize) {
    this.chunksPerSide = size >> CHUNK_SHIFT;
    this.tiles = new Uint16Array(size * size);
    this.flags = new Uint8Array(size * size);
    this.heights = new Uint8Array((size + 1) * (size + 1));
  }

  onChunkChanged(listener: ChunkListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  apply(chunks: readonly ChunkSlice[]): void {
    for (const chunk of chunks) {
      const x0 = (chunk.id % this.chunksPerSide) * CHUNK_SIZE;
      const y0 = Math.floor(chunk.id / this.chunksPerSide) * CHUNK_SIZE;
      for (let row = 0; row < CHUNK_SIZE; row++) {
        const to = (y0 + row) * this.size + x0;
        const from = row * CHUNK_SIZE;
        this.tiles.set(chunk.tiles.subarray(from, from + CHUNK_SIZE), to);
        this.flags.set(chunk.flags.subarray(from, from + CHUNK_SIZE), to);
      }
      const side = CHUNK_SIZE + 1;
      for (let row = 0; row < side; row++) {
        const to = (y0 + row) * (this.size + 1) + x0;
        this.heights.set(chunk.heights.subarray(row * side, (row + 1) * side), to);
      }
    }
    for (const chunk of chunks) for (const listener of this.listeners) listener(chunk.id);
  }

  tile(x: number, y: number): number {
    return this.tiles[y * this.size + x] ?? 0;
  }

  /** Height step of corner (x, y). */
  corner(x: number, y: number): number {
    return this.heights[y * (this.size + 1) + x] ?? 0;
  }

  /** World Y of the terrain at world (x, z), bilinear between tile corners. */
  heightAt(x: number, z: number): number {
    const cx = Math.min(this.size - 1, Math.max(0, Math.floor(x)));
    const cz = Math.min(this.size - 1, Math.max(0, Math.floor(z)));
    const fx = Math.min(1, Math.max(0, x - cx));
    const fz = Math.min(1, Math.max(0, z - cz));
    const top = this.corner(cx, cz) * (1 - fx) + this.corner(cx + 1, cz) * fx;
    const bottom = this.corner(cx, cz + 1) * (1 - fx) + this.corner(cx + 1, cz + 1) * fx;
    return (top * (1 - fz) + bottom * fz) * HEIGHT_UNIT;
  }
}
