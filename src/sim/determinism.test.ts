import { describe, expect, it } from 'vitest';
import type { ToolCommand } from '@/shared/protocol';
import { TileKind } from '@/shared/tiles';
import { FIXTURE_CITY } from './fixtureCity';
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
  // A small powered neighbourhood that must grow: plant, line, homes, factory, road.
  { atTick: 70, command: build('coal', 100, 20, 100, 20) },
  { atTick: 70, command: build('power', 103, 20, 106, 20) },
  { atTick: 70, command: build('residential', 108, 20, 108, 20) },
  { atTick: 70, command: build('industrial', 111, 20, 111, 20) },
  { atTick: 70, command: build('road', 107, 23, 113, 23) },
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
    census: s.census,
    valves: { ...s.valves },
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
    // The neighbourhood grew.
    expect(state.census.resPop).toBeGreaterThan(0);
    expect(state.census.indJobs).toBeGreaterThan(0);
  });

  it('replays 50 game years identically, with every tool and two disasters', () => {
    const info = { name: 'Fifty', seed: 'fifty-years', size: 128 } as const;
    const tool = (t: ToolCommand['tool'], x0: number, y0: number, x1 = x0, y1 = y0, atTick = 0): ScriptAction => ({ atTick, command: { ...build(t, x0, y0, x1, y1), brush: 1 } });
    const water: ScriptAction[] = [];
    for (let y = 0; y < 128; y++) for (let x = 122; x < 128; x++) water.push({ atTick: 0, command: { type: 'setTile', x, y, kind: TileKind.Water } });
    const script: ScriptAction[] = [
      // The fixture town grows homes, shops and industry; the rest uses every other tool.
      ...FIXTURE_CITY,
      { atTick: 1, command: { type: 'setFunds', amount: 500_000 } },
      ...water,
      tool('nuclear', 20, 60),
      tool('power', 23, 60, 26, 60),
      tool('rail', 10, 90, 110, 90),
      tool('fire', 70, 26),
      tool('largePark', 64, 30),
      tool('stadium', 80, 60),
      tool('seaport', 119, 40),
      tool('airport', 40, 100),
      tool('raise', 100, 110, 100, 110, 50),
      tool('lower', 104, 110, 104, 110, 51),
      tool('level', 100, 114, 104, 114, 52),
      tool('bulldoze', 64, 30, 66, 32, 3000),
      { atTick: 16 * 12 * 10, command: { type: 'triggerDisaster', disaster: 'tornado' } },
      { atTick: 16 * 12 * 20, command: { type: 'triggerDisaster', disaster: 'fire' } },
    ];
    const run = () => {
      const { sim } = runScript(info, script, 50 * 12);
      return { ...snapshot(sim), history: sim.state.history, evaluation: sim.state.evaluation };
    };
    const a = run();
    expect(a.census.resPop).toBeGreaterThan(0);
    expect(run()).toEqual(a);
  }, 300_000);

  it('gives different random streams for different seeds', () => {
    const a = runScript({ name: 'A', seed: 'one', size: 128 }, [], 1).sim.state.random('x').next();
    const b = runScript({ name: 'A', seed: 'two', size: 128 }, [], 1).sim.state.random('x').next();
    expect(a).not.toBe(b);
  });
});
