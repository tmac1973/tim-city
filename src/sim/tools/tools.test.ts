import { describe, expect, it } from 'vitest';
import type { BrushSize, ToolCommand, ToolId } from '@/shared/protocol';
import { registerFootprint, TileFlag, TileKind } from '@/shared/tiles';
import { CityState } from '../state';
import { placeFootprint } from './footprint';
import { runTool } from './index';
import { connectionAxis, linePath } from './network';

const LAND = 3;

/** 128² map with every corner at height 3 and plenty of money. */
function flatCity(): CityState {
  const state = new CityState({ name: 'T', seed: 'tools', size: 128 });
  state.heights.fill(LAND);
  state.funds = 1_000_000;
  return state;
}

function tool(
  tool: ToolId,
  x0: number,
  y0: number,
  x1 = x0,
  y1 = y0,
  extra: Partial<{ brush: BrushSize; tunnel: boolean; dryRun: boolean }> = {},
): ToolCommand {
  return { type: 'tool', tool, x0, y0, x1, y1, brush: 1, tunnel: false, dryRun: false, requestId: 0, ...extra };
}

const kindAt = (s: CityState, x: number, y: number) => s.tiles[s.index(x, y)];

function setCorner(s: CityState, x: number, y: number, h: number): void {
  s.heights[s.cornerIndex(x, y)] = h;
}

/** Water channel: corners x0…x1 (inclusive) at sea level, tiles x0…x1-1 water. */
function carveChannel(s: CityState, x0: number, x1: number): void {
  for (let y = 0; y <= s.size; y++) for (let x = x0; x <= x1; x++) setCorner(s, x, y, 2);
  for (let y = 0; y < s.size; y++) for (let x = x0; x < x1; x++) s.tiles[s.index(x, y)] = TileKind.Water;
}

/** Ridge along y peaking at corner x = 55 (height 7), falling one step per corner. */
function raiseRidge(s: CityState): void {
  for (let y = 0; y <= s.size; y++) {
    for (let x = 50; x <= 60; x++) setCorner(s, x, y, LAND + Math.max(0, 4 - Math.abs(x - 55)));
  }
}

function maxNeighbourStep(s: CityState): number {
  const side = s.size + 1;
  let worst = 0;
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const h = s.heights[y * side + x] ?? 0;
      if (x + 1 < side) worst = Math.max(worst, Math.abs(h - (s.heights[y * side + x + 1] ?? 0)));
      if (y + 1 < side) worst = Math.max(worst, Math.abs(h - (s.heights[(y + 1) * side + x] ?? 0)));
    }
  }
  return worst;
}

describe('linePath', () => {
  it('runs along the longer axis first and bends once', () => {
    const path = linePath(2, 2, 5, 4);
    expect(path.map((t) => [t.x, t.y])).toEqual([[2, 2], [3, 2], [4, 2], [5, 2], [5, 3], [5, 4]]);
    expect([...(path[3]?.axes ?? [])].sort()).toEqual(['x', 'y']);
  });
});

describe('road, rail and power', () => {
  it('builds a connected road on flat land and charges for it', () => {
    const s = flatCity();
    const result = runTool(s, tool('road', 2, 5, 6, 5));
    expect(result).toMatchObject({ ok: true, cost: 50 });
    expect(s.funds).toBe(1_000_000 - 50);
    for (let x = 2; x <= 6; x++) expect(kindAt(s, x, 5)).toBe(TileKind.Road);

    runTool(s, tool('road', 6, 5, 6, 8));
    expect(connectionAxis(s, 6, 5, 'road')).toBe('both');
  });

  it('climbs along a slope without grading', () => {
    const s = flatCity();
    // Tile (10, 10): north edge at 3, south edge at 4.
    setCorner(s, 10, 11, 4);
    setCorner(s, 11, 11, 4);
    expect(runTool(s, tool('road', 10, 8, 10, 12))).toMatchObject({ ok: true, cost: 50 });
    expect(s.heights[s.cornerIndex(10, 11)]).toBe(4);
  });

  it('grades tiles that slope across the road and charges for it', () => {
    const s = flatCity();
    // The raised corners tilt tiles (9, 10), (10, 10) and (11, 10) across an east–west road.
    setCorner(s, 10, 11, 4);
    setCorner(s, 11, 11, 4);
    expect(runTool(s, tool('road', 8, 10, 12, 10))).toMatchObject({ ok: true, cost: 5 * 10 + 2 * 20 });
    expect(s.heights[s.cornerIndex(10, 11)]).toBe(LAND);
    expect(s.heights[s.cornerIndex(11, 11)]).toBe(LAND);
  });

  it('will not grade ground under a neighbouring road', () => {
    const s = flatCity();
    runTool(s, tool('road', 8, 11, 12, 11));
    setCorner(s, 10, 11, 4);
    expect(runTool(s, tool('road', 8, 10, 12, 10))).toMatchObject({ ok: false, reason: "Can't grade next to buildings" });
  });

  it('will not grade the shore into or out of the water', () => {
    const s = flatCity();
    carveChannel(s, 20, 25);
    // Tile 25 slopes from the water's edge (2) up to the land (3), across a north–south road.
    expect(runTool(s, tool('road', 25, 10, 25, 14))).toMatchObject({ ok: false, reason: 'Too close to the water' });
  });

  it('clears trees for $1 each', () => {
    const s = flatCity();
    s.tiles[s.index(3, 3)] = TileKind.Tree;
    expect(runTool(s, tool('road', 2, 3, 4, 3)).cost).toBe(31);
  });

  it('makes perpendicular crossings and refuses parallel ones', () => {
    const s = flatCity();
    runTool(s, tool('road', 10, 20, 20, 20));
    expect(runTool(s, tool('rail', 15, 15, 15, 25)).ok).toBe(true);
    expect(kindAt(s, 15, 20)).toBe(TileKind.RoadRail);

    expect(runTool(s, tool('power', 12, 20, 13, 20))).toMatchObject({ ok: false, reason: "Can't run along another line" });
    expect(runTool(s, tool('power', 18, 15, 18, 25)).ok).toBe(true);
    expect(kindAt(s, 18, 20)).toBe(TileKind.RoadPower);
    expect((s.flags[s.index(18, 20)] ?? 0) & TileFlag.CONDUCTIVE).toBeTruthy();
  });

  it('fails without changing anything when funds are short', () => {
    const s = flatCity();
    s.funds = 15;
    expect(runTool(s, tool('road', 2, 2, 3, 2))).toMatchObject({ ok: false, reason: 'Not enough funds' });
    expect(kindAt(s, 2, 2)).toBe(TileKind.Empty);
    expect(s.funds).toBe(15);
  });

  it('changes nothing on a dry run', () => {
    const s = flatCity();
    expect(runTool(s, tool('road', 2, 2, 9, 2, { dryRun: true }))).toMatchObject({ ok: true, cost: 80, dryRun: true });
    expect(kindAt(s, 5, 2)).toBe(TileKind.Empty);
    expect(s.funds).toBe(1_000_000);
  });
});

describe('bridges', () => {
  it('spans a 5-wide river', () => {
    const s = flatCity();
    carveChannel(s, 20, 25);
    const result = runTool(s, tool('road', 15, 30, 30, 30));
    expect(result).toMatchObject({ ok: true, cost: 11 * 10 + 5 * 50 });
    for (let x = 20; x < 25; x++) expect(kindAt(s, x, 30)).toBe(TileKind.RoadBridge);
    expect(kindAt(s, 25, 30)).toBe(TileKind.Road);
  });

  it('refuses a 20-wide lake, a bent drag and a bridge to nowhere', () => {
    const s = flatCity();
    carveChannel(s, 40, 60);
    expect(runTool(s, tool('road', 35, 30, 65, 30))).toMatchObject({ ok: false, reason: 'Bridge too long (max 16)' });

    const t = flatCity();
    carveChannel(t, 20, 25);
    expect(runTool(t, tool('road', 15, 30, 30, 35))).toMatchObject({ ok: false, reason: 'Bridges must be straight' });
    expect(runTool(t, tool('road', 15, 30, 22, 30))).toMatchObject({ ok: false, reason: 'Bridges must reach land' });
  });

  it('turns back into water when bulldozed', () => {
    const s = flatCity();
    carveChannel(s, 20, 25);
    runTool(s, tool('rail', 18, 30, 26, 30));
    runTool(s, tool('bulldoze', 22, 30));
    expect(kindAt(s, 22, 30)).toBe(TileKind.Water);
  });
});

describe('tunnels', () => {
  it('bores through a hill with a Shift drag', () => {
    const s = flatCity();
    raiseRidge(s);
    // Tile 51 (corners 3,4) and tile 58 (corners 4,3) both bottom out at 3.
    const result = runTool(s, tool('road', 51, 70, 58, 70, { tunnel: true }));
    expect(result).toMatchObject({ ok: true, cost: 2 * 10 + 6 * 100 });
    expect(kindAt(s, 51, 70)).toBe(TileKind.Road);
    for (let x = 52; x <= 57; x++) expect(kindAt(s, x, 70)).toBe(TileKind.RoadTunnel);
    expect(kindAt(s, 58, 70)).toBe(TileKind.Road);
  });

  it('fails when the ends differ in height or there is no hill', () => {
    const s = flatCity();
    raiseRidge(s);
    expect(runTool(s, tool('rail', 51, 70, 57, 70, { tunnel: true }))).toMatchObject({
      ok: false,
      reason: 'Tunnel ends must be level',
    });
    expect(runTool(s, tool('road', 5, 5, 12, 5, { tunnel: true }))).toMatchObject({
      ok: false,
      reason: 'No hill to tunnel through',
    });
  });

  it('builds a normal road without Shift', () => {
    const s = flatCity();
    raiseRidge(s);
    expect(runTool(s, tool('road', 51, 70, 58, 70)).ok).toBe(true);
    expect(kindAt(s, 55, 70)).toBe(TileKind.Road);
  });
});

describe('bulldozer', () => {
  it('clears a whole footprint from any one of its tiles', () => {
    const s = flatCity();
    registerFootprint(200, 3);
    placeFootprint(s, 10, 10, 200);
    expect(runTool(s, tool('bulldoze', 11, 12))).toMatchObject({ ok: true, cost: 45 });
    for (let y = 10; y < 13; y++) for (let x = 10; x < 13; x++) expect(kindAt(s, x, y)).toBe(TileKind.Rubble);
    expect(runTool(s, tool('bulldoze', 10, 10, 12, 12)).cost).toBe(9);
    expect(kindAt(s, 11, 11)).toBe(TileKind.Empty);
  });

  it('reports when there is nothing to clear', () => {
    expect(runTool(flatCity(), tool('bulldoze', 4, 4, 6, 6))).toMatchObject({ ok: false, reason: 'Nothing to bulldoze' });
  });
});

describe('terraform', () => {
  it('keeps every neighbouring corner within one step', () => {
    const s = flatCity();
    for (let i = 0; i < 6; i++) expect(runTool(s, tool('raise', 30, 30, 30, 30, { brush: 3 })).ok).toBe(true);
    expect(s.heights[s.cornerIndex(30, 30)]).toBe(LAND + 6);
    for (let i = 0; i < 2; i++) runTool(s, tool('lower', 80, 80, 80, 80, { brush: 5 }));
    expect(maxNeighbourStep(s)).toBeLessThanOrEqual(1);
  });

  it('charges $20 per corner step, spreading included', () => {
    const s = flatCity();
    // Brush 1 raises 4 corners; one step needs no spreading.
    expect(runTool(s, tool('raise', 40, 40)).cost).toBe(4 * 20);
    // A second step also lifts the 8 corners beside the brush (diagonal
    // neighbours are not constrained).
    expect(runTool(s, tool('raise', 40, 40)).cost).toBe((4 + 8) * 20);
  });

  it('floods ground lowered to sea level and drains it again', () => {
    const s = flatCity();
    runTool(s, tool('lower', 5, 5));
    expect(kindAt(s, 5, 5)).toBe(TileKind.Water);
    runTool(s, tool('raise', 5, 5));
    expect(kindAt(s, 5, 5)).toBe(TileKind.Empty);
  });

  it('levels a bump back to the clicked tile height', () => {
    const s = flatCity();
    runTool(s, tool('raise', 60, 60, 60, 60, { brush: 3 }));
    expect(runTool(s, tool('level', 58, 58, 58, 58, { brush: 5 })).ok).toBe(true);
    expect(s.heights[s.cornerIndex(60, 60)]).toBe(LAND);
  });

  it('refuses to reshape ground under a road', () => {
    const s = flatCity();
    runTool(s, tool('road', 10, 10, 14, 10));
    expect(runTool(s, tool('raise', 12, 11))).toMatchObject({ ok: false, reason: "Can't reshape under buildings" });
  });
});
