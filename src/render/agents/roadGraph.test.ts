import { describe, expect, it } from 'vitest';
import { TileKind } from '@/shared/tiles';
import { components, exits, type Grid, isNavigable, links, route, Segment, waterRoute } from './roadGraph';

function grid(size: number, paint: (set: (x: number, y: number, kind: number) => void) => void): Grid {
  const tiles = new Uint16Array(size * size);
  paint((x, y, kind) => {
    tiles[y * size + x] = kind;
  });
  return { size, tiles };
}

const N = 0, E = 1, S = 2, W = 3;

describe('road graph', () => {
  // A cross at (5, 5) and a T at (5, 2): the north arm stops at row 2.
  const g = grid(12, (set) => {
    for (let x = 1; x <= 9; x++) set(x, 5, TileKind.Road);
    for (let y = 2; y <= 9; y++) set(5, y, TileKind.Road);
    for (let x = 3; x <= 7; x++) set(x, 2, TileKind.Road);
  });

  it('links a cross intersection four ways and a T three ways', () => {
    expect(links(g, 5, 5, 'road')).toBe(0b1111);
    expect(links(g, 5, 2, 'road')).toBe((1 << E) | (1 << S) | (1 << W));
  });

  it('lets traffic go straight, left or right, but not back, at a junction', () => {
    expect(exits(g, 5, 5, N, 'road').sort()).toEqual([N, E, W]);
    // Arriving at the T from the south: left or right only.
    expect(exits(g, 5, 2, N, 'road').sort()).toEqual([E, W]);
  });

  it('turns vehicles around at a dead end', () => {
    expect(exits(g, 9, 5, E, 'road')).toEqual([W]);
    expect(exits(g, 3, 2, W, 'road')).toEqual([E]);
  });

  it('keeps to the right-hand lane and ends where the next tile starts', () => {
    const seg = new Segment().set(5, 5, E, E, 0.17);
    const p = seg.at(0, { x: 0, z: 0, hx: 0, hz: 0 });
    // Heading east, the right-hand side is south (+z).
    expect([p.x, p.z]).toEqual([5, 5.67]);
    expect(seg.at(1, p).x).toBeCloseTo(6);
    const turn = new Segment().set(5, 5, E, S, 0.17);
    const end = turn.at(1, { x: 0, z: 0, hx: 0, hz: 0 });
    expect([end.x, end.z, end.hx, end.hz].map((v) => Number(v.toFixed(2)))).toEqual([5.33, 6, 0, 1]);
  });

  it('finds the shortest road route', () => {
    const path = route(g, 1, 5, (x, y) => x === 7 && y === 2, 'road');
    expect(path?.[0]).toEqual([1, 5]);
    expect(path?.at(-1)).toEqual([7, 2]);
    expect(path).toHaveLength(10);
  });

  it('splits disconnected networks', () => {
    const two = grid(10, (set) => {
      for (let x = 0; x < 4; x++) set(x, 1, TileKind.Rail);
      for (let x = 6; x < 10; x++) set(x, 8, TileKind.Rail);
    });
    expect(components(two, 'rail').map((c) => c.length)).toEqual([4, 4]);
  });
});

describe('ship routes', () => {
  // A river from the west edge with a bend, crossed by a bridge, and a lake.
  const g = grid(16, (set) => {
    for (let x = 0; x <= 8; x++) set(x, 4, TileKind.Water);
    for (let y = 4; y <= 10; y++) set(8, y, TileKind.Water);
    set(4, 4, TileKind.RoadBridge);
    for (let y = 12; y <= 14; y++) for (let x = 11; x <= 14; x++) set(x, y, TileKind.Water);
  });

  it('sail only through water, under bridges, to the map edge', () => {
    const path = waterRoute(g, 8, 10);
    expect(path?.at(-1)).toEqual([0, 4]);
    for (const [x, y] of path ?? []) expect(isNavigable(g.tiles[y * g.size + x] ?? 0)).toBe(true);
  });

  it('on landlocked water, go to the far shore instead', () => {
    const path = waterRoute(g, 11, 12);
    expect(path?.at(-1)).toEqual([14, 14]);
  });

  it('do not start on land', () => {
    expect(waterRoute(g, 2, 2)).toBeNull();
  });
});
