import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { TICKS_PER_MONTH } from '@/shared/constants';
import { gunzip, gzip } from '@/save/compress';
import { zoneOf, ZoneTier } from '@/shared/tiles';
import { FIXTURE_CITY } from './fixtureCity';
import { runScript } from './replay';
import { deserialize, peekSave, readRaw, serialize } from './serialize';
import { FORMAT_VERSION } from './serializeRegistry';
import { Simulation } from './sim';

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

  it('keeps density tiers through a save', () => {
    const { sim } = runScript(INFO, [], 1);
    sim.state.zoneTier[5] = ZoneTier.Low;
    sim.state.zoneTier[6] = ZoneTier.High;
    const back = deserialize(serialize(sim.state));
    expect(back.zoneTier[5]).toBe(ZoneTier.Low);
    expect(back.zoneTier[6]).toBe(ZoneTier.High);
  });
});
