import { MAX_HEIGHT, SEA_LEVEL } from '@/shared/constants';
import { TileKind } from '@/shared/tiles';
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
export function spread(state: CityState, edits: HeightEdits, seeds: Iterable<[number, number]>): void {
  const side = state.size + 1;
  const queue: number[] = [];
  for (const [c, h] of seeds) {
    const clamped = Math.min(MAX_HEIGHT, Math.max(0, h));
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
        edits.set(n, fixed);
        queue.push(n);
      }
    }
  }
  // Drop edits that ended where they started.
  for (const [c, h] of edits) if ((state.heights[c] ?? 0) === h) edits.delete(c);
}

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
  const side = state.size + 1;
  const edits: HeightEdits = new Map();
  const level = (cs: number[]): [number, number][] => {
    const hs = cs.map((c) => heightOf(state, edits, c));
    const lo = Math.min(...hs);
    const target = lo > SEA_LEVEL ? lo : Math.max(...hs);
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
      const touched = touchedTiles(state, edits);
      const blocked = [...touched].filter((i) => !buildingOn.has(i) && !reshapeable(state.tiles[i] ?? 0));
      if (blocked.length > 0) return { reason: "Can't grade next to buildings", bad: blocked };
      const flooded = [...touched].filter((i) => {
        const x = i % state.size;
        const y = (i - x) / state.size;
        return wetWith(state, edits, x, y) !== (state.tiles[i] === TileKind.Water);
      });
      if (flooded.length > 0) return { reason: 'Too close to the water', bad: flooded };
      return { edits, steps: stepCount(state, edits) };
    }
    spread(state, edits, seeds);
  }
  return { reason: 'Too steep', bad: tiles.map((t) => state.index(t.x, t.y)) };
}
