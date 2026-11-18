import type { CityState } from '../state';

/**
 * What a tool would do. Planning never changes state; `apply` performs the
 * change. A dry run is a plan without the apply.
 */
export interface ToolPlan {
  ok: boolean;
  cost: number;
  reason?: string;
  /** Tile indices the tool touches. */
  tiles: number[];
  /** Tile indices that block it. */
  bad: number[];
  /** A word before the cost tag's price, such as "Rezone". */
  label?: string;
  apply: () => void;
}

const noop = (): void => undefined;

export function fail(reason: string, tiles: number[] = [], bad: number[] = []): ToolPlan {
  return { ok: false, cost: 0, reason, tiles, bad, apply: noop };
}

/** Corner heights of tile (x, y): NW, NE, SE, SW. */
export function corners(state: CityState, x: number, y: number): [number, number, number, number] {
  const h = state.heights;
  const nw = state.cornerIndex(x, y);
  const sw = state.cornerIndex(x, y + 1);
  return [h[nw] ?? 0, h[nw + 1] ?? 0, h[sw + 1] ?? 0, h[sw] ?? 0];
}

export type Axis = 'x' | 'y';

/**
 * Roads and rail may climb along their direction but must be level across
 * it. A tile used along both axes (a bend or crossing) must be flat.
 */
export function slopeOk(state: CityState, x: number, y: number, axes: ReadonlySet<Axis>): boolean {
  const [nw, ne, se, sw] = corners(state, x, y);
  const levelAcrossX = nw === sw && ne === se;
  const levelAcrossY = nw === ne && sw === se;
  if (axes.has('x') && !levelAcrossX) return false;
  if (axes.has('y') && !levelAcrossY) return false;
  return true;
}
