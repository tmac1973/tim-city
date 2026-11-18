import { describe, expect, it } from 'vitest';
import { TileKind } from '@/shared/tiles';
import { runScript, type ScriptAction } from './replay';
import type { Simulation } from './sim';

const ACTIONS: ScriptAction[] = [
  { atTick: 0, command: { type: 'setTile', x: 1, y: 1, kind: TileKind.Tree } },
  { atTick: 17, command: { type: 'setTile', x: 100, y: 3, kind: TileKind.Water } },
  { atTick: 17, command: { type: 'setTile', x: 100, y: 3, kind: TileKind.Rubble } },
  { atTick: 150, command: { type: 'setTile', x: 64, y: 64, kind: TileKind.Tree } },
];

/** Every piece of state a later phase could depend on. */
function snapshot(sim: Simulation) {
  const s = sim.state;
  return {
    tiles: Array.from(s.tiles),
    flags: Array.from(s.flags),
    heights: Array.from(s.heights),
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
  });

  it('gives different random streams for different seeds', () => {
    const a = runScript({ name: 'A', seed: 'one', size: 128 }, [], 1).sim.state.random('x').next();
    const b = runScript({ name: 'A', seed: 'two', size: 128 }, [], 1).sim.state.random('x').next();
    expect(a).not.toBe(b);
  });
});
