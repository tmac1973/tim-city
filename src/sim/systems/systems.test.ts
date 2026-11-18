import { describe, expect, it } from 'vitest';
import { TICKS_PER_MONTH } from '@/shared/constants';
import type { ToolCommand, ToolId } from '@/shared/protocol';
import { MAX_DENSITY, TileFlag, TileKind, zoneKind, zoneOf, ZoneTier, ZoneType } from '@/shared/tiles';
import { Simulation } from '../sim';
import { CityState } from '../state';
import { placeFootprint } from '../tools/footprint';
import { runTool } from '../tools';
import { queryTile } from '../tools/query';
import { takeCensus } from './census';
import { demandTargets } from './demand';
import { updatePower } from './power';
import { growthBlock, zoneSystem } from './zones';

function flatCity(): CityState {
  const state = new CityState({ name: 'T', seed: 'systems', size: 128 });
  state.heights.fill(3);
  state.funds = 1_000_000;
  return state;
}

const tool = (t: ToolId, x0: number, y0: number, x1 = x0, y1 = y0): ToolCommand => ({
  type: 'tool',
  tool: t,
  x0,
  y0,
  x1,
  y1,
  brush: 1,
  tunnel: false,
  dryRun: false,
  requestId: 0,
});

const powered = (s: CityState, x: number, y: number) => ((s.flags[s.index(x, y)] ?? 0) & TileFlag.POWERED) !== 0;
const density = (s: CityState, x: number, y: number) => zoneOf(s.tiles[s.index(x, y)] ?? 0)?.density;

/** Coal plant at tiles 10–13, a line along row 12 to x = 20, an R zone centred on (22, 12). */
function poweredZone(): CityState {
  const s = flatCity();
  expect(runTool(s, tool('coal', 11, 11)).ok).toBe(true);
  expect(runTool(s, tool('power', 14, 12, 20, 12)).ok).toBe(true);
  expect(runTool(s, tool('residential', 22, 12)).ok).toBe(true);
  return s;
}

describe('power grid', () => {
  it('powers a zone connected to a plant', () => {
    const s = poweredZone();
    updatePower(s);
    expect(powered(s, 22, 12)).toBe(true);
    expect(powered(s, 21, 11)).toBe(true);
  });

  it('leaves the zone dark when the line is cut', () => {
    const s = poweredZone();
    runTool(s, tool('bulldoze', 17, 12));
    updatePower(s);
    expect(powered(s, 22, 12)).toBe(false);
    expect(powered(s, 15, 12)).toBe(true);
  });

  it('serves the nearest zones first when demand exceeds supply', () => {
    const s = flatCity();
    runTool(s, tool('coal', 11, 11));
    // 10 × 10 block of zones touching the plant, every one at density 8 (8 units each).
    expect(runTool(s, tool('residential', 15, 12, 15 + 27, 12 + 27)).ok).toBe(true);
    for (let j = 0; j < 10; j++) {
      for (let i = 0; i < 10; i++) placeFootprint(s, 14 + 3 * i, 11 + 3 * j, zoneKind(ZoneType.R, 8));
    }
    const { unpowered, atCapacity } = updatePower(s);
    expect(atCapacity).toBe(true);
    // 700 units cover 87 zones of 8; the 88th and everything beyond stay dark.
    expect(unpowered).toBe(13);
    expect(powered(s, 15, 12)).toBe(true);
    expect(powered(s, 15 + 27, 12 + 27)).toBe(false);
  });

  it('reports a brownout once, when it starts', () => {
    const sim = new Simulation({ name: 'T', seed: 'b', size: 128 });
    sim.state.heights.fill(3);
    sim.state.funds = 1_000_000;
    sim.enqueue(tool('coal', 11, 11));
    sim.enqueue(tool('residential', 15, 12, 15 + 27, 12 + 27));
    sim.applyCommands();
    for (let j = 0; j < 10; j++) {
      for (let i = 0; i < 10; i++) placeFootprint(sim.state, 14 + 3 * i, 11 + 3 * j, zoneKind(ZoneType.R, 8));
    }
    for (let t = 0; t < 3 * TICKS_PER_MONTH; t++) sim.step();
    expect(sim.drainEvents().filter((e) => e.type === 'brownout')).toHaveLength(1);
  });
});

describe('zone growth', () => {
  it('grows a powered residential zone beside a road', () => {
    const sim = new Simulation({ name: 'T', seed: 'grow', size: 128 });
    sim.state.randomDisasters = false;
    sim.state.heights.fill(3);
    sim.state.funds = 1_000_000;
    sim.enqueue(tool('coal', 11, 11));
    sim.enqueue(tool('power', 14, 12, 20, 12));
    sim.enqueue(tool('residential', 22, 12));
    sim.enqueue(tool('road', 21, 14, 30, 14));
    // Jobs up the road, so residents have somewhere to commute.
    sim.enqueue(tool('industrial', 27, 12));
    // A dark zone with a road but no power, far away.
    sim.enqueue(tool('residential', 80, 80));
    sim.enqueue(tool('road', 79, 82, 85, 82));
    for (let t = 0; t < 24 * TICKS_PER_MONTH; t++) sim.step();
    expect(density(sim.state, 22, 12)).toBeGreaterThanOrEqual(2);
    expect(density(sim.state, 80, 80)).toBe(0);
  });

  it('does not grow without road access', () => {
    const sim = new Simulation({ name: 'T', seed: 'grow', size: 128 });
    sim.state.heights.fill(3);
    sim.state.funds = 1_000_000;
    sim.enqueue(tool('coal', 11, 11));
    sim.enqueue(tool('power', 14, 12, 20, 12));
    sim.enqueue(tool('residential', 22, 12));
    for (let t = 0; t < 24 * TICKS_PER_MONTH; t++) sim.step();
    expect(density(sim.state, 22, 12)).toBe(0);
  });
});

describe('density tiers', () => {
  /** A lot of `tier` centred on (30, 30), powered, beside a road, with strong demand and the given land value. */
  function tierLot(tier: number, landValue: number): CityState {
    const s = flatCity();
    s.classReached = 1;
    expect(runTool(s, { ...tool('residential', 30, 30), tier }).ok).toBe(true);
    expect(runTool(s, tool('road', 28, 32, 40, 32)).ok).toBe(true);
    s.valves.r = 5000;
    s.field('landValue').fill(landValue);
    return s;
  }

  /** Run the zone system's slot for the lot centre for `months` months. */
  function grow(s: CityState, months: number): number {
    const centre = s.index(30, 30);
    for (let m = 0; m < months; m++) {
      s.flags[centre] = (s.flags[centre] ?? 0) | TileFlag.POWERED;
      zoneSystem.run(s, centre % TICKS_PER_MONTH);
    }
    return density(s, 30, 30) ?? -1;
  }

  it('caps low at 3, medium at 6 and high at 8 on good land', () => {
    expect(grow(tierLot(ZoneTier.Low, 200), 200)).toBe(3);
    expect(grow(tierLot(ZoneTier.Medium, 200), 200)).toBe(6);
    expect(grow(tierLot(ZoneTier.High, 200), 200)).toBe(MAX_DENSITY);
  });

  it('holds high density at 6 on land-value class 1, and says why', () => {
    const s = flatCity();
    s.classReached = 1;
    expect(runTool(s, { ...tool('residential', 30, 30), tier: ZoneTier.High }).ok).toBe(true);
    expect(runTool(s, tool('road', 28, 32, 40, 32)).ok).toBe(true);
    s.valves.r = 5000;
    s.field('landValue').fill(100);
    expect(grow(s, 200)).toBe(6);
    expect(growthBlock(s, s.index(30, 30))).toBe('landValue');
  });

  it('shrinks a downzoned lot to its new cap', () => {
    const s = tierLot(ZoneTier.Medium, 200);
    expect(grow(s, 200)).toBe(6);
    expect(runTool(s, { ...tool('residential', 30, 30), tier: ZoneTier.Low })).toMatchObject({ ok: true, cost: 50 });
    expect(growthBlock(s, s.index(30, 30))).toBe('tierCap');
    expect(grow(s, 48)).toBe(3);
  });
});

describe('demand', () => {
  it('wants shops and factories when residents outnumber jobs', () => {
    const s = flatCity();
    s.census = { ...s.census, resPop: 5000, comJobs: 100, indJobs: 100 };
    const t = demandTargets(s);
    expect(t.r).toBeLessThan(0);
    expect(t.c).toBeGreaterThan(0);
    expect(t.i).toBeGreaterThan(0);
  });

  it('wants residents and industry in an empty city', () => {
    const t = demandTargets(flatCity());
    expect(t.r).toBeGreaterThan(0);
    expect(t.i).toBeGreaterThan(0);
  });

  it('lowers every valve when taxes rise', () => {
    const s = flatCity();
    const base = demandTargets(s);
    s.taxRate = 15;
    const taxed = demandTargets(s);
    expect(taxed.r).toBeLessThan(base.r);
    expect(taxed.i).toBeLessThan(base.i);
  });
});

describe('census', () => {
  it('counts residents, jobs, zones and plants', () => {
    const s = poweredZone();
    runTool(s, tool('commercial', 30, 30));
    placeFootprint(s, 21, 11, zoneKind(ZoneType.R, 3));
    placeFootprint(s, 29, 29, zoneKind(ZoneType.C, 2));
    takeCensus(s);
    expect(s.census).toMatchObject({ resPop: 60, comJobs: 30, indJobs: 0, zones: { r: 1, c: 1, i: 0 }, plants: { coal: 1 } });
  });
});

describe('placing zones and plants', () => {
  it('builds on a gentle slope without earthwork', () => {
    const s = flatCity();
    s.heights[s.cornerIndex(41, 41)] = 4;
    s.heights[s.cornerIndex(42, 41)] = 5;
    expect(runTool(s, tool('industrial', 41, 41))).toMatchObject({ ok: true, cost: 100 });
    expect(s.heights[s.cornerIndex(42, 41)]).toBe(5);
  });

  it('refuses a steep lot but still builds the good ones in a drag', () => {
    const s = flatCity();
    // The lot centred on (46, 40) spans corners 45–48, rising 3 steps.
    for (let y = 0; y <= 128; y++) {
      s.heights[s.cornerIndex(46, y)] = 4;
      s.heights[s.cornerIndex(47, y)] = 5;
      s.heights[s.cornerIndex(48, y)] = 6;
    }
    const r = runTool(s, tool('residential', 40, 40, 49, 40));
    expect(r.ok).toBe(true);
    expect(r.bad).toContain(s.index(46, 40));
    expect(density(s, 40, 40)).toBe(0);
    expect(density(s, 46, 40)).toBeUndefined();
  });

  it('builds a 4×4 plant around the clicked tile and bulldozes it whole', () => {
    const s = flatCity();
    expect(runTool(s, tool('nuclear', 60, 60))).toMatchObject({ ok: true, cost: 5000 });
    expect(s.tiles[s.index(59, 59)]).toBe(TileKind.NuclearPlant);
    expect(s.tiles[s.index(62, 62)]).toBe(TileKind.NuclearPlant);
    expect(runTool(s, tool('bulldoze', 62, 62))).toMatchObject({ ok: true, cost: 16 * 5 });
    expect(s.tiles[s.index(59, 59)]).toBe(TileKind.Rubble);
  });

  it('describes a zone for the query tool', () => {
    const s = poweredZone();
    updatePower(s);
    const q = queryTile(s, 21, 13, 7);
    expect(q.title).toBe('Residential zone');
    expect(q.details).toContainEqual(['Power', 'On']);
    expect(q.details).toContainEqual(['Road access', 'No — build a road within 3 tiles']);
  });
});
