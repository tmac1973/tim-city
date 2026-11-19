import { describe, expect, it } from 'vitest';
import type { SimEvent, ToolCommand, ToolId } from '@/shared/protocol';
import { TileFlag, TileKind, zoneKind, ZoneType } from '@/shared/tiles';
import { CityState } from '../state';
import { placeFootprint } from '../tools/footprint';
import { runTool } from '../tools';
import { computeLedger } from './budget';
import { takeCensus } from './census';
import { updateCoverage } from './coverage';
import { demandSystem } from './demand';
import { landmarkApproval, updateTourism } from './landmarks';
import { updateLandValue } from './landValue';
import { updatePollution } from './pollution';
import { updatePower } from './power';
import { zoneScore } from './zones';

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
    expect(runTool(s, tool('seaport', 40, 40))).toMatchObject({ ok: false, reason: 'Build on the shore: one whole side (4 tiles) must face open water' });
    // Water along the south edge of the lot (tiles 39–42 on row 43).
    for (let x = 30; x < 50; x++) for (let y = 43; y < 48; y++) s.tiles[s.index(x, y)] = TileKind.Water;
    expect(runTool(s, tool('seaport', 40, 40)).ok).toBe(true);
  });

  it('snaps a seaport to the shore when the pointer is over the water', () => {
    const s = flatCity();
    // Water from row 43 down; the pointer two tiles out on it.
    for (let x = 20; x < 60; x++) for (let y = 43; y < 60; y++) s.tiles[s.index(x, y)] = TileKind.Water;
    expect(runTool(s, tool('seaport', 40, 45)).ok).toBe(true);
    // The port stands on the land rows 39–42, its south side on the water.
    expect(s.tiles[s.index(40, 42)]).toBe(TileKind.Seaport);
    expect(s.tiles[s.index(40, 43)]).toBe(TileKind.Water);
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

describe('landmarks', () => {
  /** A powered landmark beside a road: coal plant, line, road, then the building. */
  function withLandmark(t: ToolId, x: number, y: number): CityState {
    const s = flatCity();
    s.classReached = 3;
    expect(runTool(s, tool('coal', 11, 11)).ok).toBe(true);
    expect(runTool(s, tool('power', 14, 12, x - 2, 12)).ok).toBe(true);
    expect(runTool(s, tool('road', x - 2, y + 3, x + 4, y + 3)).ok).toBe(true);
    expect(runTool(s, tool(t, x, y)).ok).toBe(true);
    if (t !== 'statue') expect(runTool(s, tool('power', x - 2, 12, x - 2, y)).ok).toBe(true);
    updatePower(s);
    return s;
  }

  it('locks landmarks until their class and allows one City Hall', () => {
    const s = flatCity();
    expect(runTool(s, tool('cityHall', 40, 40))).toMatchObject({ ok: false, reason: 'Unlocks at Town (2,000 people)' });
    expect(runTool(s, tool('university', 40, 40))).toMatchObject({ ok: false, reason: 'Unlocks at Capital (50,000 people)' });
    s.classReached = 1;
    expect(runTool(s, tool('cityHall', 40, 40)).ok).toBe(true);
    expect(runTool(s, tool('cityHall', 60, 60))).toMatchObject({ ok: false, reason: 'Only one per city' });
  });

  it('adds approval for City Hall and monuments, half when not working, capped at 15', () => {
    const s = withLandmark('cityHall', 40, 20);
    expect(landmarkApproval(s)).toBe(5);
    // A statue on its own has no power or road: half of 1.
    expect(runTool(s, tool('statue', 90, 90)).ok).toBe(true);
    expect(landmarkApproval(s)).toBe(5);
    expect(runTool(s, tool('statue', 92, 90)).ok).toBe(true);
    expect(landmarkApproval(s)).toBe(6);
    for (let k = 0; k < 20; k++) runTool(s, tool('timSign', 20 + 3 * k, 100));
    expect(landmarkApproval(s)).toBe(15);
  });

  it('spreads health care that helps homes grow', () => {
    const s = withLandmark('hospital', 40, 20);
    updateCoverage(s);
    const near = s.field('healthCover')[s.blockIndex(41, 21)] ?? 0;
    expect(near).toBeGreaterThan(200);
    const before = zoneScore(s, 50, 30, ZoneType.R);
    s.field('healthCover').fill(0);
    expect(zoneScore(s, 50, 30, ZoneType.R)).toBeLessThan(before);
  });

  it('halves industrial pollution and raises industrial tax near a university', () => {
    const s = flatCity();
    placeFootprint(s, 60, 60, zoneKind(ZoneType.I, 6));
    s.flags[s.index(61, 61)] = TileFlag.ZONE_CENTER;
    s.field('landValue').fill(100);
    updatePollution(s);
    const dirty = s.field('pollution')[s.blockIndex(61, 61)] ?? 0;
    const tax = computeLedger(s).industrialTax;
    s.field('educationCover').fill(255);
    updatePollution(s);
    expect(s.field('pollution')[s.blockIndex(61, 61)]).toBeCloseTo(dirty / 2, -1);
    expect(computeLedger(s).industrialTax).toBe(Math.round(tax * 1.25));
  });

  it('raises land value around a zoo', () => {
    const s = flatCity();
    updateLandValue(s);
    const before = s.field('landValue')[s.blockIndex(70, 70)] ?? 0;
    s.classReached = 2;
    expect(runTool(s, tool('zoo', 72, 72)).ok).toBe(true);
    updateLandValue(s);
    expect(s.field('landValue')[s.blockIndex(70, 70)]).toBeGreaterThan(before + 20);
  });

  it('earns tourism only with a road from the map edge, less with crime and pollution', () => {
    const s = withLandmark('zoo', 40, 20);
    updateTourism(s);
    expect(s.tourism).toBe(0);
    // Run the road on to the map's east edge.
    expect(runTool(s, tool('road', 44, 23, 127, 23)).ok).toBe(true);
    updateTourism(s);
    expect(s.tourism).toBe(40);
    s.field('crime').fill(255);
    updateTourism(s);
    expect(s.tourism).toBe(20);
    expect(computeLedger(s).tourism).toBe(20 * 12);
  });
});
