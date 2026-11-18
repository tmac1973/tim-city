import { describe, expect, it } from 'vitest';
import type { ChunkSlice } from '@/shared/protocol';
import { TileFlag, TileKind, ZoneType, zoneKind } from '@/shared/tiles';
import { Changed, CityMirror } from './mirror';

const slice = (edit: (s: ChunkSlice) => void = () => undefined): ChunkSlice => {
  const s: ChunkSlice = { id: 0, tiles: new Uint16Array(1024), flags: new Uint8Array(1024), parts: new Uint8Array(1024), zoneTier: new Uint8Array(1024), subway: new Uint8Array(1024), heights: new Uint8Array(33 * 33) };
  edit(s);
  return s;
};

describe('mirror change bits', () => {
  it('report only what changed, so layers can skip rebuilds', () => {
    const m = new CityMirror(128);
    const seen: number[] = [];
    m.onChunkChanged((_id, changed) => seen.push(changed));
    m.apply([slice()]);
    expect(seen.pop()).toBe(0xff);
    m.apply([slice()]);
    expect(seen).toHaveLength(0);
    // A zone growing: tiles changed, but no road and no trees.
    m.apply([slice((s) => (s.tiles[5] = zoneKind(ZoneType.R, 3)))]);
    expect(seen.pop()).toBe(Changed.TILES);
    m.apply([slice((s) => (s.tiles[5] = TileKind.Road))]);
    expect(seen.pop()).toBe(Changed.TILES | Changed.NETWORK);
    m.apply([slice((s) => {
      s.tiles[5] = TileKind.Road;
      s.flags[5] = TileFlag.POTHOLED;
    })]);
    expect(seen.pop()).toBe(Changed.FLAGS | Changed.POTHOLES);
    m.apply([slice((s) => {
      s.tiles[5] = TileKind.Tree;
      s.heights[0] = 3;
    })]);
    expect(seen.pop()).toBe(Changed.TILES | Changed.NETWORK | Changed.NATURE | Changed.FLAGS | Changed.POTHOLES | Changed.HEIGHTS);
  });
});
