import { describe, expect, it } from 'vitest';
import type { ToolCommand, ToolId } from '@/shared/protocol';
import { TileFlag, zoneKind, ZoneType } from '@/shared/tiles';
import { CityState } from '../state';
import { placeFootprint } from '../tools/footprint';
import { runTool } from '../tools';
import { buildServiceMap, runTrip, trafficSystem } from './traffic';

function flatCity(size: 128 | 256 = 128): CityState {
  const state = new CityState({ name: 'T', seed: 'traffic', size });
  state.heights.fill(3);
  state.funds = 1e9;
  return state;
}

const tool = (t: ToolId, x0: number, y0: number, x1 = x0, y1 = y0): ToolCommand => ({
  type: 'tool', tool: t, x0, y0, x1, y1, brush: 1, tunnel: false, dryRun: false, requestId: 0,
});

const center = (s: CityState, x: number, y: number) => s.index(x, y);
const trafficAt = (s: CityState, x: number, y: number) => s.field('traffic')[s.blockIndex(x, y)] ?? 0;

/** Homes at x = 10 and shops at x = 62, joined by a road along row 14 (within trip range). */
function corridor(): CityState {
  const s = flatCity();
  runTool(s, tool('road', 8, 14, 66, 14));
  runTool(s, tool('residential', 10, 12));
  runTool(s, tool('commercial', 62, 12));
  placeFootprint(s, 9, 11, zoneKind(ZoneType.R, 6));
  placeFootprint(s, 61, 11, zoneKind(ZoneType.C, 2));
  buildServiceMap(s);
  return s;
}

describe('trips', () => {
  it('reaches shops along a road and loads the road with traffic', () => {
    const s = corridor();
    expect(runTrip(s, center(s, 10, 12))).toBe(true);
    // The trip passes every road block between the two zones.
    for (const x of [20, 30, 50]) expect(trafficAt(s, x, 14)).toBe(6 * 4);
    expect(trafficAt(s, 100, 14)).toBe(0);
  });

  it('fails for a zone with no road to anywhere', () => {
    const s = corridor();
    runTool(s, tool('residential', 50, 60));
    runTool(s, tool('road', 48, 63, 52, 63));
    buildServiceMap(s);
    expect(runTrip(s, center(s, 50, 60))).toBe(false);
  });

  it('builds up traffic over repeated trips and caps it', () => {
    const s = corridor();
    for (let i = 0; i < 20; i++) runTrip(s, center(s, 10, 12));
    expect(trafficAt(s, 40, 14)).toBe(255);
  });

  it('lets industry export at the map edge', () => {
    const s = flatCity();
    runTool(s, tool('industrial', 64, 64));
    runTool(s, tool('road', 66, 66, 127, 66));
    buildServiceMap(s);
    expect(runTrip(s, center(s, 64, 64))).toBe(true);
  });

  it('takes the train when a parallel rail line is built', () => {
    const roadOnly = corridor();
    for (let i = 0; i < 5; i++) runTrip(roadOnly, center(roadOnly, 10, 12));
    const withRail = corridor();
    runTool(withRail, tool('rail', 12, 16, 60, 16));
    buildServiceMap(withRail);
    for (let i = 0; i < 5; i++) runTrip(withRail, center(withRail, 10, 12));
    expect(trafficAt(withRail, 40, 14)).toBeLessThan(trafficAt(roadOnly, 40, 14));
  });
});

describe('traffic system', () => {
  it('flags zones whose trips fail and lets old traffic fade', () => {
    const s = corridor();
    runTool(s, tool('industrial', 50, 60));
    s.field('traffic')[s.blockIndex(40, 14)] = 200;
    for (let t = 0; t < 16; t++) trafficSystem.run(s, t);
    expect((s.flags[center(s, 50, 60)] ?? 0) & TileFlag.TRIP_FAILED).toBeTruthy();
    expect((s.flags[center(s, 10, 12)] ?? 0) & TileFlag.TRIP_FAILED).toBeFalsy();
    // 200 faded to 150, then the homes' trip added 24 and the shops' trip back added 8.
    expect(trafficAt(s, 40, 14)).toBe(150 + 24 + 8);
  });

  it('runs a month of trips for 1,000 zones on a 256 map in under 40 ms', () => {
    const s = flatCity(256);
    // Rows of homes and industry along parallel roads.
    for (let row = 0; row < 25; row++) {
      const y = 6 + row * 10;
      runTool(s, tool('road', 0, y + 2, 255, y + 2));
      runTool(s, tool('residential', 2, y, 2 + 3 * 24, y));
      runTool(s, tool('industrial', 2 + 3 * 25, y, 2 + 3 * 39, y));
    }
    let zones = 0;
    for (let i = 0; i < 256 * 256; i++) if ((s.flags[i] ?? 0) & TileFlag.ZONE_CENTER) zones++;
    expect(zones).toBeGreaterThanOrEqual(1000);
    for (let t = 0; t < 16; t++) trafficSystem.run(s, t); // warm-up
    const start = performance.now();
    for (let t = 0; t < 16; t++) trafficSystem.run(s, t);
    expect(performance.now() - start).toBeLessThan(40);
  });
});
