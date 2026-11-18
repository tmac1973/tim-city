import { COSTS } from '@/shared/costs';
import type { ToolCommand } from '@/shared/protocol';
import { PLANT_SIZE, TileFlag, TileKind, ZONE_SIZE, zoneKind, type ZoneType } from '@/shared/tiles';
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
function checkLot(state: CityState, lot: Lot, taken: Set<number>): { clearing: number } | { reason: string } {
  let clearing = 0;
  for (const i of lot.tiles) {
    const kind = state.tiles[i] ?? 0;
    if (kind === TileKind.Water) return { reason: 'Not on water' };
    if (kind !== TileKind.Empty && kind !== TileKind.Tree && kind !== TileKind.Rubble) return { reason: 'Tile occupied' };
    if (taken.has(i)) return { reason: 'Overlaps another lot' };
    if (kind !== TileKind.Empty) clearing += COSTS.bulldoze;
  }
  const heights = lotCorners(state, lot).map((c) => state.heights[c] ?? 0);
  if (Math.max(...heights) - Math.min(...heights) > MAX_LOT_SLOPE) return { reason: 'Too steep' };
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

/** A 4×4 power plant whose top-left is one tile up and left of the click. */
export function planPlant(state: CityState, cmd: ToolCommand, kind: number): ToolPlan {
  const lot = lotAt(state, cmd.x1 - 1, cmd.y1 - 1, PLANT_SIZE);
  if (!lot) return fail('Too close to the edge');
  const checked = checkLot(state, lot, new Set());
  if ('reason' in checked) return fail(checked.reason, lot.tiles, lot.tiles);
  const price = kind === TileKind.CoalPlant ? COSTS.coalPlant : COSTS.nuclearPlant;

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
