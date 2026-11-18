import { describe, expect, it } from 'vitest';
import type { ToolCommand } from '@/shared/protocol';
import { TileKind } from '@/shared/tiles';
import { runScript, type ScriptAction } from './replay';
import type { Simulation } from './sim';

const build = (tool: ToolCommand['tool'], x0: number, y0: number, x1: number, y1: number): ToolCommand => ({
  type: 'tool',
  tool,
  x0,
  y0,
  x1,
  y1,
  brush: 3,
  tunnel: false,
  dryRun: false,
  requestId: 0,
});

const ACTIONS: ScriptAction[] = [
  { atTick: 0, command: { type: 'setTile', x: 1, y: 1, kind: TileKind.Tree } },
  { atTick: 17, command: { type: 'setTile', x: 100, y: 3, kind: TileKind.Water } },
  { atTick: 17, command: { type: 'setTile', x: 100, y: 3, kind: TileKind.Rubble } },
  { atTick: 20, command: build('road', 10, 40, 60, 45) },
  { atTick: 21, command: build('rail', 30, 30, 30, 50) },
  { atTick: 40, command: build('power', 5, 5, 40, 5) },
  { atTick: 60, command: build('raise', 90, 90, 90, 90) },
  { atTick: 61, command: build('bulldoze', 25, 40, 35, 45) },
  { atTick: 150, command: { type: 'setTile', x: 64, y: 64, kind: TileKind.Tree } },
];

/** Every piece of state a later phase could depend on. */
function snapshot(sim: Simulation) {
  const s = sim.state;
  return {
    tiles: Array.from(s.tiles),
    flags: Array.from(s.flags),
    heights: Array.from(s.heights),
    parts: Array.from(s.parts),
    funds: s.funds,
    date: { ...s.date },
    rng: s.randomStates(),
  };
}

describe('determinism', () => {
  it('produces identical state from the same seed and script', () => {
    const info = { name: 'A', seed: 'determinism', size: 128 } as const;
    const run = (): Simulation => {
      const { sim } = runScript(info, ACTIONS, 24);
      // Draw from a stream so RNG state is part of the comparison.
      sim.state.random('probe').next();
      return sim;
    };
    expect(snapshot(run())).toEqual(snapshot(run()));
  });

  it('applies scripted commands at their tick', () => {
    const { sim } = runScript({ name: 'B', seed: 's', size: 128 }, ACTIONS, 12);
    const { state } = sim;
    expect(state.tiles[state.index(100, 3)]).toBe(TileKind.Rubble);
    expect(state.tiles[state.index(64, 64)]).toBe(TileKind.Tree);
    // Scripted tools ran: the rail crossed the road, the bulldozer cleared
    // part of both, and money was spent.
    expect(state.tiles[state.index(10, 40)]).toBe(TileKind.Road);
    expect(state.tiles[state.index(30, 40)]).toBe(TileKind.Empty);
    expect(state.tiles[state.index(30, 50)]).toBe(TileKind.Rail);
    expect(state.heights[state.cornerIndex(90, 90)]).toBe(1);
    expect(state.funds).toBeLessThan(10_000);
  });

  it('gives different random streams for different seeds', () => {
    const a = runScript({ name: 'A', seed: 'one', size: 128 }, [], 1).sim.state.random('x').next();
    const b = runScript({ name: 'A', seed: 'two', size: 128 }, [], 1).sim.state.random('x').next();
    expect(a).not.toBe(b);
  });
});
