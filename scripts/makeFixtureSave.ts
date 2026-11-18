/**
 * Writes src/sim/fixtures/city-v1.timcity: the scripted fixture town after
 * ten years, as a gzipped version-1 save. Later phases that change the save
 * format test their migrations against this file. Run with `pnpm fixture`.
 */
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { FIXTURE_CITY } from '../src/sim/fixtureCity';
import { runScript } from '../src/sim/replay';
import { serialize } from '../src/sim/serialize';
import { FORMAT_VERSION } from '../src/sim/serializeRegistry';

const { sim } = runScript({ name: 'Fixtureville', seed: 'fixture', size: 128 }, FIXTURE_CITY, 120);
const out = new URL(`../src/sim/fixtures/city-v${String(FORMAT_VERSION)}.timcity`, import.meta.url);
writeFileSync(out, gzipSync(serialize(sim.state)));
console.log(`Wrote ${out.pathname}: population ${String(sim.state.census.resPop)}, ${String(sim.state.date.year)}`);
