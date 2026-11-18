import { CHUNK_SHIFT, DEFAULT_FUNDS, type MapSize, START_YEAR } from '@/shared/constants';
import type { Census, CityInfo, GameDate, Valves } from '@/shared/protocol';
import { Rng } from './rng';

/**
 * Every 2×2-block field the sim keeps. `popPrev` is last month's density,
 * kept so `growth` can report the change.
 */
export const FIELD_NAMES = [
  'traffic',
  'pollution',
  'landValue',
  'crime',
  'popDensity',
  'popPrev',
  'growth',
  'policeCover',
  'fireCover',
] as const;

export function emptyCensus(): Census {
  return {
    resPop: 0,
    comJobs: 0,
    indJobs: 0,
    zones: { r: 0, c: 0, i: 0 },
    plants: { coal: 0, nuclear: 0 },
    specials: { stadium: 0, seaport: 0, airport: 0 },
    powerSupply: 0,
    powerDemand: 0,
    unpoweredZones: 0,
  };
}

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
  /**
   * Position of a tile inside a multi-tile footprint, size²: 0 = not part of
   * one, otherwise 1 + dx + 16·dy from the footprint's top-left tile.
   */
  readonly parts: Uint8Array;
  /** Named 2×2-block fields ((size/2)²), filled by later phases. */
  readonly blockFields: Record<string, Uint8Array> = {};

  funds = DEFAULT_FUNDS;
  readonly date: GameDate = { year: START_YEAR, month: 0, tick: 0 };
  /** Percent; phase 11 makes it editable. */
  taxRate = 7;
  census: Census = emptyCensus();
  readonly valves: Valves = { r: 0, c: 0, i: 0 };
  /** True while some zones are unpowered because plants are at capacity. */
  brownout = false;
  /** Year each demand cap was last announced, so it repeats only yearly. */
  readonly capNotified: Record<'r' | 'c' | 'i', number> = { r: -1, c: -1, i: -1 };
  /** Service funding, percent of full. Phase 11's budget window edits it. */
  readonly funding = { road: 100, police: 100, fire: 100 };

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
    this.parts = new Uint8Array(size * size);
    const blocks = (size / 2) * (size / 2);
    for (const name of FIELD_NAMES) this.blockFields[name] = new Uint8Array(blocks);
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

  /** Index of the 2×2 block holding tile (x, y) in a block field. */
  blockIndex(x: number, y: number): number {
    return (y >> 1) * (this.size >> 1) + (x >> 1);
  }

  /** A named block field; throws if a system forgot to create it. */
  field(name: string): Uint8Array {
    const f = this.blockFields[name];
    if (!f) throw new Error(`Missing block field ${name}`);
    return f;
  }

  chunkId(x: number, y: number): number {
    return (y >> CHUNK_SHIFT) * this.chunksPerSide + (x >> CHUNK_SHIFT);
  }

  markDirty(x: number, y: number): void {
    this.dirtyChunks.add(this.chunkId(x, y));
  }

  /** A tile and its four neighbours, whose connections may change with it. */
  markDirtyAround(x: number, y: number): void {
    this.markDirty(x, y);
    if (x > 0) this.markDirty(x - 1, y);
    if (y > 0) this.markDirty(x, y - 1);
    if (x < this.size - 1) this.markDirty(x + 1, y);
    if (y < this.size - 1) this.markDirty(x, y + 1);
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
