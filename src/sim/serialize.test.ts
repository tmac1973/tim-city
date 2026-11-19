import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { TICKS_PER_MONTH } from '@/shared/constants';
import { gunzip, gzip } from '@/save/compress';
import type { ToolCommand, ToolId } from '@/shared/protocol';
import { TileKind, zoneOf, ZoneTier } from '@/shared/tiles';
import { FIXTURE_CITY } from './fixtureCity';
import { runScript } from './replay';
import { deserialize, peekSave, readRaw, serialize } from './serialize';
import { FORMAT_VERSION } from './serializeRegistry';
import { Simulation } from './sim';
import { runTool } from './tools';

const INFO = { name: 'Roundtrip', seed: 'save', size: 128 } as const;

describe('save format', () => {
  it('continues identically after a save and load (20 + 10 years)', () => {
    const { sim: a } = runScript(INFO, FIXTURE_CITY, 20 * 12);
    expect(a.state.census.resPop).toBeGreaterThan(0);
    const b = new Simulation(INFO, deserialize(serialize(a.state)));
    expect(serialize(b.state)).toEqual(serialize(a.state));
    for (let t = 0; t < 10 * 12 * TICKS_PER_MONTH; t++) {
      a.step();
      b.step();
    }
    expect(serialize(b.state)).toEqual(serialize(a.state));
  }, 60_000);

  it('round-trips a mid-month save too', () => {
    const { sim: a } = runScript(INFO, FIXTURE_CITY, 18);
    for (let t = 0; t < 7; t++) a.step();
    const b = new Simulation(INFO, deserialize(serialize(a.state)));
    for (let t = 0; t < 3 * TICKS_PER_MONTH; t++) {
      a.step();
      b.step();
    }
    expect(serialize(b.state)).toEqual(serialize(a.state));
  });

  it('survives gzip export and import byte for byte', async () => {
    const { sim } = runScript(INFO, FIXTURE_CITY, 6);
    const bytes = serialize(sim.state);
    expect(await gunzip(await gzip(bytes))).toEqual(bytes);
  });

  it('refuses a save from a newer format with a clear message', () => {
    const { sim } = runScript(INFO, [], 1);
    const bytes = serialize(sim.state);
    new DataView(bytes.buffer).setUint16(4, FORMAT_VERSION + 1, true);
    expect(() => deserialize(bytes)).toThrow(/newer version of Tim City/);
    expect(() => deserialize(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]))).toThrow(/not a Tim City save/);
  });

  it('reads name and size from the header alone', () => {
    const { sim } = runScript({ ...INFO, size: 256 }, [], 1);
    expect(peekSave(serialize(sim.state))).toEqual({ name: 'Roundtrip', seed: 'save', size: 256 });
  });

  it('loads the committed version-1 fixture', () => {
    const bytes = gunzipSync(readFileSync(new URL('./fixtures/city-v1.timcity', import.meta.url)));
    const state = deserialize(new Uint8Array(bytes));
    expect(state.name).toBe('Fixtureville');
    expect(state.census.resPop).toBeGreaterThan(0);
  });

  it('migrates every zone in the version-1 fixture to high density, keeping its level', () => {
    const bytes = new Uint8Array(gunzipSync(readFileSync(new URL('./fixtures/city-v1.timcity', import.meta.url))));
    const raw = readRaw(bytes);
    const before = new Uint16Array(raw.arrays.get('tiles')?.slice().buffer ?? new ArrayBuffer(0));
    const state = deserialize(bytes);
    let zones = 0;
    for (let i = 0; i < state.tiles.length; i++) {
      expect(state.tiles[i]).toBe(before[i]);
      if (zoneOf(state.tiles[i] ?? 0)) {
        zones++;
        expect(state.zoneTier[i]).toBe(ZoneTier.High);
      } else expect(state.zoneTier[i]).toBe(0);
    }
    expect(zones).toBeGreaterThan(0);
  });

  it('gives a migrated city full new funding lines and two years before water and garbage matter', () => {
    const bytes = new Uint8Array(gunzipSync(readFileSync(new URL('./fixtures/city-v1.timcity', import.meta.url))));
    const state = deserialize(bytes);
    expect(state.funding.transit).toBe(100);
    expect(state.funding.utilities).toBe(100);
    expect(state.utilityGraceUntil).toBe(state.date.year * 12 + state.date.month + 24);
    const back = deserialize(serialize(state));
    expect(back.utilityGraceUntil).toBe(state.utilityGraceUntil);
  });

  it('keeps density tiers through a save', () => {
    const { sim } = runScript(INFO, [], 1);
    sim.state.zoneTier[5] = ZoneTier.Low;
    sim.state.zoneTier[6] = ZoneTier.High;
    const back = deserialize(serialize(sim.state));
    expect(back.zoneTier[5]).toBe(ZoneTier.Low);
    expect(back.zoneTier[6]).toBe(ZoneTier.High);
  });
});

describe('soak tests', () => {
  const load = (name: string) => deserialize(new Uint8Array(gunzipSync(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)))));

  it('runs the migrated version-1 fixture for five years', () => {
    const state = load('city-v1.timcity');
    const start = state.census.resPop;
    expect(state.utilityGraceUntil).toBe(state.date.year * 12 + state.date.month + 24);
    const sim = new Simulation({ name: state.name, seed: state.seed, size: state.size }, state);
    // As a player would after the warnings: a water tower and a landfill by the town.
    const build = (tool: ToolId, x: number, y: number): ToolCommand => ({ type: 'tool', tool, x0: x, y0: y, x1: x, y1: y, brush: 1, tunnel: false, dryRun: false, requestId: 0 });
    // Two towers south of the town, each with its own wind turbine and a road so they work at full strength.
    for (const x of [31, 49]) {
      expect(runTool(sim.state, build('waterTower', x, 31)).ok).toBe(true);
      expect(runTool(sim.state, build('wind', x + 1, 30)).ok).toBe(true);
    }
    expect(runTool(sim.state, { ...build('road', 28, 33), x1: 52, y1: 33 }).ok).toBe(true);
    expect(runTool(sim.state, build('landfill', 66, 20)).ok).toBe(true);
    for (let t = 0; t < 5 * 12 * TICKS_PER_MONTH; t++) sim.step();
    expect(sim.state.census.resPop).toBeGreaterThan(start / 2);
  }, 60_000);

  it('runs the version-6 fixture for five years with buses and the subway in use every month', () => {
    const state = load('city-v6.timcity');
    expect(state.busLinks.length).toBeGreaterThan(0);
    expect(state.subway.some((v) => v === 1)).toBe(true);
    expect(state.zoneTier.some((v) => v === ZoneTier.Low)).toBe(true);
    expect(state.tiles.includes(TileKind.Museum)).toBe(true);
    const sim = new Simulation({ name: state.name, seed: state.seed, size: state.size }, state);
    for (let month = 0; month < 5 * 12; month++) {
      for (let t = 0; t < TICKS_PER_MONTH; t++) sim.step();
      expect(sim.state.census.busRiders, `bus riders in month ${String(month)}`).toBeGreaterThan(0);
      expect(sim.state.census.subwayRiders, `subway riders in month ${String(month)}`).toBeGreaterThan(0);
    }
  }, 60_000);
});
