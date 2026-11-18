import { describe, expect, it } from 'vitest';
import type { ToolCommand, ToolId } from '@/shared/protocol';
import { TileFlag } from '@/shared/tiles';
import { CityState } from '@/sim/state';
import { updatePollution } from '@/sim/systems/pollution';
import { runTool } from '@/sim/tools';
import { CityMirror } from './mirror';
import { COLUMN_THRESHOLD, OverlayLayer, overlayDef } from './overlays';

const tool = (t: ToolId, x0: number, y0: number, x1 = x0, y1 = y0): ToolCommand => ({
  type: 'tool', tool: t, x0, y0, x1, y1, brush: 1, tunnel: false, dryRun: false, requestId: 0,
});

/** A sim with real pollution around two coal plants. */
function pollutedSim(): CityState {
  const s = new CityState({ name: 'T', seed: 'overlay', size: 128 });
  s.heights.fill(3);
  s.funds = 1e6;
  runTool(s, tool('coal', 30, 30));
  runTool(s, tool('coal', 90, 70));
  updatePollution(s);
  return s;
}

describe('overlay layer', () => {
  it("shows exactly the sim's field values", () => {
    const sim = pollutedSim();
    const field = sim.field('pollution');
    const layer = new OverlayLayer(new CityMirror(128));
    layer.setActive('pollution');
    // What the worker sends: a copy of the field.
    layer.setField('pollution', field.slice());
    expect(Array.from(layer.values ?? [])).toEqual(Array.from(field));
    // Every texture pixel is the ramp colour of that block's value.
    const ramp = overlayDef('pollution')?.ramp;
    for (let b = 0; b < field.length; b += 97) {
      expect(Array.from(layer.pixels?.subarray(b * 4, b * 4 + 4) ?? [])).toEqual(ramp?.(field[b] ?? 0).map(Math.round));
    }
  });

  it('raises one column per block above the threshold', () => {
    const sim = pollutedSim();
    const field = sim.field('pollution');
    const layer = new OverlayLayer(new CityMirror(128));
    layer.setActive('pollution');
    layer.setField('pollution', field.slice());
    expect(layer.columnCount).toBe(field.filter((v) => v >= COLUMN_THRESHOLD).length);
    expect(layer.columnCount).toBeGreaterThan(0);
  });

  it('ignores fields other than the active one and draws no columns for ground-only overlays', () => {
    const layer = new OverlayLayer(new CityMirror(128));
    layer.setActive('traffic');
    layer.setField('pollution', new Uint8Array(64 * 64).fill(200));
    expect(layer.values).toBeNull();
    layer.setField('traffic', new Uint8Array(64 * 64).fill(200));
    expect(layer.columnCount).toBe(0);
    expect(layer.uniforms.uOverlayOn.value).toBe(1);
    layer.setActive(null);
    expect(layer.uniforms.uOverlayOn.value).toBe(0);
  });

  it('marks powered tiles and dark zones for the power overlay', () => {
    const sim = pollutedSim();
    runTool(sim, tool('residential', 60, 60));
    const mirror = new CityMirror(128);
    mirror.tiles.set(sim.tiles);
    mirror.flags.set(sim.flags);
    mirror.flags[mirror.size * 30 + 30] = (mirror.flags[mirror.size * 30 + 30] ?? 0) | TileFlag.POWERED;
    const layer = new OverlayLayer(mirror);
    layer.setActive('power');
    expect(layer.values?.[30 * 128 + 30]).toBe(2);
    expect(layer.values?.[60 * 128 + 60]).toBe(1);
    expect(layer.values?.[5 * 128 + 5]).toBe(0);
  });
});
