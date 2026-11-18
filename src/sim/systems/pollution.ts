import { PLANT_POLLUTION } from '@/shared/costs';
import { isPark, isPlant, TileFlag, TileKind, zoneOf, ZoneType } from '@/shared/tiles';
import type { System } from '../scheduler';
import type { CityState } from '../state';
import { SPILL_POLLUTION } from '../disasters/impacts';
import { blockGeometry, blur, store } from './fields';
import { plantName } from './power';

/** Pollution a coal plant puts into its block before spreading; other plants scale it by PLANT_POLLUTION. */
export const COAL_POLLUTION = 255;
const AIRPORT_POLLUTION = 120;
const SEAPORT_POLLUTION = 60;
const INDUSTRY_PER_LEVEL = 20;
/** Education cover at which industry turns cleaner and better paid. */
export const EDUCATED = 64;
const PARK_CLEANING = 30;
const TREE_CLEANING = 5;

/**
 * Monthly pollution: industry by density, coal plants and half of each
 * block's traffic pollute; parks and trees clean; then it spreads by one
 * box blur.
 */
export function updatePollution(state: CityState): void {
  const { side } = blockGeometry(state);
  const acc = new Float32Array(side * side);
  const traffic = state.field('traffic');
  for (let b = 0; b < acc.length; b++) acc[b] = (traffic[b] ?? 0) / 2;

  const { size, tiles, flags, parts } = state;
  for (let i = 0; i < size * size; i++) {
    const kind = tiles[i] ?? 0;
    const x = i % size;
    const y = (i - x) / size;
    const b = state.blockIndex(x, y);
    if ((flags[i] ?? 0) & TileFlag.ZONE_CENTER) {
      const zone = zoneOf(kind);
      // Industry near a university pollutes half as much.
      const taught = (state.field('educationCover')[b] ?? 0) >= EDUCATED ? 0.5 : 1;
      if (zone?.type === ZoneType.I) acc[b] = (acc[b] ?? 0) + INDUSTRY_PER_LEVEL * zone.density * taught;
    } else if (isPlant(kind) && parts[i] === 1) {
      const smoke = PLANT_POLLUTION[plantName(kind) ?? 'nuclear'];
      const c = state.blockIndex(x + 2, y + 2);
      if (smoke > 0) acc[c] = (acc[c] ?? 0) + COAL_POLLUTION * smoke;
    } else if (kind === TileKind.Airport && parts[i] === 1) {
      const c = state.blockIndex(x + 3, y + 3);
      acc[c] = (acc[c] ?? 0) + AIRPORT_POLLUTION;
    } else if (kind === TileKind.Seaport && parts[i] === 1) {
      const c = state.blockIndex(x + 2, y + 2);
      acc[c] = (acc[c] ?? 0) + SEAPORT_POLLUTION;
    } else if (isPark(kind)) {
      acc[b] = (acc[b] ?? 0) - PARK_CLEANING;
    } else if (kind === TileKind.Tree) {
      acc[b] = (acc[b] ?? 0) - TREE_CLEANING;
    }
  }
  // Radioactive tiles poison their block outright.
  for (const i of state.radiation.keys()) {
    const b = state.blockIndex(i % size, Math.floor(i / size));
    acc[b] = Math.max(acc[b] ?? 0, 255);
  }
  // Oil spills foul the 3×3 blocks around a wreck, for a year.
  for (const spill of state.pollutionSpills) {
    const bx = spill.x >> 1;
    const by = spill.y >> 1;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (bx + dx < 0 || by + dy < 0 || bx + dx >= side || by + dy >= side) continue;
        const b = (by + dy) * side + bx + dx;
        acc[b] = (acc[b] ?? 0) + SPILL_POLLUTION;
      }
    }
    spill.monthsLeft--;
  }
  state.pollutionSpills = state.pollutionSpills.filter((s) => s.monthsLeft > 0);
  for (let b = 0; b < acc.length; b++) acc[b] = Math.max(0, acc[b] ?? 0);
  store(state.field('pollution'), blur(acc, side));
}

export const pollutionSystem: System = { name: 'pollution', phaseTicks: [2], run: updatePollution };
