/**
 * Writes public/sample-city.timcity, the city the title screen orbits: a
 * coastal town of several neighbourhoods with services, parks, a stadium,
 * a seaport, an airport and a rail line, grown for 40 years. Run with
 * `pnpm sample`.
 */
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import type { ToolCommand, ToolId } from '../src/shared/protocol';
import { deserialize, serialize } from '../src/sim/serialize';
import { Simulation } from '../src/sim/sim';
import { generateTerrain } from '../src/sim/terrain/generate';
import { runTool } from '../src/sim/tools';
import { isPower, isRoad, TileKind, zoneOf } from '../src/shared/tiles';

const info = { name: 'Harbourview', seed: 'harbourview', size: 128 } as const;
let sim = new Simulation(info);
let s = sim.state;
generateTerrain(s, { water: 45, forest: 45, hills: 20 });
s.difficulty = 'easy';
s.randomDisasters = false;
s.funds = 1_000_000;

const cmd = (tool: ToolId, x0: number, y0: number, x1 = x0, y1 = y0, dryRun = true): ToolCommand => ({
  type: 'tool', tool, x0, y0, x1, y1, brush: 1, tunnel: false, dryRun, requestId: 0,
});
const fits = (c: ToolCommand) => {
  const r = runTool(s, c);
  return r.ok && r.bad.length === 0;
};
const failures = new Map<string, number>();
const apply = (c: ToolCommand) => {
  const r = runTool(s, { ...c, dryRun: false });
  if (!r.ok) {
    const key = `${c.tool}: ${r.reason ?? '?'}`;
    failures.set(key, (failures.get(key) ?? 0) + 1);
  }
  return r.ok;
};

/**
 * A neighbourhood: a road loop with a spine, zones on both sides, then the
 * plant and power lines (roads go first: grading next to a building fails).
 */
const block = (ox: number, oy: number, plant: ToolId): ToolCommand[] => [
  ...[6, 13, 20].map((r) => cmd('road', ox + 6, oy + r, ox + 42, oy + r)),
  cmd('road', ox + 6, oy + 6, ox + 6, oy + 20),
  cmd('road', ox + 42, oy + 6, ox + 42, oy + 20),
  // Zone drags give lot centres: two rows of 3×3 lots between each pair of
  // roads, touching end to end so power passes from lot to lot.
  cmd('residential', ox + 9, oy + 8, ox + 27, oy + 11),
  cmd('commercial', ox + 30, oy + 8, ox + 40, oy + 11),
  cmd('industrial', ox + 9, oy + 15, ox + 18, oy + 18),
  cmd('residential', ox + 21, oy + 15, ox + 40, oy + 18),
  cmd(plant, ox + 2, oy + 2),
  cmd('power', ox + 5, oy + 3, ox + 7, oy + 3),
  cmd('power', ox + 7, oy + 3, ox + 7, oy + 20),
];
const extras = (ox: number, oy: number): ToolCommand[] => [
  cmd('police', ox + 45, oy + 17),
  cmd('fire', ox + 45, oy + 9),
  cmd('park', ox + 9, oy + 22, ox + 21, oy + 23),
  cmd('largePark', ox + 31, oy + 23),
];

/**
 * Level a w × h site to its mean height and clear its trees, if it is all
 * open land within 6 height steps; leaves the map untouched otherwise.
 */
function flatten(ox: number, oy: number, w: number, h: number): boolean {
  let lo = Infinity;
  let hi = -Infinity;
  let sum = 0;
  for (let y = oy; y < oy + h; y++) {
    for (let x = ox; x < ox + w; x++) {
      const k = s.tiles[y * s.size + x];
      if (k !== TileKind.Empty && k !== TileKind.Tree) return false;
    }
  }
  for (let y = oy; y <= oy + h; y++) {
    for (let x = ox; x <= ox + w; x++) {
      const c = s.heights[s.cornerIndex(x, y)] ?? 0;
      lo = Math.min(lo, c);
      hi = Math.max(hi, c);
      sum += c;
    }
  }
  if (hi - lo > 6) return false;
  const level = Math.max(lo, Math.round(sum / ((w + 1) * (h + 1))));
  for (let y = oy + 1; y < oy + h; y++) for (let x = ox + 1; x < ox + w; x++) s.heights[s.cornerIndex(x, y)] = level;
  for (let y = oy; y < oy + h; y++) for (let x = ox; x < ox + w; x++) s.tiles[y * s.size + x] = TileKind.Empty;
  return true;
}

const placed: [number, number][] = [];
for (const plant of ['coal', 'nuclear', 'coal', 'coal'] as const) {
  search: for (let oy = 4; oy < s.size - 26; oy += 3) {
    for (let ox = 4; ox < s.size - 48; ox += 3) {
      // Dry land with gentle relief only; then level it and clear the trees.
      const before = serialize(s);
      const undo = () => {
        sim = new Simulation(info, deserialize(before));
        s = sim.state;
      };
      if (!flatten(ox, oy, 48, 24)) continue;
      const plan = block(ox, oy, plant);
      if (!plan.every(fits)) {
        undo();
        continue;
      }
      // Pieces can still clash once earlier ones are down: roll back if any does.
      if (!plan.every(apply)) {
        undo();
        continue;
      }
      for (const c of extras(ox, oy)) if (fits(c)) apply(c);
      placed.push([ox, oy]);
      break search;
    }
  }
}

if (process.env.SAMPLE_DEBUG) {
  const [ox, oy] = placed[0] ?? [0, 0];
  for (let y = oy; y < oy + 25; y++) {
    let row = '';
    for (let x = ox; x < ox + 48; x++) {
      const k = s.tiles[y * s.size + x] ?? 0;
      const z = zoneOf(k);
      const p = isPower(k);
      const r = isRoad(k);
      row += z ? ('RCI'[z.type] ?? '?') : r && p ? 'X' : r ? '=' : p ? '+' : k === TileKind.Tree ? 'T' : k === TileKind.Water ? '~' : k === 0 ? '.' : '#';
    }
    console.log(row);
  }
}

// Landmarks, each on the first site that fits.
for (const tool of ['stadium', 'seaport', 'airport'] as const) {
  search: for (let y = 6; y < s.size - 8; y += 2) {
    for (let x = 6; x < s.size - 8; x += 2) {
      if (fits(cmd(tool, x, y))) {
        apply(cmd(tool, x, y));
        break search;
      }
    }
  }
}

// A rail line between the first two neighbourhoods, if one fits.
const [a, b] = placed;
if (a && b) {
  const line = cmd('rail', a[0] + 44, a[1] + 1, b[0] + 44, a[1] + 1);
  if (fits(line)) apply(line);
}

// Grow for 40 years and a half (so the save is in summer), topping up
// funds so the city never stalls on money.
for (let month = 0; month < 40 * 12 + 6; month++) {
  for (let tick = 0; tick < 16; tick++) sim.step();
  sim.drainEvents();
  if (s.funds < 20_000) s.funds = 50_000;
}

const out = new URL('../public/sample-city.timcity', import.meta.url);
writeFileSync(out, gzipSync(serialize(s)));
if (process.env.SAMPLE_DEBUG) console.log([...failures]);
console.log(JSON.stringify({ census: s.census, valves: s.valves, placed, funds: s.funds }));
console.log(`Wrote ${out.pathname}: ${String(placed.length)} neighbourhoods, population ${String(s.census.resPop)}, year ${String(s.date.year)}`);
