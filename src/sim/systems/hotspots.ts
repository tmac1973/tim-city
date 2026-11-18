import type { ProblemId } from '@/shared/protocol';
import { isRail, TileFlag, TileKind, zoneOf, ZoneType } from '@/shared/tiles';
import type { CityState } from '../state';
import { around, blockGeometry, countAround } from './fields';

export interface Hotspot {
  x: number | null;
  y: number | null;
  cause: string;
}

/** The block, among those where `include` holds, with the highest value. */
function extremeBlock(
  state: CityState,
  value: (b: number) => number,
  include: (b: number) => boolean,
): { b: number; v: number } | null {
  let best: { b: number; v: number } | null = null;
  const n = (state.size >> 1) ** 2;
  for (let b = 0; b < n; b++) {
    if (!include(b)) continue;
    const v = value(b);
    if (!best || v > best.v) best = { b, v };
  }
  return best;
}

/** Visit every zone centre with its zone. */
function eachZone(state: CityState, visit: (i: number, type: ZoneType, density: number) => void): void {
  for (let i = 0; i < state.size * state.size; i++) {
    if (!((state.flags[i] ?? 0) & TileFlag.ZONE_CENTER)) continue;
    const zone = zoneOf(state.tiles[i] ?? 0);
    if (zone) visit(i, zone.type, zone.density);
  }
}

/** What contributes most pollution near tile (x, y): one of the main sources, by weight. */
function pollutionSource(state: CityState, x: number, y: number): string {
  const weight: Record<string, number> = { industry: 0, 'a power plant': 0, 'road traffic': 0, 'the airport': 0, 'the seaport': 0 };
  around(state, x, y, 6, (i) => {
    const kind = state.tiles[i] ?? 0;
    const zone = zoneOf(kind);
    if (zone?.type === ZoneType.I && (state.flags[i] ?? 0) & TileFlag.ZONE_CENTER) weight.industry = (weight.industry ?? 0) + 20 * zone.density;
    if (kind === TileKind.CoalPlant || kind === TileKind.OilPlant || kind === TileKind.GasPlant) weight['a power plant'] = (weight['a power plant'] ?? 0) + 16;
    if (kind === TileKind.Airport) weight['the airport'] = (weight['the airport'] ?? 0) + 4;
    if (kind === TileKind.Seaport) weight['the seaport'] = (weight['the seaport'] ?? 0) + 4;
  });
  weight['road traffic'] = (state.field('traffic')[state.blockIndex(x, y)] ?? 0) / 2;
  const [name] = Object.entries(weight).sort((a, b) => b[1] - a[1])[0] ?? ['industry'];
  return `Pollution from ${name}`;
}

/**
 * Where a problem is worst and why, by one fixed rule per problem. The
 * returned tile is where the "Show me" button points the camera.
 */
export function findHotspot(state: CityState, problem: ProblemId): Hotspot {
  const { centre } = blockGeometry(state);
  const density = state.field('popDensity');
  const populated = (b: number) => (density[b] ?? 0) > 0;
  const at = (b: number, cause: string): Hotspot => {
    const [x, y] = centre(b);
    return { x, y, cause };
  };
  const none = (cause: string): Hotspot => ({ x: null, y: null, cause });

  switch (problem) {
    case 'crime': {
      const crime = state.field('crime');
      const spot = extremeBlock(state, (b) => crime[b] ?? 0, populated);
      if (!spot || spot.v === 0) return none('No crime to speak of');
      const policed = (state.field('policeCover')[spot.b] ?? 0) >= 64;
      return at(spot.b, policed ? 'Crime in a low land value area' : 'No police coverage here');
    }
    case 'pollution': {
      const pollution = state.field('pollution');
      const spot = extremeBlock(state, (b) => pollution[b] ?? 0, populated);
      if (!spot || spot.v === 0) return none('The air is clean');
      const [x, y] = centre(spot.b);
      return at(spot.b, pollutionSource(state, x, y));
    }
    case 'housing': {
      let best: { i: number; v: number } | null = null;
      eachZone(state, (i, type) => {
        if (type !== ZoneType.R) return;
        const v = state.field('landValue')[state.blockIndex(i % state.size, Math.floor(i / state.size))] ?? 0;
        if (!best || v > best.v) best = { i, v };
      });
      const found = best as { i: number; v: number } | null;
      if (!found) return none('No homes yet');
      return { x: found.i % state.size, y: Math.floor(found.i / state.size), cause: 'Land value too high for residents' };
    }
    case 'taxes': {
      let worst: { i: number; loss: number } | null = null;
      eachZone(state, (i, type, d) => {
        if (type !== ZoneType.R) return;
        const loss = (state.densityAtYearStart[i] ?? 0) - d;
        if (loss > 0 && (!worst || loss > worst.loss)) worst = { i, loss };
      });
      const found = worst as { i: number; loss: number } | null;
      if (!found) return none(state.taxRate > 7 ? 'Taxes are above the usual 7%' : 'Taxes are fair');
      return { x: found.i % state.size, y: Math.floor(found.i / state.size), cause: 'Residents leaving over taxes' };
    }
    case 'traffic': {
      const traffic = state.field('traffic');
      const spot = extremeBlock(state, (b) => traffic[b] ?? 0, () => true);
      if (!spot || spot.v === 0) return none('Roads are clear');
      const [x, y] = centre(spot.b);
      const rail = countAround(state, x, y, 5, isRail) > 0;
      const cause = spot.v > 200 ? 'Road over capacity' : 'Busy roads';
      return at(spot.b, rail ? cause : `${cause} — a rail line nearby would help`);
    }
    case 'unemployment': {
      const jobs: number[] = [];
      const homes: number[] = [];
      eachZone(state, (i, type, d) => {
        if (type === ZoneType.R && d > 0) homes.push(i);
        else if (type !== ZoneType.R) jobs.push(i);
      });
      if (homes.length === 0) return none('No residents yet');
      // The populated homes farthest from any job zone.
      let worst = { i: homes[0] ?? 0, d: -1 };
      for (const h of homes) {
        const hx = h % state.size;
        const hy = Math.floor(h / state.size);
        let nearest = Infinity;
        for (const j of jobs) nearest = Math.min(nearest, Math.hypot(hx - (j % state.size), hy - Math.floor(j / state.size)));
        if (nearest > worst.d) worst = { i: h, d: nearest };
      }
      return { x: worst.i % state.size, y: Math.floor(worst.i / state.size), cause: 'Not enough jobs nearby' };
    }
    case 'fires': {
      const fire = state.field('fireCover');
      const spot = extremeBlock(state, (b) => density[b] ?? 0, (b) => populated(b) && (fire[b] ?? 0) < 64);
      if (!spot) return none('Fire coverage is good');
      return at(spot.b, 'No fire coverage here');
    }
  }
}
