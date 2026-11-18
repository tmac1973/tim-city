import { describe, expect, it } from 'vitest';
import { MONTHS_PER_YEAR, START_YEAR, TICKS_PER_MONTH } from '@/shared/constants';
import { TileKind } from '@/shared/tiles';
import { extractChunk, takeDirtyChunks } from './chunks';
import type { System } from './scheduler';
import { Simulation } from './sim';

const INFO = { name: 'Test', seed: 'test', size: 128 } as const;

describe('Simulation time', () => {
  it('advances exactly one year in 192 ticks and emits month and year events', () => {
    const sim = new Simulation(INFO);
    for (let i = 0; i < TICKS_PER_MONTH * MONTHS_PER_YEAR; i++) sim.step();

    expect(sim.state.date).toEqual({ year: START_YEAR + 1, month: 0, tick: 0 });
    const events = sim.drainEvents();
    expect(events.filter((e) => e.type === 'monthEnd')).toHaveLength(12);
    expect(events.filter((e) => e.type === 'yearEnd')).toEqual([{ type: 'yearEnd', year: START_YEAR }]);
    expect(events.at(-1)).toEqual({ type: 'yearEnd', year: START_YEAR });
  });
});

describe('Scheduler', () => {
  it('runs a system only on its listed ticks', () => {
    const sim = new Simulation(INFO);
    const seen: number[] = [];
    const system: System = { name: 'probe', phaseTicks: [2, 9], run: (_s, tick) => seen.push(tick) };
    sim.scheduler.register(system);
    for (let i = 0; i < TICKS_PER_MONTH * 2; i++) sim.step();
    expect(seen).toEqual([2, 9, 2, 9]);
  });

  it('rejects ticks outside the month', () => {
    const sim = new Simulation(INFO);
    expect(() => {
      sim.scheduler.register({ name: 'bad', phaseTicks: [16], run: () => undefined });
    }).toThrow(/invalid tick/);
  });
});

describe('Commands', () => {
  it('apply in arrival order before systems run', () => {
    const sim = new Simulation(INFO);
    let seenByProbe = -1;
    sim.scheduler.register({
      name: 'probe',
      phaseTicks: [0],
      run: (state) => {
        seenByProbe = state.tiles[state.index(5, 5)] ?? -1;
      },
    });
    sim.enqueue({ type: 'setTile', x: 5, y: 5, kind: TileKind.Tree });
    sim.enqueue({ type: 'setTile', x: 5, y: 5, kind: TileKind.Rubble });
    sim.step();
    expect(seenByProbe).toBe(TileKind.Rubble);
  });

  it('marks the changed chunk dirty and ships its data', () => {
    const sim = new Simulation(INFO);
    sim.enqueue({ type: 'setTile', x: 40, y: 70, kind: TileKind.Water });
    sim.applyCommands();
    const chunks = takeDirtyChunks(sim.state);
    // x=40 is chunk column 1, y=70 is chunk row 2, 4 chunks per side.
    expect(chunks.map((c) => c.id)).toEqual([9]);
    expect(chunks[0]?.tiles[(70 - 64) * 32 + (40 - 32)]).toBe(TileKind.Water);
    expect(sim.state.dirtyChunks.size).toBe(0);
  });

  it('ignores out-of-bounds tiles', () => {
    const sim = new Simulation(INFO);
    sim.enqueue({ type: 'setTile', x: -1, y: 500, kind: TileKind.Water });
    sim.applyCommands();
    expect(sim.state.dirtyChunks.size).toBe(0);
  });
});

describe('extractChunk', () => {
  it('copies 33×33 corner heights including the far edge', () => {
    const sim = new Simulation(INFO);
    const { state } = sim;
    state.heights[state.cornerIndex(128, 128)] = 7;
    state.heights[state.cornerIndex(96, 96)] = 3;
    const last = extractChunk(state, state.chunksPerSide * state.chunksPerSide - 1);
    expect(last.heights[0]).toBe(3);
    expect(last.heights[33 * 33 - 1]).toBe(7);
  });
});
