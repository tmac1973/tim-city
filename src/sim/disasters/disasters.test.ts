import { describe, expect, it } from 'vitest';
import { TICKS_PER_MONTH } from '@/shared/constants';
import type { DisasterType, SimEvent, ToolCommand, ToolId } from '@/shared/protocol';
import { isBridge, TileFlag, TileKind } from '@/shared/tiles';
import { runScript } from '../replay';
import { serialize } from '../serialize';
import { Simulation } from '../sim';
import { Rng } from '../rng';
import { CityState } from '../state';
import { runTool } from '../tools';
import { BURN_TICKS, ignite, randomTile } from './common';
import { crewDelay, updateFires } from './fire';
import { rollRandomDisaster, triggerDisaster } from './index';
import { radiationSystem } from './meltdown';

const tool = (t: ToolId, x0: number, y0: number, x1 = x0, y1 = y0): ToolCommand => ({
  type: 'tool', tool: t, x0, y0, x1, y1, brush: 1, tunnel: false, dryRun: false, requestId: 0,
});

/**
 * A flat town by a river (tiles 100–109 are water): homes, industry, an
 * airport, a seaport on the bank, a nuclear plant and a road bridge.
 */
function town(seed = 'disasters', forest = false): Simulation {
  const sim = new Simulation({ name: 'T', seed, size: 128 });
  const s = sim.state;
  s.randomDisasters = false;
  s.heights.fill(3);
  s.funds = 1e7;
  for (let y = 0; y <= 128; y++) for (let x = 100; x <= 110; x++) s.heights[s.cornerIndex(x, y)] = 2;
  for (let y = 0; y < 128; y++) for (let x = 100; x < 110; x++) s.tiles[s.index(x, y)] = TileKind.Water;
  const build = (c: ToolCommand) => {
    expect([c.tool, runTool(s, c).reason ?? 'ok']).toEqual([c.tool, 'ok']);
  };
  build(tool('residential', 20, 20, 50, 41));
  build(tool('industrial', 56, 20, 68, 29));
  build(tool('airport', 30, 70));
  // Lot on tiles 96–99, its east edge on the river.
  build(tool('seaport', 97, 60));
  build(tool('nuclear', 60, 100));
  // A road bridge within the seaport's 12-tile reach.
  build(tool('road', 95, 66, 114, 66));
  // Forest on every open tile, so a disaster wrecks something wherever it lands.
  if (forest) for (let i = 0; i < s.size * s.size; i++) if (s.tiles[i] === TileKind.Empty) s.tiles[i] = TileKind.Tree;
  return sim;
}

const count = (s: CityState, test: (kind: number, flags: number) => boolean) => {
  let n = 0;
  for (let i = 0; i < s.size * s.size; i++) if (test(s.tiles[i] ?? 0, s.flags[i] ?? 0)) n++;
  return n;
};
const rubble = (s: CityState) => count(s, (k) => k === TileKind.Rubble);

/** Trigger a disaster and run until it (and any fires it started) are over. */
function run(sim: Simulation, type: DisasterType, maxTicks = 400): SimEvent[] {
  const events: SimEvent[] = [];
  // Through the sim's own command queue, so its events carry headlines.
  sim.enqueue({ type: 'triggerDisaster', disaster: type });
  sim.applyCommands();
  events.push(...sim.drainEvents());
  expect(events.some((e) => e.type === 'disaster')).toBe(true);
  for (let t = 0; t < maxTicks; t++) {
    sim.step();
    events.push(...sim.drainEvents());
    if (sim.state.disasters.length === 0 && !sim.state.fireTicks.some((v) => v > 0)) break;
  }
  expect(sim.state.disasters).toEqual([]);
  return events;
}

/** The bulldozer clears every rubble tile. */
function clearable(s: CityState): void {
  for (let i = 0; i < s.size * s.size; i++) {
    if (s.tiles[i] !== TileKind.Rubble) continue;
    const x = i % s.size;
    const y = Math.floor(i / s.size);
    expect(runTool(s, tool('bulldoze', x, y)).ok).toBe(true);
  }
  expect(rubble(s)).toBe(0);
}

describe('each disaster', () => {
  for (const type of ['fire', 'tornado', 'earthquake', 'planeCrash', 'mirebeast'] as const) {
    it(`${type} wrecks buildings, ends, and leaves clearable rubble`, () => {
      const sim = town(type, true);
      const events = run(sim, type);
      expect(events.some((e) => e.type === 'news')).toBe(true);
      expect(rubble(sim.state)).toBeGreaterThan(0);
      clearable(sim.state);
    });
  }

  it('flood rises over low ground and recedes', () => {
    const sim = town('flood');
    triggerDisaster(sim.state, 'flood', () => undefined);
    let peak = 0;
    for (let t = 0; t < 60; t++) {
      sim.step();
      peak = Math.max(peak, count(sim.state, (_k, f) => (f & TileFlag.FLOODED) !== 0));
    }
    expect(peak).toBeGreaterThan(10);
    expect(count(sim.state, (_k, f) => (f & TileFlag.FLOODED) !== 0)).toBe(0);
    expect(sim.state.disasters).toEqual([]);
  });

  it('shipwreck takes out the bridge span and spills oil for a year', () => {
    const sim = town('ship');
    const bridgesBefore = count(sim.state, isBridge);
    expect(bridgesBefore).toBe(10);
    run(sim, 'shipwreck');
    expect(count(sim.state, isBridge)).toBe(0);
    expect(sim.state.pollutionSpills).toHaveLength(1);
    for (let m = 0; m < 12 * TICKS_PER_MONTH; m++) sim.step();
    expect(sim.state.pollutionSpills).toHaveLength(0);
  });

  it('meltdown leaves radioactive ground that refuses the bulldozer and clears after 50 years', () => {
    const sim = town('meltdown');
    run(sim, 'meltdown');
    const s = sim.state;
    const hot = count(s, (k) => k === TileKind.Radiation);
    expect(hot).toBeGreaterThan(150);
    const i = s.tiles.indexOf(TileKind.Radiation);
    const x = i % s.size;
    const y = Math.floor(i / s.size);
    expect(runTool(s, tool('bulldoze', x, y))).toMatchObject({ ok: false });
    expect(runTool(s, tool('road', x, y))).toMatchObject({ ok: false, reason: 'Radioactive' });
    s.date.month = 11;
    for (let year = 0; year < 50; year++) radiationSystem.run(s, 15);
    expect(count(s, (k) => k === TileKind.Radiation)).toBe(0);
    expect(s.radiation.size).toBe(0);
  });

  it('refuses disasters whose landmark is missing, with a reason', () => {
    const sim = new Simulation({ name: 'T', seed: 'bare', size: 128 });
    const events: SimEvent[] = [];
    expect(triggerDisaster(sim.state, 'meltdown', (e) => events.push(e))).toBe(false);
    expect(events).toEqual([{ type: 'disasterRefused', disaster: 'meltdown', reason: 'Needs a nuclear plant' }]);
  });
});

describe('fire', () => {
  it('spreads less with full fire coverage (over 20 seeds)', () => {
    const burnedWith = (cover: number) => {
      let total = 0;
      for (let seed = 0; seed < 20; seed++) {
        const s = town(`fire-${String(seed)}`).state;
        // A fire station a few tiles off, so crews arrive.
        if (cover > 0) expect(runTool(s, tool('fire', 40, 48)).ok).toBe(true);
        s.field('fireCover').fill(cover);
        ignite(s, 30, 30);
        for (let t = 0; t < 120; t++) updateFires(s);
        total += rubble(s);
      }
      return total;
    };
    expect(burnedWith(255)).toBeLessThan(burnedWith(0) / 2);
  });
});

describe('fire crews', () => {
  it('take time to arrive: one tick per tile from the nearest station', () => {
    expect(crewDelay([[10, 10]], 10, 30)).toBe(20);
    expect(crewDelay([[10, 10], [10, 28]], 10, 30)).toBe(2);
    expect(crewDelay([], 10, 30)).toBe(Infinity);
  });

  it('never put a fire out before they could have arrived, and usually save the building after', () => {
    let saved = 0;
    for (let seed = 0; seed < 20; seed++) {
      const s = town(`crew-${String(seed)}`).state;
      // A station on open ground south of the homes, about 20 tiles from the fire.
      expect(runTool(s, tool('fire', 40, 48)).ok).toBe(true);
      s.field('fireCover').fill(255);
      expect(ignite(s, 30, 30)).toBe(true);
      const delay = crewDelay([[40, 48]], 30, 30);
      for (let t = 0; t < BURN_TICKS; t++) {
        updateFires(s);
        if (t < delay - 1) expect(s.fireTicks[s.index(30, 30)]).toBeGreaterThan(0);
      }
      if (s.tiles[s.index(30, 30)] !== TileKind.Rubble) saved++;
    }
    expect(saved).toBeGreaterThan(15);
  });
});

describe('random disasters', () => {
  it('never strike in 100 years with the toggle off', () => {
    const s = town('quiet').state;
    s.difficulty = 'hard';
    let any = 0;
    for (let month = 0; month < 1200; month++) if (rollRandomDisaster(s, () => undefined)) any++;
    expect(any).toBe(0);
  });

  it('do strike sometimes with it on', () => {
    const s = town('loud').state;
    s.randomDisasters = true;
    s.difficulty = 'hard';
    let any = 0;
    for (let month = 0; month < 1200; month++) if (rollRandomDisaster(s, () => undefined)) any++;
    expect(any).toBeGreaterThan(5);
  });

  it('a run with a tornado is deterministic', () => {
    const info = { name: 'D', seed: 'tornado', size: 128 } as const;
    const actions = [
      { atTick: 0, command: { type: 'setRandomDisasters' as const, enabled: false } },
      { atTick: 0, command: tool('residential', 20, 20, 60, 50) },
      { atTick: 10, command: { type: 'triggerDisaster' as const, disaster: 'tornado' as const } },
    ];
    const a = runScript(info, actions, 6).sim;
    const b = runScript(info, actions, 6).sim;
    expect(serialize(b.state)).toEqual(serialize(a.state));
  });
});

describe('fire starts', () => {
  it('picks weighted tiles more often', () => {
    const s = new CityState({ name: 'T', seed: 'weights', size: 128 });
    const rng = new Rng('weights');
    let heavy = 0;
    for (let n = 0; n < 2000; n++) {
      const at = randomTile(s, rng, (i) => i === 0 || i === 1, (i) => (i === 1 ? 3 : 1));
      if (at?.[0] === 1) heavy++;
    }
    expect(heavy / 2000).toBeGreaterThan(0.7);
    expect(heavy / 2000).toBeLessThan(0.8);
  });
});
