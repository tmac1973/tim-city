import { describe, expect, it } from 'vitest';
import type { ToolCommand, ToolId } from '@/shared/protocol';
import { TileKind, zoneKind, ZoneType } from '@/shared/tiles';
import { subwayCost } from '../graph';
import { CityState } from '../state';
import { computeLedger } from '../systems/budget';
import { buildServiceMap, runTrip } from '../systems/traffic';
import { placeFootprint } from './footprint';
import { runTool } from './index';

function cityAtCity(): CityState {
  const state = new CityState({ name: 'T', seed: 'subway', size: 128 });
  state.heights.fill(3);
  state.funds = 1e9;
  state.classReached = 2;
  return state;
}
const tool = (t: ToolId, x0: number, y0: number, x1 = x0, y1 = y0, extra: Partial<ToolCommand> = {}): ToolCommand => ({
  type: 'tool', tool: t, x0, y0, x1, y1, brush: 1, tunnel: false, dryRun: false, requestId: 0, ...extra,
});

describe('subway tools', () => {
  it('lays track under anything, charging only new tiles', () => {
    const s = cityAtCity();
    runTool(s, tool('residential', 21, 21));
    expect(runTool(s, tool('subway', 10, 21, 30, 21))).toMatchObject({ ok: true, cost: 21 * 40 });
    expect(s.tiles[s.index(21, 21)]).toBe(zoneKind(ZoneType.R, 0));
    expect(s.subway[s.index(21, 21)]).toBe(1);
    expect(runTool(s, tool('subway', 25, 21, 35, 21))).toMatchObject({ ok: true, cost: 5 * 40 });
    expect(runTool(s, tool('subway', 0, 50, 10, 50))).toMatchObject({ ok: false, reason: 'Too close to the edge' });
  });

  it('puts a station beside a road and track under it', () => {
    const s = cityAtCity();
    expect(runTool(s, tool('subwayStation', 40, 40))).toMatchObject({ ok: false, reason: 'Must be beside a road' });
    runTool(s, tool('road', 38, 41, 44, 41));
    expect(runTool(s, tool('subwayStation', 40, 40))).toMatchObject({ ok: true, cost: 800 + 40 });
    expect(s.tiles[s.index(40, 40)]).toBe(TileKind.SubwayStation);
    expect(s.subway[s.index(40, 40)]).toBe(1);
  });

  it('is locked until City', () => {
    const s = cityAtCity();
    s.classReached = 1;
    expect(runTool(s, tool('subway', 10, 21, 30, 21))).toMatchObject({ ok: false, reason: 'Unlocks at City (10,000 people)' });
  });

  it('lifts track only when bulldozing underground', () => {
    const s = cityAtCity();
    runTool(s, tool('road', 10, 20, 30, 20));
    runTool(s, tool('subway', 10, 21, 30, 21));
    expect(runTool(s, tool('bulldoze', 12, 20, 14, 21, { underground: true }))).toMatchObject({ ok: true, cost: 3 });
    expect(s.subway[s.index(13, 21)]).toBe(0);
    expect(s.tiles[s.index(13, 20)]).toBe(TileKind.Road);
  });
});

/** Homes at x = 10 and shops at x = 112, each with a short road and a station; no road between them. */
function districts(): CityState {
  const s = cityAtCity();
  runTool(s, tool('road', 8, 14, 18, 14));
  runTool(s, tool('road', 104, 14, 114, 14));
  runTool(s, tool('residential', 10, 12));
  runTool(s, tool('commercial', 112, 12));
  placeFootprint(s, 9, 11, zoneKind(ZoneType.R, 4));
  runTool(s, tool('subwayStation', 17, 15));
  runTool(s, tool('subwayStation', 105, 15));
  buildServiceMap(s);
  return s;
}

describe('subway trips', () => {
  it('link districts no road joins, adding no road traffic underground', () => {
    const s = districts();
    expect(runTrip(s, s.index(10, 12))).toBe(false);
    runTool(s, tool('subway', 17, 15, 105, 15));
    expect(runTrip(s, s.index(10, 12))).toBe(true);
    expect(s.subwayRiders).toBe(1);
    // Nothing drives the land between the two districts.
    expect(s.field('traffic')[s.blockIndex(60, 15)]).toBe(0);
  });

  it('runs slower when transit funding is cut', () => {
    const s = districts();
    expect(subwayCost(s)).toBeCloseTo(0.3);
    s.funding.transit = 25;
    expect(subwayCost(s)).toBeCloseTo(1.2);
  });

  it('charges track and stations on the transit line', () => {
    const s = districts();
    runTool(s, tool('subway', 17, 15, 105, 15));
    // 89 tiles of track and two stations.
    expect(computeLedger(s).transit).toBe((89 * 1 + 2 * 20) * 12);
  });
});
