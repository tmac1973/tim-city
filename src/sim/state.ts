import { CHUNK_SHIFT, DEFAULT_FUNDS, type MapSize, START_YEAR } from '@/shared/constants';
import type { CityInfo, GameDate } from '@/shared/protocol';
import { Rng } from './rng';

/**
 * All city state, held in flat typed arrays so it can run in a worker, copy
 * cheaply to the main thread, and serialize byte-for-byte.
 */
export class CityState {
  readonly name: string;
  readonly seed: string;
  readonly size: MapSize;
  readonly chunksPerSide: number;

  /** Tile kind per tile, size². */
  readonly tiles: Uint16Array;
  /** TileFlag bits per tile, size². */
  readonly flags: Uint8Array;
  /** Integer height per tile corner, (size+1)². */
  readonly heights: Uint8Array;
  /** Named 2×2-block fields ((size/2)²), filled by later phases. */
  readonly blockFields: Record<string, Uint8Array> = {};

  funds = DEFAULT_FUNDS;
  readonly date: GameDate = { year: START_YEAR, month: 0, tick: 0 };

  /** Chunk ids changed since the last time the worker shipped them. */
  readonly dirtyChunks = new Set<number>();

  private readonly rootRng: Rng;
  private readonly streams = new Map<string, Rng>();

  constructor({ name, seed, size }: CityInfo) {
    this.name = name;
    this.seed = seed;
    this.size = size;
    this.chunksPerSide = size >> CHUNK_SHIFT;
    this.tiles = new Uint16Array(size * size);
    this.flags = new Uint8Array(size * size);
    this.heights = new Uint8Array((size + 1) * (size + 1));
    this.rootRng = new Rng(seed);
  }

  /** The named random stream for one system; created on first use. */
  random(label: string): Rng {
    let rng = this.streams.get(label);
    if (!rng) {
      rng = this.rootRng.fork(label);
      this.streams.set(label, rng);
    }
    return rng;
  }

  /** Every stream's state, sorted by label, for determinism checks and saves. */
  randomStates(): [string, ReturnType<Rng['getState']>][] {
    return [...this.streams.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([label, rng]) => [label, rng.getState()]);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.size && y < this.size;
  }

  index(x: number, y: number): number {
    return y * this.size + x;
  }

  cornerIndex(x: number, y: number): number {
    return y * (this.size + 1) + x;
  }

  chunkId(x: number, y: number): number {
    return (y >> CHUNK_SHIFT) * this.chunksPerSide + (x >> CHUNK_SHIFT);
  }

  markDirty(x: number, y: number): void {
    this.dirtyChunks.add(this.chunkId(x, y));
  }

  /** A corner touches up to four tiles, which may sit in four chunks. */
  markCornerDirty(x: number, y: number): void {
    for (let ty = y - 1; ty <= y; ty++) {
      for (let tx = x - 1; tx <= x; tx++) {
        if (this.inBounds(tx, ty)) this.markDirty(tx, ty);
      }
    }
  }

  markAllDirty(): void {
    const count = this.chunksPerSide * this.chunksPerSide;
    for (let id = 0; id < count; id++) this.dirtyChunks.add(id);
  }
}
