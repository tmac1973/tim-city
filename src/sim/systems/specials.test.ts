import { describe, expect, it } from 'vitest';
import type { SimEvent, ToolCommand, ToolId } from '@/shared/protocol';
import { TileKind } from '@/shared/tiles';
import { CityState } from '../state';
import { runTool } from '../tools';
import { takeCensus } from './census';
import { demandSystem } from './demand';
import { updateLandValue } from './landValue';
import { updatePower } from './power';

function flatCity(): CityState {
  const state = new CityState({ name: 'T', seed: 'specials', size: 128 });
  state.heights.fill(3);
  state.funds = 1e9;
  return state;
}

const tool = (t: ToolId, x0: number, y0: number, x1 = x0, y1 = y0): ToolCommand => ({
  type: 'tool', tool: t, x0, y0, x1, y1, brush: 1, tunnel: false, dryRun: false, requestId: 0,
});

/** Run the demand system once against a forced census; returns its events. */
function demandWith(s: CityState, census: Partial<CityState['census']>): SimEvent[] {
  takeCensus(s);
  s.census = { ...s.census, ...census };
  s.valves.r = s.valves.c = s.valves.i = 2000;
  const events: SimEvent[] = [];
  demandSystem((e) => events.push(e)).run(s, 1);
  return events;
}

describe('demand caps', () => {
  it('caps each sector past its size until the matching building is powered', () => {
    const s = flatCity();
    const events = demandWith(s, { resPop: 60_000, indJobs: 8_000, comJobs: 11_000 });
    expect(s.valves).toEqual({ r: 0, c: 0, i: 0 });
    const needs = events.flatMap((e) => (e.type === 'demandCap' ? [e.needs] : []));
    expect(needs).toEqual([
      'stadium',
      'seaport',
      'airport',
    ]);
  });

  it('announces a cap once a year, not every month', () => {
    const s = flatCity();
    demandWith(s, { resPop: 60_000 });
    expect(demandWith(s, { resPop: 60_000 }).filter((e) => e.type === 'demandCap')).toHaveLength(0);
  });

  it('lifts the residential cap with a powered stadium only', () => {
    const s = flatCity();
    runTool(s, tool('stadium', 30, 30));
    demandWith(s, { resPop: 60_000 });
    expect(s.valves.r).toBe(0);
    runTool(s, tool('coal', 34, 30));
    updatePower(s);
    demandWith(s, { resPop: 60_000 });
    expect(s.valves.r).toBeGreaterThan(0);
  });
});

describe('placing landmarks', () => {
  it('puts a seaport only along open water', () => {
    const s = flatCity();
    expect(runTool(s, tool('seaport', 40, 40))).toMatchObject({ ok: false, reason: 'Must face open water along one side' });
    // Water along the south edge of the lot (tiles 39–42 on row 43).
    for (let x = 30; x < 50; x++) for (let y = 43; y < 48; y++) s.tiles[s.index(x, y)] = TileKind.Water;
    expect(runTool(s, tool('seaport', 40, 40)).ok).toBe(true);
  });

  it('needs nearly flat ground for an airport', () => {
    const s = flatCity();
    s.heights[s.cornerIndex(62, 62)] = 5;
    expect(runTool(s, tool('airport', 62, 62))).toMatchObject({ ok: false, reason: 'Too steep' });
    expect(runTool(s, tool('airport', 30, 30))).toMatchObject({ ok: true, cost: 10_000 });
  });

  it('lowers land value around an airport', () => {
    const s = flatCity();
    updateLandValue(s);
    const before = s.field('landValue')[s.blockIndex(30, 36)] ?? 0;
    runTool(s, tool('airport', 30, 30));
    updateLandValue(s);
    expect(s.field('landValue')[s.blockIndex(30, 36)]).toBeLessThan(before);
  });
});
