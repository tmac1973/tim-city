import { SEA_LEVEL } from '@/shared/constants';
import { COSTS } from '@/shared/costs';
import type { ToolCommand } from '@/shared/protocol';
import { PLANT_SIZE, TileFlag, TileKind, ZONE_SIZE, zoneKind, type ZoneType } from '@/shared/tiles';
import type { CityState } from '../state';
import { placeFootprint } from './footprint';
import { applyHeights, checkEdits, type HeightEdits, heightOf, spread, stepCount } from './grade';
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

/**
 * Check a lot and level it (into `edits`) for building. Lots may slope by at
 * most one step; they are levelled to the rounded mean height, kept above
 * the water. Returns the extra clearing cost, or why the lot can't be used.
 */
function prepareLot(
  state: CityState,
  lot: Lot,
  edits: HeightEdits,
  buildingOn: Set<number>,
): { clearing: number } | { reason: string } {
  let clearing = 0;
  for (const i of lot.tiles) {
    const kind = state.tiles[i] ?? 0;
    if (kind === TileKind.Water) return { reason: 'Not on water' };
    if (kind !== TileKind.Empty && kind !== TileKind.Tree && kind !== TileKind.Rubble) return { reason: 'Tile occupied' };
    if (buildingOn.has(i)) return { reason: 'Overlaps another lot' };
    if (kind !== TileKind.Empty) clearing += COSTS.bulldoze;
  }
  const corners = lotCorners(state, lot);
  const heights = corners.map((c) => heightOf(state, edits, c));
  const lo = Math.min(...heights);
  const hi = Math.max(...heights);
  if (hi - lo > 1) return { reason: 'Too steep' };

  if (hi !== lo) {
    const mean = heights.reduce((a, b) => a + b, 0) / heights.length;
    const target = Math.max(SEA_LEVEL + 1, Math.round(mean));
    const trial: HeightEdits = new Map(edits);
    spread(state, trial, corners.map((c) => [c, target]));
    const refused = checkEdits(state, trial, new Set([...buildingOn, ...lot.tiles]));
    if (refused) return { reason: refused.reason };
    // Spreading must not have tilted a lot accepted earlier in this drag.
    for (const [c, h] of trial) edits.set(c, h);
  }
  for (const i of lot.tiles) buildingOn.add(i);
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

  const edits: HeightEdits = new Map();
  const buildingOn = new Set<number>();
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
      const snapshot = new Map(edits);
      const prepared = prepareLot(state, lot, edits, buildingOn);
      if ('reason' in prepared) {
        bad.push(...lot.tiles);
        reason ??= prepared.reason;
        continue;
      }
      if (!accepted.every((other) => lotIsLevel(state, edits, other))) {
        // This lot's levelling disturbed an earlier one; skip it instead.
        edits.clear();
        for (const [c, h] of snapshot) edits.set(c, h);
        for (const t of lot.tiles) buildingOn.delete(t);
        bad.push(...lot.tiles);
        reason ??= 'Too steep';
        continue;
      }
      accepted.push(lot);
      cost += COSTS.zone + prepared.clearing;
    }
  }
  if (accepted.length === 0) return fail(reason ?? 'Nothing to zone', tiles, bad);
  cost += stepCount(state, edits) * COSTS.terraform;

  return {
    ok: true,
    cost,
    tiles,
    bad,
    apply: () => {
      applyHeights(state, edits);
      for (const lot of accepted) {
        placeFootprint(state, lot.x, lot.y, zoneKind(type, 0));
        markBuilt(state, lot);
        const center = state.index(lot.x + 1, lot.y + 1);
        state.flags[center] = (state.flags[center] ?? 0) | TileFlag.ZONE_CENTER;
      }
    },
  };
}

function lotIsLevel(state: CityState, edits: HeightEdits, lot: Lot): boolean {
  const heights = lotCorners(state, lot).map((c) => heightOf(state, edits, c));
  return Math.max(...heights) === Math.min(...heights);
}

/** Every tile of a building conducts power. */
function markBuilt(state: CityState, lot: Lot): void {
  for (const i of lot.tiles) state.flags[i] = TileFlag.CONDUCTIVE;
}

/** A 4×4 power plant whose top-left is one tile up and left of the click. */
export function planPlant(state: CityState, cmd: ToolCommand, kind: number): ToolPlan {
  const lot = lotAt(state, cmd.x1 - 1, cmd.y1 - 1, PLANT_SIZE);
  if (!lot) return fail('Too close to the edge');
  const edits: HeightEdits = new Map();
  const prepared = prepareLot(state, lot, edits, new Set());
  if ('reason' in prepared) return fail(prepared.reason, lot.tiles, lot.tiles);
  const price = kind === TileKind.CoalPlant ? COSTS.coalPlant : COSTS.nuclearPlant;

  return {
    ok: true,
    cost: price + prepared.clearing + stepCount(state, edits) * COSTS.terraform,
    tiles: lot.tiles,
    bad: [],
    apply: () => {
      applyHeights(state, edits);
      placeFootprint(state, lot.x, lot.y, kind);
      markBuilt(state, lot);
    },
  };
}
