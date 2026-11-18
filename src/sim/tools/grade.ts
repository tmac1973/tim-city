import { MAX_HEIGHT, SEA_LEVEL } from '@/shared/constants';
import { isNetwork, TileKind } from '@/shared/tiles';
import { footprintAt } from './footprint';
import { MAX_LOT_SLOPE } from './place';
import type { CityState } from '../state';
import type { Axis } from './plan';

/** Planned corner heights: corner index → new height. */
export type HeightEdits = Map<number, number>;

export function heightOf(state: CityState, edits: HeightEdits, corner: number): number {
  return edits.get(corner) ?? state.heights[corner] ?? 0;
}

/**
 * Set `seeds` in `edits`, then move neighbouring corners until no two
 * 4-neighbour corners differ by more than one step.
 */
export function spread(state: CityState, edits: HeightEdits, seeds: Iterable<[number, number]>, pinned: ReadonlySet<number> = NO_PINS): boolean {
  let held = true;
  const side = state.size + 1;
  const queue: number[] = [];
  for (const [c, h] of seeds) {
    const clamped = Math.min(MAX_HEIGHT, Math.max(0, h));
    if (pinned.has(c)) {
      if (heightOf(state, edits, c) !== clamped) held = false;
      continue;
    }
    if (heightOf(state, edits, c) !== clamped) {
      edits.set(c, clamped);
      queue.push(c);
    }
  }
  while (queue.length > 0) {
    const c = queue.pop() ?? 0;
    const h = heightOf(state, edits, c);
    const cx = c % side;
    const cy = (c - cx) / side;
    for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]] as const) {
      if (nx < 0 || ny < 0 || nx >= side || ny >= side) continue;
      const n = ny * side + nx;
      const nh = heightOf(state, edits, n);
      const fixed = nh < h - 1 ? h - 1 : nh > h + 1 ? h + 1 : nh;
      if (fixed !== nh) {
        // A pinned corner never moves; the slope it would need is refused.
        if (pinned.has(n)) {
          held = false;
          continue;
        }
        edits.set(n, fixed);
        queue.push(n);
      }
    }
  }
  // Drop edits that ended where they started.
  for (const [c, h] of edits) if ((state.heights[c] ?? 0) === h) edits.delete(c);
  return held;
}

const NO_PINS: ReadonlySet<number> = new Set();

/** Total corner steps moved, which is what the player pays for. */
export function stepCount(state: CityState, edits: HeightEdits): number {
  let steps = 0;
  for (const [c, h] of edits) steps += Math.abs(h - (state.heights[c] ?? 0));
  return steps;
}

/** Tiles that have at least one edited corner. */
export function touchedTiles(state: CityState, edits: HeightEdits): Set<number> {
  const side = state.size + 1;
  const touched = new Set<number>();
  for (const c of edits.keys()) {
    const cx = c % side;
    const cy = (c - cx) / side;
    for (let ty = cy - 1; ty <= cy; ty++) {
      for (let tx = cx - 1; tx <= cx; tx++) if (state.inBounds(tx, ty)) touched.add(state.index(tx, ty));
    }
  }
  return touched;
}

/** Whether tile (x, y) would be under water with the edits applied. */
export function wetWith(state: CityState, edits: HeightEdits, x: number, y: number): boolean {
  const side = state.size + 1;
  const c = y * side + x;
  return [c, c + 1, c + side, c + side + 1].every((i) => heightOf(state, edits, i) <= SEA_LEVEL);
}

export function applyHeights(state: CityState, edits: HeightEdits): void {
  const side = state.size + 1;
  for (const [c, h] of edits) {
    state.heights[c] = h;
    state.markCornerDirty(c % side, Math.floor(c / side));
  }
}

/** Ground that may be reshaped by terraforming or grading. */
export function reshapeable(kind: number): boolean {
  return kind === TileKind.Empty || kind === TileKind.Tree || kind === TileKind.Water || kind === TileKind.Rubble;
}

/**
 * Why a set of corner edits may not be applied, or null if it may. Edits
 * must not flood or drain any tile, and must not move ground under built
 * tiles other than those `buildingOn` (being built now), with one
 * exception: a building may stand on moved ground if its lot stays within
 * the slope its plinth can fill. `bad` lists the tiles in the way.
 */
export function checkEdits(
  state: CityState,
  edits: HeightEdits,
  buildingOn: ReadonlySet<number>,
): { reason: string; bad: number[] } | null {
  const touched = touchedTiles(state, edits);
  const lotOk = new Map<number, boolean>();
  const absorbs = (i: number): boolean => {
    const x = i % state.size;
    const y = (i - x) / state.size;
    const lot = isNetwork(state.tiles[i] ?? 0) ? null : footprintAt(state, x, y);
    if (!lot) return false;
    const key = state.index(lot.x, lot.y);
    let ok = lotOk.get(key);
    if (ok === undefined) {
      let lo = Infinity;
      let hi = -Infinity;
      for (let dy = 0; dy <= lot.size; dy++) {
        for (let dx = 0; dx <= lot.size; dx++) {
          const h = heightOf(state, edits, state.cornerIndex(lot.x + dx, lot.y + dy));
          lo = Math.min(lo, h);
          hi = Math.max(hi, h);
        }
      }
      ok = hi - lo <= MAX_LOT_SLOPE;
      lotOk.set(key, ok);
    }
    return ok;
  };
  const blocked = [...touched].filter((i) => !buildingOn.has(i) && !reshapeable(state.tiles[i] ?? 0) && !absorbs(i));
  if (blocked.length > 0) return { reason: "Can't grade next to buildings", bad: blocked };
  const flooded = [...touched].filter((i) => {
    const x = i % state.size;
    const y = (i - x) / state.size;
    return wetWith(state, edits, x, y) !== (state.tiles[i] === TileKind.Water);
  });
  if (flooded.length > 0) return { reason: 'Too close to the water', bad: flooded };
  return null;
}

/** The four corners of tile `i`. */
function tileCorners(state: CityState, i: number): number[] {
  const side = state.size + 1;
  const x = i % state.size;
  const nw = ((i - x) / state.size) * side + x;
  return [nw, nw + 1, nw + side, nw + side + 1];
}

export interface GradeTile {
  x: number;
  y: number;
  axes: ReadonlySet<Axis>;
}

/**
 * Corner edits that make each tile level across its direction of travel (or
 * flat at a bend), the way a road is cut into a hillside. Pairs of corners
 * are cut down to the lower one, except at the shore, where the low side is
 * filled up instead so the road stays above water.
 */
export function planGrade(
  state: CityState,
  tiles: readonly GradeTile[],
  buildingOn: ReadonlySet<number>,
): { edits: HeightEdits; steps: number } | { reason: string; bad: number[] } {
  // First let nearby buildings take the change on their plinths. Where one
  // can't, or a road or rail is in the way, hold that ground still and
  // grade the new road to it instead.
  const pinned = new Set<number>();
  let result = gradeWith(state, tiles, buildingOn, pinned);
  for (let attempt = 0; attempt < 3 && 'bad' in result && result.reason === "Can't grade next to buildings"; attempt++) {
    const before = pinned.size;
    for (const i of result.bad) for (const c of tileCorners(state, i)) pinned.add(c);
    if (pinned.size === before) break;
    result = gradeWith(state, tiles, buildingOn, pinned);
  }
  return result;
}

function gradeWith(
  state: CityState,
  tiles: readonly GradeTile[],
  buildingOn: ReadonlySet<number>,
  pinned: ReadonlySet<number>,
): { edits: HeightEdits; steps: number } | { reason: string; bad: number[] } {
  const side = state.size + 1;
  const edits: HeightEdits = new Map();
  let held = true;
  const level = (cs: number[]): [number, number][] => {
    const hs = cs.map((c) => heightOf(state, edits, c));
    const fixed = cs.filter((c) => pinned.has(c)).map((c) => heightOf(state, edits, c));
    const lo = Math.min(...hs);
    // Level to held ground when there is some; otherwise cut down to the low side.
    const target = fixed.length > 0 ? (fixed[0] ?? lo) : lo > SEA_LEVEL ? lo : Math.max(...hs);
    if (fixed.some((h) => h !== target)) held = false;
    return cs.map((c) => [c, target]);
  };

  // Spreading can disturb a tile graded earlier, so repeat until all hold.
  for (let pass = 0; pass < 6; pass++) {
    const seeds: [number, number][] = [];
    for (const { x, y, axes } of tiles) {
      const nw = y * side + x;
      const ne = nw + 1;
      const sw = nw + side;
      const se = sw + 1;
      const h = (c: number) => heightOf(state, edits, c);
      if (axes.size > 1) {
        if (!(h(nw) === h(ne) && h(ne) === h(se) && h(se) === h(sw))) seeds.push(...level([nw, ne, se, sw]));
      } else if (axes.has('x')) {
        if (h(nw) !== h(sw)) seeds.push(...level([nw, sw]));
        if (h(ne) !== h(se)) seeds.push(...level([ne, se]));
      } else {
        if (h(nw) !== h(ne)) seeds.push(...level([nw, ne]));
        if (h(sw) !== h(se)) seeds.push(...level([sw, se]));
      }
    }
    if (seeds.length === 0) {
      const refused = checkEdits(state, edits, buildingOn);
      return refused ?? { edits, steps: stepCount(state, edits) };
    }
    if (!spread(state, edits, seeds, pinned)) held = false;
    if (!held) break;
  }
  return { reason: held ? 'Too steep' : 'Too steep beside buildings', bad: tiles.map((t) => state.index(t.x, t.y)) };
}
