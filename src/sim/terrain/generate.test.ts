import { describe, expect, it } from 'vitest';
import { type MapSize, SEA_LEVEL } from '@/shared/constants';
import type { TerrainOptions } from '@/shared/protocol';
import { TileKind } from '@/shared/tiles';
import { CityState } from '../state';
import { generateTerrain, type TerrainReport } from './generate';

const SEEDS = ['tim', 'alpha', 'river-test', '42', 'coastline'];

function make(seed: string, opts: TerrainOptions, size: MapSize = 128): { state: CityState; report: TerrainReport } {
  const state = new CityState({ name: 'T', seed, size });
  const report = generateTerrain(state, opts);
  return { state, report };
}

function count(state: CityState, kind: number): number {
  return state.tiles.reduce((n, t) => (t === kind ? n + 1 : n), 0);
}

describe('generateTerrain', () => {
  it('is deterministic for the same seed and sliders', () => {
    const opts = { water: 60, forest: 50, hills: 70 };
    const a = make('same', opts).state;
    const b = make('same', opts).state;
    expect(Buffer.from(a.heights).equals(Buffer.from(b.heights))).toBe(true);
    expect(Buffer.from(a.tiles.buffer).equals(Buffer.from(b.tiles.buffer))).toBe(true);
    const c = make('different', opts).state;
    expect(Buffer.from(a.heights).equals(Buffer.from(c.heights))).toBe(false);
  });

  it.each(SEEDS)('keeps adjacent corners within 1 step (seed %s)', (seed) => {
    const { state } = make(seed, { water: 80, forest: 30, hills: 100 });
    const side = state.size + 1;
    const h = state.heights;
    for (let y = 0; y < side; y++) {
      for (let x = 0; x < side; x++) {
        const v = h[y * side + x] ?? 0;
        if (x + 1 < side) expect(Math.abs(v - (h[y * side + x + 1] ?? 0))).toBeLessThanOrEqual(1);
        if (y + 1 < side) expect(Math.abs(v - (h[(y + 1) * side + x] ?? 0))).toBeLessThanOrEqual(1);
      }
    }
  });

  it.each(SEEDS)('makes no water at water = 0 and at least 25%% water at water = 100 (seed %s)', (seed) => {
    expect(count(make(seed, { water: 0, forest: 40, hills: 60 }).state, TileKind.Water)).toBe(0);
    const wet = make(seed, { water: 100, forest: 40, hills: 60 }).state;
    expect(count(wet, TileKind.Water)).toBeGreaterThanOrEqual(0.25 * wet.size * wet.size);
  });

  it('makes no trees at forest = 0 and many at forest = 100', () => {
    expect(count(make('tim', { water: 50, forest: 0, hills: 50 }).state, TileKind.Tree)).toBe(0);
    const woods = make('tim', { water: 0, forest: 100, hills: 50 }).state;
    expect(count(woods, TileKind.Tree)).toBeGreaterThan(0.9 * woods.size * woods.size);
  });

  it('keeps a near-flat map at hills = 0', () => {
    const { state } = make('flat', { water: 0, forest: 0, hills: 0 });
    expect(Math.max(...state.heights) - Math.min(...state.heights)).toBeLessThanOrEqual(2);
  });

  it('marks water exactly where all four corners are at or below sea level', () => {
    const { state } = make('tim', { water: 70, forest: 40, hills: 60 });
    for (let y = 0; y < state.size; y++) {
      for (let x = 0; x < state.size; x++) {
        const corners = [
          state.cornerIndex(x, y),
          state.cornerIndex(x + 1, y),
          state.cornerIndex(x, y + 1),
          state.cornerIndex(x + 1, y + 1),
        ].map((i) => state.heights[i] ?? 0);
        const wet = corners.every((v) => v <= SEA_LEVEL);
        expect(state.tiles[state.index(x, y)] === TileKind.Water).toBe(wet);
      }
    }
  });

  it.each(SEEDS)('connects every river tile to the map edge or the sea (seed %s)', (seed) => {
    const { state, report } = make(seed, { water: 90, forest: 40, hills: 80 });
    expect(report.riverTiles.length).toBeGreaterThan(0);

    const { size } = state;
    const reached = new Uint8Array(size * size);
    const queue: number[] = [];
    for (let i = 0; i < size; i++) {
      for (const [x, y] of [[i, 0], [i, size - 1], [0, i], [size - 1, i]] as const) {
        const t = state.index(x, y);
        if (state.tiles[t] === TileKind.Water && !reached[t]) {
          reached[t] = 1;
          queue.push(t);
        }
      }
    }
    while (queue.length > 0) {
      const t = queue.pop() ?? 0;
      const x = t % size;
      const y = (t - x) / size;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
        if (!state.inBounds(nx, ny)) continue;
        const n = state.index(nx, ny);
        if (!reached[n] && state.tiles[n] === TileKind.Water) {
          reached[n] = 1;
          queue.push(n);
        }
      }
    }
    const stranded = report.riverTiles.filter((t) => !reached[t]);
    expect(stranded).toEqual([]);
  });

  it('makes lakes when water ≥ 20', () => {
    const { report } = make('lakes', { water: 40, forest: 40, hills: 60 });
    expect(report.lakeTiles.length).toBeGreaterThan(0);
  });

  it('marks every chunk dirty', () => {
    const { state } = make('tim', { water: 50, forest: 40, hills: 40 });
    expect(state.dirtyChunks.size).toBe(state.chunksPerSide ** 2);
  });

  it('generates a 256 map in under 200 ms', () => {
    make('warmup', { water: 80, forest: 50, hills: 80 }, 256);
    const start = performance.now();
    make('timed', { water: 80, forest: 50, hills: 80 }, 256);
    expect(performance.now() - start).toBeLessThan(200);
  });
});
