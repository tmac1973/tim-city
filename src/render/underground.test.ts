import { describe, expect, it } from 'vitest';
import { TileKind } from '@/shared/tiles';
import { trainRuns } from './underground';

const SIZE = 16;

describe('subway trains', () => {
  it('run one train from a station to each other station on its line', () => {
    const subway = new Uint8Array(SIZE * SIZE);
    const tiles = new Uint16Array(SIZE * SIZE);
    for (let x = 2; x <= 12; x++) subway[5 * SIZE + x] = 1;
    for (const x of [2, 7, 12]) tiles[5 * SIZE + x] = TileKind.SubwayStation;
    // A station off the track gets no train.
    tiles[9 * SIZE + 9] = TileKind.SubwayStation;
    const runs = trainRuns(SIZE, subway, tiles);
    expect(runs).toHaveLength(2);
    expect(runs[0]?.[0]).toBe(5 * SIZE + 2);
    expect(runs[0]?.at(-1)).toBe(5 * SIZE + 7);
    expect(runs[1]).toHaveLength(11);
  });
});
