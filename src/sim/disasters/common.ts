import type { ActiveDisaster, DisasterType } from '@/shared/protocol';
import { isBridge, isNetwork, isPower, TileFlag, TileKind } from '@/shared/tiles';
import type { Rng } from '../rng';
import type { CityState } from '../state';
import { footprintAt } from '../tools/footprint';

/** Trees, power lines and every building burn; roads, rail, water, rubble and bare land do not. */
export function isFlammable(kind: number): boolean {
  if (kind === TileKind.Tree || isPower(kind)) return true;
  return kind >= 64 && kind !== TileKind.Radiation;
}

/** Wreck one tile into rubble; a building goes down whole. Returns tiles destroyed. */
export function destroy(state: CityState, x: number, y: number): number {
  if (!state.inBounds(x, y)) return 0;
  const i = state.index(x, y);
  const kind = state.tiles[i] ?? 0;
  if (kind === TileKind.Water || kind === TileKind.Radiation || kind === TileKind.Empty || kind === TileKind.Rubble) {
    return 0;
  }
  const lot = footprintAt(state, x, y);
  const tiles: [number, number][] = [];
  if (lot) {
    for (let dy = 0; dy < lot.size; dy++) for (let dx = 0; dx < lot.size; dx++) tiles.push([lot.x + dx, lot.y + dy]);
  } else {
    tiles.push([x, y]);
  }
  for (const [tx, ty] of tiles) {
    const t = state.index(tx, ty);
    const k = state.tiles[t] ?? 0;
    // A wrecked bridge falls into the water it spanned.
    state.tiles[t] = isBridge(k) ? TileKind.Water : TileKind.Rubble;
    state.flags[t] = (state.flags[t] ?? 0) & TileFlag.FLOODED;
    state.parts[t] = 0;
    state.fireTicks[t] = 0;
    state.markDirtyAround(tx, ty);
  }
  return tiles.length;
}

/** Set a flammable tile alight for 8–16 ticks. */
export function ignite(state: CityState, rng: Rng, x: number, y: number): boolean {
  if (!state.inBounds(x, y)) return false;
  const i = state.index(x, y);
  if ((state.fireTicks[i] ?? 0) > 0 || !isFlammable(state.tiles[i] ?? 0)) return false;
  state.fireTicks[i] = 8 + rng.nextInt(9);
  state.flags[i] = (state.flags[i] ?? 0) | TileFlag.BURNING;
  state.markDirty(x, y);
  return true;
}

export function begin(state: CityState, type: DisasterType, x: number, y: number, duration: number, heading = 0): ActiveDisaster {
  const d: ActiveDisaster = { id: state.nextDisasterId++, type, x, y, age: 0, duration, heading, targetX: x, targetY: y };
  state.disasters.push(d);
  return d;
}

/** A random tile matching the test, or null after a bounded search. */
export function randomTile(state: CityState, rng: Rng, test: (i: number) => boolean): [number, number] | null {
  const candidates: number[] = [];
  for (let i = 0; i < state.size * state.size; i++) if (test(i)) candidates.push(i);
  if (candidates.length === 0) return null;
  const i = candidates[rng.nextInt(candidates.length)] ?? 0;
  return [i % state.size, Math.floor(i / state.size)];
}

/** Top-left tiles of every building of a kind. */
export function originsOf(state: CityState, kind: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < state.size * state.size; i++) if (state.tiles[i] === kind && state.parts[i] === 1) out.push(i);
  return out;
}

export function isLand(state: CityState, i: number): boolean {
  const kind = state.tiles[i] ?? 0;
  return kind !== TileKind.Water && kind !== TileKind.Radiation && !isBridge(kind);
}

export function isBuilt(kind: number): boolean {
  return isNetwork(kind) || kind >= 64;
}

export const DIRECTIONS: readonly [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
