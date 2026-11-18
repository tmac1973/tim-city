import { describe, expect, it } from 'vitest';
import { TICKS_PER_MONTH } from '@/shared/constants';
import type { ToolCommand, ToolId } from '@/shared/protocol';
import { zoneKind, ZoneType } from '@/shared/tiles';
import { FIXTURE_CITY } from '../fixtureCity';
import { runScript, type ScriptAction } from '../replay';
import { deserialize, serialize } from '../serialize';
import { Simulation } from '../sim';
import { CityState } from '../state';
import { placeFootprint } from '../tools/footprint';
import { runTool } from '../tools';
import { computeLedger } from './budget';
import { buildServiceMap, runTrip } from './traffic';
import { buildBusLanes, findBusNetwork } from './transit';

function flatCity(): CityState {
  const state = new CityState({ name: 'T', seed: 'transit', size: 128 });
  state.heights.fill(3);
  state.funds = 1e9;
  return state;
}

const tool = (t: ToolId, x0: number, y0: number, x1 = x0, y1 = y0): ToolCommand => ({
  type: 'tool', tool: t, x0, y0, x1, y1, brush: 1, tunnel: false, dryRun: false, requestId: 0,
});
const trafficAt = (s: CityState, x: number, y: number) => s.field('traffic')[s.blockIndex(x, y)] ?? 0;

describe('bus routes', () => {
  it('links two stops whose roads are within 12 road tiles, along the road between them', () => {
    const s = flatCity();
    runTool(s, tool('road', 10, 20, 40, 20));
    expect(runTool(s, tool('busStop', 12, 21)).ok).toBe(true);
    expect(runTool(s, tool('busStop', 22, 21)).ok).toBe(true);
    expect(runTool(s, tool('busStop', 35, 21)).ok).toBe(true);
    const net = findBusNetwork(s.size, s.tiles);
    // 12 → 22 is 10 tiles; 22 → 35 is 13 and too far.
    expect(net.links).toEqual([[s.index(12, 21), s.index(22, 21)]]);
    expect(net.routes[0]).toHaveLength(11);
    buildBusLanes(s);
    expect(s.busLane[s.index(17, 20)]).toBe(1);
    expect(s.busLane[s.index(30, 20)]).toBe(0);
    expect(findBusNetwork(s.size, s.tiles)).toEqual(net);
  });

  it('needs a road beside a stop', () => {
    const s = flatCity();
    expect(runTool(s, tool('busStop', 50, 50))).toMatchObject({ ok: false, reason: 'Must be beside a road' });
  });

  it('charges $5 a month a stop on the transit line', () => {
    const s = flatCity();
    runTool(s, tool('road', 10, 20, 40, 20));
    for (let x = 12; x < 32; x += 2) runTool(s, tool('busStop', x, 21));
    expect(computeLedger(s).transit).toBe(10 * 5 * 12);
    s.funding.transit = 50;
    expect(computeLedger(s).transit).toBe(300);
  });
});

/** Homes at x = 10 and shops at x = 62 joined by a road along row 14, as in traffic.test. */
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

describe('bus trips', () => {
  it('put a quarter of the cars on a bus route', () => {
    const cars = corridor();
    runTrip(cars, cars.index(10, 12));
    const s = corridor();
    // Stops every 10 tiles along the corridor, starting beside the homes.
    for (let x = 12; x <= 62; x += 10) runTool(s, tool('busStop', x, 15));
    buildBusLanes(s);
    runTrip(s, s.index(10, 12));
    expect(trafficAt(cars, 30, 14)).toBe(24);
    expect(trafficAt(s, 30, 14)).toBe(6);
    expect(s.busRiders).toBe(1);
  });

  it('reach shops a car trip could not, along a bus route', () => {
    const far = flatCity();
    runTool(far, tool('road', 8, 14, 90, 14));
    runTool(far, tool('residential', 10, 12));
    runTool(far, tool('commercial', 84, 12));
    placeFootprint(far, 9, 11, zoneKind(ZoneType.R, 4));
    buildServiceMap(far);
    // About 66 road tiles: past the trip limit of 60 by car.
    expect(runTrip(far, far.index(10, 12))).toBe(false);
    for (let x = 12; x <= 82; x += 10) runTool(far, tool('busStop', x, 15));
    buildBusLanes(far);
    expect(runTrip(far, far.index(10, 12))).toBe(true);
  });

  it('ignore bus routes for a lot with no stop nearby', () => {
    const s = corridor();
    for (let x = 32; x <= 62; x += 10) runTool(s, tool('busStop', x, 15));
    buildBusLanes(s);
    runTrip(s, s.index(10, 12));
    expect(trafficAt(s, 40, 14)).toBe(24);
    expect(s.busRiders).toBe(0);
  });
});

describe('bus routes in saves', () => {
  it('continue identically after a mid-month save, even with stops built that month', () => {
    const INFO = { name: 'Bus', seed: 'bus', size: 128 } as const;
    const stops: ScriptAction[] = [26, 36, 46, 56].map((x) => ({ atTick: TICKS_PER_MONTH + 5, command: tool('busStop', x, 25) }));
    const { sim: a } = runScript(INFO, [...FIXTURE_CITY, ...stops], 2);
    for (let t = 0; t < 7; t++) a.step();
    const b = new Simulation(INFO, deserialize(serialize(a.state)));
    for (let t = 0; t < 3 * TICKS_PER_MONTH; t++) {
      a.step();
      b.step();
    }
    expect(a.state.busLinks.length).toBeGreaterThan(0);
    expect(serialize(b.state)).toEqual(serialize(a.state));
  });
});
