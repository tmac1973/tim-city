/**
 * Writes public/bench/bench-128.timcity (100,000+ people) and
 * bench-256.timcity (250,000+): dense, fully powered grids built straight
 * into the city state, for `pnpm bench`. No player could grow these in the
 * time a benchmark allows, so the script places top-density, high-tier lots
 * directly. Every ninth cell is a utility cell with a water tower, landfill,
 * wind turbines, bus stops and a subway station, and subway lines join the
 * stations in turn. The sim then runs two months so traffic, power and the
 * census settle.
 * Run with `pnpm bench:cities`.
 */
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import type { MapSize } from '../src/shared/constants';
import type { ToolCommand } from '../src/shared/protocol';
import { TileFlag, TileKind, ZoneTier, ZoneType, zoneKind } from '../src/shared/tiles';
import { serialize } from '../src/sim/serialize';
import { Simulation } from '../src/sim/sim';
import { generateTerrain } from '../src/sim/terrain/generate';
import { placeFootprint } from '../src/sim/tools/footprint';
import { runTool } from '../src/sim/tools';

const CELL = 7;

function build(size: MapSize, plantsEvery: number): Simulation {
  const sim = new Simulation({ name: `Bench ${String(size)}`, seed: `bench-${String(size)}`, size });
  const s = sim.state;
  generateTerrain(s, { water: 20, forest: 35, hills: 0 });
  s.funds = 10_000_000;
  s.randomDisasters = false;
  const land = (x: number, y: number) => {
    const k = s.tiles[s.index(x, y)];
    return k === TileKind.Empty || k === TileKind.Tree;
  };
  const cells = Math.floor((size - 1) / CELL);
  const cellOk: boolean[] = [];
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      let ok = true;
      for (let y = cy * CELL; y <= cy * CELL + CELL && ok; y++) for (let x = cx * CELL; x <= cx * CELL + CELL && ok; x++) ok = land(x, y);
      cellOk.push(ok);
    }
  }
  // Roads around every usable cell; north–south roads also carry power.
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      if (!cellOk[cy * cells + cx]) continue;
      for (let k = 0; k <= CELL; k++) {
        for (const [x, y, vertical] of [
          [cx * CELL + k, cy * CELL, false],
          [cx * CELL + k, cy * CELL + CELL, false],
          [cx * CELL, cy * CELL + k, true],
          [cx * CELL + CELL, cy * CELL + k, true],
        ] as const) {
          const i = s.index(x, y);
          const kind = s.tiles[i];
          const power = vertical || kind === TileKind.RoadPower;
          s.tiles[i] = power ? TileKind.RoadPower : TileKind.Road;
          s.flags[i] = power ? TileFlag.CONDUCTIVE : 0;
          s.parts[i] = 0;
        }
      }
    }
  }
  // Four 3×3 lots per cell: industry on the west edge, downtown commerce in
  // the middle, homes elsewhere; a nuclear plant every few cells, a park now and then.
  let n = 0;
  const utilityCells: [number, number][] = [];
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      if (!cellOk[cy * cells + cx]) continue;
      n++;
      const ox = cx * CELL + 1;
      const oy = cy * CELL + 1;
      const put = (x: number, y: number, kind: number) => {
        placeFootprint(s, x, y, kind);
        const fp = kind === TileKind.NuclearPlant ? 4 : kind === TileKind.Park ? 1 : 3;
        for (let dy = 0; dy < fp; dy++) for (let dx = 0; dx < fp; dx++) s.flags[s.index(x + dx, y + dy)] = TileFlag.CONDUCTIVE;
        // The sim finds a zone lot by the flag on its centre tile.
        if (fp === 3 && kind !== TileKind.Park) {
          for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) s.zoneTier[s.index(x + dx, y + dy)] = ZoneTier.High;
          const centre = s.index(x + 1, y + 1);
          s.flags[centre] = (s.flags[centre] ?? 0) | TileFlag.ZONE_CENTER;
        }
      };
      if (n % plantsEvery === 0) {
        // Against the west road, which carries power to the rest of the grid.
        put(ox, oy + 1, TileKind.NuclearPlant);
        continue;
      }
      if (n % 9 === 4) {
        utilityCells.push([ox, oy]);
        continue;
      }
      if (n % 23 === 0) {
        for (let dy = 0; dy < 6; dy++) for (let dx = 0; dx < 6; dx++) put(ox + dx, oy + dy, TileKind.Park);
        continue;
      }
      const centre = Math.hypot(cx - cells / 2, cy - cells / 2) < cells * 0.18;
      const type = cx < cells * 0.18 ? ZoneType.I : centre ? ZoneType.C : ZoneType.R;
      const lv = centre ? 3 : 2;
      for (const [dx, dy] of [[0, 0], [3, 0], [0, 3], [3, 3]] as const) put(ox + dx, oy + dy, zoneKind(type, 8, lv));
    }
  }
  // Utility cells, built through the tools as a player would.
  s.classReached = 3;
  const tool = (name: ToolCommand['tool'], x0: number, y0: number, x1 = x0, y1 = y0): boolean =>
    runTool(s, { type: 'tool', tool: name, x0, y0, x1, y1, brush: 1, tunnel: false, dryRun: false, requestId: 0 }).ok;
  let built = 0;
  let tries = 0;
  let previous: [number, number] | null = null;
  for (const [ox, oy] of utilityCells) {
    // The 6×6 inside of the cell: a water tower in the north-west corner,
    // turbines along the north road, a landfill in the south-east, and bus
    // stops and a station along the west road. 2×2 and 4×4 tools anchor one
    // tile in from the pointer.
    const station: [number, number] = [ox, oy + 4];
    for (const ok of [
      tool('waterTower', ox + 1, oy + 1),
      tool('landfill', ox + 3, oy + 3),
      ...[2, 3, 4, 5].map((dx) => tool('wind', ox + dx, oy)),
      tool('busStop', ox, oy + 2),
      tool('busStop', ox, oy + 5),
      tool('subwayStation', station[0], station[1]),
      previous ? tool('subway', previous[0], previous[1], station[0], station[1]) : true,
    ]) {
      tries++;
      if (ok) built++;
    }
    previous = station;
  }
  console.log(`  utility cells ${String(utilityCells.length)}: ${String(built)}/${String(tries)} tool commands built`);
  for (let month = 0; month < 2; month++) {
    for (let tick = 0; tick < 16; tick++) sim.step();
    sim.drainEvents();
  }
  return sim;
}

for (const [size, plantsEvery, target] of [[128, 30, 100_000], [256, 30, 250_000]] as const) {
  const sim = build(size, plantsEvery);
  const c = sim.state.census;
  const out = new URL(`../public/bench/bench-${String(size)}.timcity`, import.meta.url);
  writeFileSync(out, gzipSync(serialize(sim.state)));
  console.log(`bench-${String(size)}: population ${String(c.resPop)} (target ${String(target)}), power ${String(c.powerDemand)}/${String(c.powerSupply)}, unpowered ${String(c.unpoweredZones)}`);
  if (c.resPop < target) process.exitCode = 1;
}
