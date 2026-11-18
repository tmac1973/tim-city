import { CHUNK_SHIFT, CHUNK_SIZE, type MapSize } from '@/shared/constants';
import type { ChunkSlice } from '@/shared/protocol';
import { TileFlag, TileKind } from '@/shared/tiles';
import { HEIGHT_UNIT, tileHeight } from './units';

/** What changed in a chunk, as bits, so each layer rebuilds only when it must. */
export const Changed = {
  TILES: 1,
  FLAGS: 2,
  HEIGHTS: 4,
  PARTS: 8,
  /** The POTHOLED bit of any tile (roads draw worn asphalt). */
  POTHOLES: 16,
  /** A road, rail or power tile appeared, went or changed kind. */
  NETWORK: 32,
  /** A tree or water tile appeared or went (terrain, water and tree layers). */
  NATURE: 64,
} as const;

const isNetworkKind = (k: number) => k >= 16 && k <= 63;
const isNatureKind = (k: number) => k === TileKind.Tree || k === TileKind.Water;

type ChunkListener = (id: number, changed: number) => void;

/** Main-thread copy of the sim's tile arrays, patched chunk by chunk. */
export class CityMirror {
  readonly chunksPerSide: number;
  readonly tiles: Uint16Array;
  readonly flags: Uint8Array;
  readonly parts: Uint8Array;
  readonly zoneTier: Uint8Array;
  readonly heights: Uint8Array;
  private readonly listeners = new Set<ChunkListener>();

  constructor(readonly size: MapSize) {
    this.chunksPerSide = size >> CHUNK_SHIFT;
    this.tiles = new Uint16Array(size * size);
    this.flags = new Uint8Array(size * size);
    this.parts = new Uint8Array(size * size);
    this.zoneTier = new Uint8Array(size * size);
    this.heights = new Uint8Array((size + 1) * (size + 1));
  }

  onChunkChanged(listener: ChunkListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  apply(chunks: readonly ChunkSlice[]): void {
    const changes: number[] = [];
    for (const chunk of chunks) {
      const x0 = (chunk.id % this.chunksPerSide) * CHUNK_SIZE;
      const y0 = Math.floor(chunk.id / this.chunksPerSide) * CHUNK_SIZE;
      let changed = 0;
      for (let row = 0; row < CHUNK_SIZE; row++) {
        const to = (y0 + row) * this.size + x0;
        const from = row * CHUNK_SIZE;
        for (let k = 0; k < CHUNK_SIZE; k++) {
          const i = to + k;
          const j = from + k;
          const tile = chunk.tiles[j] ?? 0;
          const flag = chunk.flags[j] ?? 0;
          const part = chunk.parts[j] ?? 0;
          const tier = chunk.zoneTier[j] ?? 0;
          const oldFlag = this.flags[i] ?? 0;
          const old = this.tiles[i] ?? 0;
          if (old !== tile) {
            changed |= Changed.TILES;
            if (isNetworkKind(old) || isNetworkKind(tile)) changed |= Changed.NETWORK;
            if (isNatureKind(old) || isNatureKind(tile)) changed |= Changed.NATURE;
          }
          if (oldFlag !== flag) {
            changed |= Changed.FLAGS;
            if ((oldFlag ^ flag) & TileFlag.POTHOLED) changed |= Changed.POTHOLES;
          }
          // A tier change redraws the lot markers, like a new footprint.
          if (this.parts[i] !== part || this.zoneTier[i] !== tier) changed |= Changed.PARTS;
          this.tiles[i] = tile;
          this.flags[i] = flag;
          this.parts[i] = part;
          this.zoneTier[i] = tier;
        }
      }
      const side = CHUNK_SIZE + 1;
      for (let row = 0; row < side; row++) {
        const to = (y0 + row) * (this.size + 1) + x0;
        for (let k = 0; k < side; k++) {
          const h = chunk.heights[row * side + k] ?? 0;
          if (this.heights[to + k] !== h) {
            changed |= Changed.HEIGHTS;
            this.heights[to + k] = h;
          }
        }
      }
      // The first slice of a chunk always counts as a full change.
      if (!this.seen.has(chunk.id)) {
        this.seen.add(chunk.id);
        changed = 0xff;
      }
      changes.push(changed);
    }
    chunks.forEach((chunk, k) => {
      const changed = changes[k] ?? 0;
      if (changed === 0) return;
      for (const listener of this.listeners) listener(chunk.id, changed);
    });
  }

  private readonly seen = new Set<number>();

  tile(x: number, y: number): number {
    return this.tiles[y * this.size + x] ?? 0;
  }

  flag(x: number, y: number): number {
    return this.flags[y * this.size + x] ?? 0;
  }

  /** Height step of corner (x, y). */
  corner(x: number, y: number): number {
    return this.heights[y * (this.size + 1) + x] ?? 0;
  }

  /**
   * World Y of the terrain surface at world (x, z), exact on the same two
   * triangles per tile that the terrain mesh draws.
   */
  heightAt(x: number, z: number): number {
    const cx = Math.min(this.size - 1, Math.max(0, Math.floor(x)));
    const cz = Math.min(this.size - 1, Math.max(0, Math.floor(z)));
    const fx = Math.min(1, Math.max(0, x - cx));
    const fz = Math.min(1, Math.max(0, z - cz));
    const h = tileHeight(
      this.corner(cx, cz),
      this.corner(cx + 1, cz),
      this.corner(cx + 1, cz + 1),
      this.corner(cx, cz + 1),
      fx,
      fz,
    );
    return h * HEIGHT_UNIT;
  }
}
