/**
 * Times each sim system on a saved city: `pnpm profile:sim <file> [months]`.
 * Prints the mean and worst month, and each system's share per tick.
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { TICKS_PER_MONTH } from '../src/shared/constants';
import { deserialize } from '../src/sim/serialize';
import { Simulation } from '../src/sim/sim';

const file = process.argv[2] ?? 'public/bench/bench-256.timcity';
const months = Number(process.argv[3] ?? 12);
let bytes: Uint8Array = readFileSync(file);
try {
  bytes = gunzipSync(bytes);
} catch {
  // Not gzipped.
}
const state = deserialize(bytes);
const sim = new Simulation({ name: state.name, seed: state.seed, size: state.size }, state);
// One warm-up month.
for (let t = 0; t < TICKS_PER_MONTH; t++) sim.step();
sim.scheduler.timings = new Map();
const monthTimes: number[] = [];
const tickTimes: number[] = [];
for (let m = 0; m < months; m++) {
  const t0 = performance.now();
  for (let t = 0; t < TICKS_PER_MONTH; t++) {
    const s = performance.now();
    sim.step();
    tickTimes.push(performance.now() - s);
  }
  monthTimes.push(performance.now() - t0);
}
const mean = monthTimes.reduce((a, b) => a + b, 0) / months;
const ticks = months * TICKS_PER_MONTH;
console.log(`${file}: size ${String(state.size)}, population ${String(state.census.resPop)}`);
console.log(`month mean ${mean.toFixed(1)} ms, worst ${Math.max(...monthTimes).toFixed(1)} ms; worst tick ${Math.max(...tickTimes).toFixed(1)} ms`);
console.log(
  [...sim.scheduler.timings]
    .sort((a, b) => b[1] - a[1])
    .map(([name, ms]) => `  ${name.padEnd(14)} ${(ms / ticks).toFixed(2)} ms/tick`)
    .join('\n'),
);
