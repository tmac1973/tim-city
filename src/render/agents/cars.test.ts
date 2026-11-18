import { describe, expect, it } from 'vitest';
import { AGENT_CAPS } from './budget';
import { carsForTraffic, planCars } from './cars';

describe('car counts', () => {
  it('grow with the traffic value, from none to three per block', () => {
    const counts = [0, 1, 64, 65, 128, 129, 192, 255].map(carsForTraffic);
    expect(counts).toEqual([0, 1, 1, 2, 2, 3, 3, 3]);
    for (let t = 1; t < 256; t++) expect(carsForTraffic(t)).toBeGreaterThanOrEqual(carsForTraffic(t - 1));
  });

  it('spawn up to each block target and cull above it', () => {
    const targets = Uint8Array.from([3, 1, 0, 2]);
    const counts = Uint16Array.from([1, 1, 2, 0]);
    const { spawn, cull } = planCars(targets, counts, 4, 100, [0, 1, 2, 3]);
    expect(spawn.sort()).toEqual([0, 0, 3, 3]);
    expect(cull).toEqual([2, 2]);
  });

  it('never exceed the global cap', () => {
    const blocks = 5000;
    const targets = new Uint8Array(blocks).fill(3);
    const counts = new Uint16Array(blocks);
    const order = Array.from({ length: blocks }, (_, i) => i);
    const { spawn } = planCars(targets, counts, 0, AGENT_CAPS.cars, order);
    expect(spawn).toHaveLength(AGENT_CAPS.cars);
    // Already at the cap: nothing more.
    expect(planCars(targets, counts, AGENT_CAPS.cars, AGENT_CAPS.cars, order).spawn).toHaveLength(0);
  });
});
