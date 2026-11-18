import { describe, expect, it } from 'vitest';
import { TileKind } from '@/shared/tiles';
import { guideLots, snapParallel } from './lotGuide';

const SIZE = 128;
function ground() {
  return { size: SIZE, tiles: new Uint16Array(SIZE * SIZE), corner: () => 3 } as const;
}
const row = (y: number, x0: number, x1: number) => Array.from({ length: x1 - x0 + 1 }, (_, k) => y * SIZE + x0 + k);

describe('lot guide', () => {
  it('lines both sides of a straight road with two rows of lots', () => {
    const lots = guideLots(ground(), row(10, 2, 13));
    expect(lots).toHaveLength(16);
    expect(lots).toContainEqual({ x: 2, y: 11 });
    expect(lots).toContainEqual({ x: 11, y: 14 });
    expect(lots).toContainEqual({ x: 2, y: 7 });
    expect(lots).toContainEqual({ x: 2, y: 4 });
  });

  it('stops a row at the first lot that does not fit', () => {
    const g = ground();
    g.tiles[12 * SIZE + 6] = TileKind.Water;
    const lots = guideLots(g, row(10, 2, 13));
    // South side, first row: x = 2 fits, x = 5 holds the water and stops the row.
    expect(lots).toContainEqual({ x: 2, y: 11 });
    expect(lots).not.toContainEqual({ x: 5, y: 11 });
    expect(lots).not.toContainEqual({ x: 8, y: 11 });
  });

  it('follows both runs of an L-shaped road', () => {
    const path = [...row(10, 2, 10), ...Array.from({ length: 9 }, (_, k) => (11 + k) * SIZE + 10)];
    const lots = guideLots(ground(), path);
    // East of the north–south leg.
    expect(lots).toContainEqual({ x: 11, y: 10 });
    expect(lots).toContainEqual({ x: 11, y: 16 });
    // North of the east–west leg.
    expect(lots).toContainEqual({ x: 2, y: 7 });
  });
});

describe('parallel road snap', () => {
  const isRoad = (k: number) => k === TileKind.Road;
  const withRoadRow = (y: number) => {
    const g = ground();
    for (let x = 0; x < SIZE; x++) g.tiles[y * SIZE + x] = TileKind.Road;
    return g;
  };

  it('pulls a road one tile so the gap fits two rows of lots', () => {
    // Road at row 10; drag at row 18 leaves a gap of 7.
    expect(snapParallel(withRoadRow(10), 2, 18, 20, 18, isRoad)).toEqual({ shift: -1, gap: 6 });
    // At row 16, a gap of 5: push out by one.
    expect(snapParallel(withRoadRow(10), 2, 16, 20, 16, isRoad)).toEqual({ shift: 1, gap: 6 });
  });

  it('leaves a fitting gap alone and ignores far or bent drags', () => {
    expect(snapParallel(withRoadRow(10), 2, 14, 20, 14, isRoad)).toEqual({ shift: 0, gap: 3 });
    expect(snapParallel(withRoadRow(10), 2, 30, 20, 30, isRoad)).toBeNull();
    expect(snapParallel(withRoadRow(10), 2, 18, 20, 20, isRoad)).toBeNull();
  });
});
