import { describe, expect, it } from 'vitest';
import type { ToolCommand, ToolId } from '@/shared/protocol';
import { TileFlag, TileKind, zoneKind, ZoneType } from '@/shared/tiles';
import { stepCost } from '../graph';
import { CityState } from '../state';
import { placeFootprint } from '../tools/footprint';
import { runTool } from '../tools';
import { updateCoverage } from './coverage';
import { updateCrime } from './crime';
import { updateLandValue } from './landValue';
import { updatePollution } from './pollution';
import { updatePopDensity } from './popDensity';
import { updatePower } from './power';
import { updateRoads } from './roads';
import { zoneScore } from './zones';

function flatCity(): CityState {
  const state = new CityState({ name: 'T', seed: 'fields', size: 128 });
  state.heights.fill(3);
  state.funds = 1e9;
  return state;
}

const tool = (t: ToolId, x0: number, y0: number, x1 = x0, y1 = y0): ToolCommand => ({
  type: 'tool', tool: t, x0, y0, x1, y1, brush: 1, tunnel: false, dryRun: false, requestId: 0,
});

const at = (s: CityState, name: string, x: number, y: number) => s.field(name)[s.blockIndex(x, y)] ?? 0;

/** A block of dense homes centred near (60, 60). */
function neighbourhood(s: CityState): void {
  runTool(s, tool('residential', 54, 54, 66, 66));
  for (let y = 53; y <= 65; y += 3) for (let x = 53; x <= 65; x += 3) placeFootprint(s, x, y, zoneKind(ZoneType.R, 7));
}

describe('pollution and land value', () => {
  it('pollutes around a coal plant and lowers land value there', () => {
    const s = flatCity();
    runTool(s, tool('coal', 30, 30));
    updatePollution(s);
    updateLandValue(s);
    expect(at(s, 'pollution', 30, 30)).toBeGreaterThan(20);
    expect(at(s, 'pollution', 100, 100)).toBe(0);
    // Same distance from the (empty-city) centre, mirrored across it.
    expect(at(s, 'landValue', 30, 30)).toBeLessThan(at(s, 'landValue', 97, 97));
  });

  it('raises land value near a park', () => {
    const s = flatCity();
    updateLandValue(s);
    const before = at(s, 'landValue', 40, 80);
    runTool(s, tool('largePark', 41, 81));
    updateLandValue(s);
    expect(at(s, 'landValue', 40, 80)).toBe(Math.min(255, before + 40));
  });
});

describe('police, fire and crime', () => {
  it('lowers crime near a police station', () => {
    const s = flatCity();
    neighbourhood(s);
    updatePopDensity(s);
    updateLandValue(s);
    updateCrime(s);
    const unpoliced = at(s, 'crime', 60, 60);
    expect(unpoliced).toBeGreaterThan(0);
    runTool(s, tool('police', 61, 70));
    updateCoverage(s);
    updateCrime(s);
    expect(at(s, 'crime', 60, 60)).toBeLessThan(unpoliced);
  });

  it('halves coverage at half funding and for a dark station', () => {
    const s = flatCity();
    // Station on tiles 60–62; the plant (63–66) touches it; a road below.
    runTool(s, tool('fire', 61, 70));
    runTool(s, tool('coal', 64, 70));
    runTool(s, tool('road', 56, 73, 60, 73));
    updatePower(s);
    expect((s.flags[s.index(61, 70)] ?? 0) & TileFlag.POWERED).toBeTruthy();
    updateCoverage(s);
    const full = at(s, 'fireCover', 60, 66);
    s.funding.fire = 50;
    updateCoverage(s);
    expect(at(s, 'fireCover', 60, 66)).toBeCloseTo(full / 2, -0.5);
    s.funding.fire = 100;
    runTool(s, tool('bulldoze', 64, 70));
    updatePower(s);
    updateCoverage(s);
    expect(at(s, 'fireCover', 60, 66)).toBeCloseTo(full / 2, -0.5);
  });

  it('has no crime where nobody lives', () => {
    const s = flatCity();
    updateLandValue(s);
    updateCrime(s);
    expect(at(s, 'crime', 10, 10)).toBe(0);
  });
});

describe('zone scores', () => {
  it('holds back homes next to industry', () => {
    const s = flatCity();
    runTool(s, tool('residential', 20, 20));
    runTool(s, tool('residential', 90, 90));
    runTool(s, tool('industrial', 25, 20));
    expect(zoneScore(s, 20, 20, ZoneType.R)).toBeLessThan(zoneScore(s, 90, 90, ZoneType.R) - 50);
  });
});

describe('road maintenance', () => {
  it('wears roads out over two years without funding, and not with it', () => {
    const s = flatCity();
    runTool(s, tool('road', 10, 10, 100, 10));
    s.funding.road = 0;
    for (let month = 0; month < 24; month++) updateRoads(s);
    let potholed = 0;
    let rubble = 0;
    for (let x = 10; x <= 100; x++) {
      const i = s.index(x, 10);
      if ((s.flags[i] ?? 0) & TileFlag.POTHOLED) potholed++;
      if (s.tiles[i] === TileKind.Rubble) rubble++;
    }
    expect(potholed + rubble).toBeGreaterThan(20);
    expect(rubble).toBeGreaterThan(0);

    const kept = flatCity();
    runTool(kept, tool('road', 10, 10, 100, 10));
    for (let month = 0; month < 24; month++) updateRoads(kept);
    expect([...kept.flags].some((f) => f & TileFlag.POTHOLED)).toBe(false);
  });

  it('slows traffic on potholes, and the road tool repairs them', () => {
    const s = flatCity();
    runTool(s, tool('road', 10, 10, 20, 10));
    const a = s.index(14, 10);
    const b = s.index(15, 10);
    expect(stepCost(s, a, b)).toBe(1);
    s.flags[b] = (s.flags[b] ?? 0) | TileFlag.POTHOLED;
    expect(stepCost(s, a, b)).toBe(2);
    expect(runTool(s, tool('road', 15, 10))).toMatchObject({ ok: true, cost: 10 });
    expect((s.flags[b] ?? 0) & TileFlag.POTHOLED).toBe(0);
  });
});
