import { COSTS } from '@/shared/costs';
import type { ToolCommand } from '@/shared/protocol';
import { TileFlag, TileKind, ZONE_SIZE, zoneKind, type ZoneType } from '@/shared/tiles';
import type { CityState } from '../state';
import { placeFootprint } from './footprint';
import { fail, type ToolPlan } from './plan';

interface Lot {
  /** Top-left tile. */
  x: number;
  y: number;
  size: number;
  tiles: number[];
}

function lotAt(state: CityState, x: number, y: number, size: number): Lot | null {
  if (x < 0 || y < 0 || x + size > state.size || y + size > state.size) return null;
  const tiles: number[] = [];
  for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) tiles.push(state.index(x + dx, y + dy));
  return { x, y, size, tiles };
}

function lotCorners(state: CityState, lot: Lot): number[] {
  const out: number[] = [];
  for (let dy = 0; dy <= lot.size; dy++) {
    for (let dx = 0; dx <= lot.size; dx++) out.push(state.cornerIndex(lot.x + dx, lot.y + dy));
  }
  return out;
}

/** Steepest lot a building can stand on: its plinth fills the difference. */
export const MAX_LOT_SLOPE = 2;

/**
 * Check a lot for building. Lots are not levelled: a lot may slope up to
 * two steps and the building stands on a plinth reaching down to its lowest
 * corner. Returns the clearing cost, or why the lot can't be used.
 */
function checkLot(
  state: CityState,
  lot: Lot,
  taken: Set<number>,
  maxSlope = MAX_LOT_SLOPE,
): { clearing: number } | { reason: string } {
  let clearing = 0;
  for (const i of lot.tiles) {
    const kind = state.tiles[i] ?? 0;
    if (kind === TileKind.Water) return { reason: 'Not on water' };
    if (kind === TileKind.Radiation) return { reason: 'Radioactive' };
    // A plain power line can be built over: every building tile conducts, so the line stays connected.
    if (kind !== TileKind.Empty && kind !== TileKind.Tree && kind !== TileKind.Rubble && kind !== TileKind.PowerLine) {
      return { reason: 'Tile occupied' };
    }
    if (taken.has(i)) return { reason: 'Overlaps another lot' };
    if (kind !== TileKind.Empty) clearing += COSTS.bulldoze;
  }
  const heights = lotCorners(state, lot).map((c) => state.heights[c] ?? 0);
  if (Math.max(...heights) - Math.min(...heights) > maxSlope) return { reason: 'Too steep' };
  for (const i of lot.tiles) taken.add(i);
  return { clearing };
}

/**
 * Paint zones: one 3×3 lot centred on the start tile, then more every three
 * tiles towards the end of the drag. Lots that can't be used are skipped
 * (and shown red); the rest are built.
 */
export function planZones(state: CityState, cmd: ToolCommand, type: ZoneType): ToolPlan {
  const stepX = Math.sign(cmd.x1 - cmd.x0) * ZONE_SIZE;
  const stepY = Math.sign(cmd.y1 - cmd.y0) * ZONE_SIZE;
  const countX = stepX === 0 ? 1 : Math.floor(Math.abs(cmd.x1 - cmd.x0) / ZONE_SIZE) + 1;
  const countY = stepY === 0 ? 1 : Math.floor(Math.abs(cmd.y1 - cmd.y0) / ZONE_SIZE) + 1;

  const taken = new Set<number>();
  const accepted: Lot[] = [];
  const tiles: number[] = [];
  const bad: number[] = [];
  let reason: string | undefined;
  let cost = 0;

  for (let j = 0; j < countY; j++) {
    for (let i = 0; i < countX; i++) {
      const cx = cmd.x0 + i * stepX;
      const cy = cmd.y0 + j * stepY;
      const lot = lotAt(state, cx - 1, cy - 1, ZONE_SIZE);
      if (!lot) {
        if (state.inBounds(cx, cy)) bad.push(state.index(cx, cy));
        reason ??= 'Too close to the edge';
        continue;
      }
      tiles.push(...lot.tiles);
      const checked = checkLot(state, lot, taken);
      if ('reason' in checked) {
        bad.push(...lot.tiles);
        reason ??= checked.reason;
        continue;
      }
      accepted.push(lot);
      cost += COSTS.zone + checked.clearing;
    }
  }
  if (accepted.length === 0) return fail(reason ?? 'Nothing to zone', tiles, bad);

  return {
    ok: true,
    cost,
    tiles,
    bad,
    apply: () => {
      for (const lot of accepted) {
        placeFootprint(state, lot.x, lot.y, zoneKind(type, 0));
        markBuilt(state, lot);
        const center = state.index(lot.x + 1, lot.y + 1);
        state.flags[center] = (state.flags[center] ?? 0) | TileFlag.ZONE_CENTER;
      }
    },
  };
}

/** Every tile of a building conducts power. */
function markBuilt(state: CityState, lot: Lot): void {
  for (const i of lot.tiles) state.flags[i] = TileFlag.CONDUCTIVE;
}

/**
 * A single building (plant, station, large park) of `size` × `size` tiles
 * whose top-left is one tile up and left of the click.
 */
export function planBuilding(
  state: CityState,
  cmd: ToolCommand,
  kind: number,
  size: number,
  price: number,
  rules: { maxSlope?: number; needsWaterEdge?: boolean } = {},
): ToolPlan {
  const lot = lotAt(state, cmd.x1 - 1, cmd.y1 - 1, size);
  if (!lot) return fail('Too close to the edge');
  const checked = checkLot(state, lot, new Set(), rules.maxSlope);
  if ('reason' in checked) return fail(checked.reason, lot.tiles, lot.tiles);
  if (rules.needsWaterEdge && waterSide(state, lot.x, lot.y, size) === null) {
    return fail('Must face open water along one side', lot.tiles, lot.tiles);
  }
  return {
    ok: true,
    cost: price + checked.clearing,
    tiles: lot.tiles,
    bad: [],
    apply: () => {
      placeFootprint(state, lot.x, lot.y, kind);
      markBuilt(state, lot);
    },
  };
}

/**
 * The side of a size × size lot (0 north, 1 east, 2 south, 3 west) whose
 * whole edge borders water, or null. Seaports need one for their quay.
 */
export function waterSide(state: { size: number; tiles: Uint16Array }, x: number, y: number, size: number): number | null {
  const isWater = (tx: number, ty: number) =>
    tx >= 0 && ty >= 0 && tx < state.size && ty < state.size && state.tiles[ty * state.size + tx] === TileKind.Water;
  const edges: [number, number, number, number][] = [
    [x, y - 1, 1, 0],
    [x + size, y, 0, 1],
    [x, y + size, 1, 0],
    [x - 1, y, 0, 1],
  ];
  for (let side = 0; side < 4; side++) {
    const [sx, sy, dx, dy] = edges[side] ?? [0, 0, 0, 0];
    let all = true;
    for (let k = 0; k < size; k++) if (!isWater(sx + dx * k, sy + dy * k)) all = false;
    if (all) return side;
  }
  return null;
}

/** Small parks: drag a box; every open tile in it gets one. */
export function planParks(state: CityState, cmd: ToolCommand): ToolPlan {
  const x0 = Math.max(0, Math.min(cmd.x0, cmd.x1));
  const x1 = Math.min(state.size - 1, Math.max(cmd.x0, cmd.x1));
  const y0 = Math.max(0, Math.min(cmd.y0, cmd.y1));
  const y1 = Math.min(state.size - 1, Math.max(cmd.y0, cmd.y1));
  const tiles: number[] = [];
  const bad: number[] = [];
  const lots: Lot[] = [];
  let cost = 0;
  const taken = new Set<number>();
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const lot = lotAt(state, x, y, 1);
      if (!lot) continue;
      tiles.push(...lot.tiles);
      const checked = checkLot(state, lot, taken);
      if ('reason' in checked) bad.push(...lot.tiles);
      else {
        lots.push(lot);
        cost += COSTS.park + checked.clearing;
      }
    }
  }
  if (lots.length === 0) return fail('No open land here', tiles, bad);
  return {
    ok: true,
    cost,
    tiles,
    bad,
    apply: () => {
      for (const lot of lots) placeFootprint(state, lot.x, lot.y, TileKind.Park);
    },
  };
}
