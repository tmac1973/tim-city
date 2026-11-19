/**
 * Writes src/sim/fixtures/city-v<format>.timcity: the scripted fixture town
 * after ten years, as a gzipped save in the current format. city-v1 came
 * from the first format and tests migrations; city-v6 is the town with
 * every 2.0 feature (FIXTURE_CITY_V6). Run with `pnpm fixture`.
 */
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { FIXTURE_CITY_V6 } from '../src/sim/fixtureCity';
import { runScript } from '../src/sim/replay';
import { serialize } from '../src/sim/serialize';
import { FORMAT_VERSION } from '../src/sim/serializeRegistry';

const { sim } = runScript({ name: 'Fixtureville', seed: 'fixture', size: 128 }, FIXTURE_CITY_V6, 120);
const out = new URL(`../src/sim/fixtures/city-v${String(FORMAT_VERSION)}.timcity`, import.meta.url);
writeFileSync(out, gzipSync(serialize(sim.state)));
console.log(`Wrote ${out.pathname}: population ${String(sim.state.census.resPop)}, ${String(sim.state.date.year)}`);
