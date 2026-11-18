import { COSTS, networkCost } from '@/shared/costs';
import type { ToolCommand } from '@/shared/protocol';
import {
  carries,
  isBridge,
  isOpenLand,
  isPower,
  isTunnel,
  type Network,
  TileFlag,
  TileKind,
} from '@/shared/tiles';
import type { CityState } from '../state';
import { planBridges } from './bridge';
import { applyHeights, type GradeTile, planGrade } from './grade';
import { type Axis, fail, slopeOk, type ToolPlan } from './plan';
import { planTunnel } from './tunnel';

export interface PathTile {
  x: number;
  y: number;
  /** Directions the new line runs through this tile (two at a bend). */
  axes: Set<Axis>;
}

/** L-shaped path: along the longer axis first, then the other. */
export function linePath(x0: number, y0: number, x1: number, y1: number): PathTile[] {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const firstX = Math.abs(dx) >= Math.abs(dy);
  const path: PathTile[] = [];
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const bend = dx !== 0 && dy !== 0;

  if (firstX) {
    for (let i = 0; i <= Math.abs(dx); i++) path.push({ x: x0 + i * sx, y: y0, axes: new Set<Axis>(['x']) });
    for (let j = 1; j <= Math.abs(dy); j++) path.push({ x: x1, y: y0 + j * sy, axes: new Set<Axis>(['y']) });
    if (bend) path[Math.abs(dx)]?.axes.add('y');
  } else {
    for (let j = 0; j <= Math.abs(dy); j++) path.push({ x: x0, y: y0 + j * sy, axes: new Set<Axis>(['y']) });
    for (let i = 1; i <= Math.abs(dx); i++) path.push({ x: x0 + i * sx, y: y1, axes: new Set<Axis>(['x']) });
    if (bend) path[Math.abs(dy)]?.axes.add('x');
  }
  return path;
}

const BASE_KIND: Record<Network, number> = { road: TileKind.Road, rail: TileKind.Rail, power: TileKind.PowerLine };
export const BRIDGE_KIND: Record<Network, number> = {
  road: TileKind.RoadBridge,
  rail: TileKind.RailBridge,
  power: TileKind.PowerBridge,
};

const SINGLE_NETWORK: Partial<Record<number, Network>> = {
  [TileKind.Road]: 'road',
  [TileKind.Rail]: 'rail',
  [TileKind.PowerLine]: 'power',
};

function crossingKind(a: Network, b: Network): number {
  const pair = new Set([a, b]);
  if (pair.has('road') && pair.has('rail')) return TileKind.RoadRail;
  return pair.has('road') ? TileKind.RoadPower : TileKind.RailPower;
}

/** Which way an existing line runs through (x, y), judged by its neighbours. */
export function connectionAxis(state: CityState, x: number, y: number, network: Network): Axis | 'both' | 'none' {
  const has = (nx: number, ny: number) => state.inBounds(nx, ny) && carries(state.tiles[state.index(nx, ny)] ?? 0, network);
  const alongX = has(x - 1, y) || has(x + 1, y);
  const alongY = has(x, y - 1) || has(x, y + 1);
  return alongX && alongY ? 'both' : alongX ? 'x' : alongY ? 'y' : 'none';
}

/** `grade` lists the directions a tile must be levelled across before building. */
type Placement = { kind: number; cost: number; grade?: Set<Axis> } | { reason: string };

/** What a land tile becomes when `network` is laid through it. */
export function placeOnLand(state: CityState, tile: PathTile, network: Network, single: boolean): Placement {
  const { x, y, axes } = tile;
  const kind = state.tiles[state.index(x, y)] ?? 0;
  if (carries(kind, network)) return { kind, cost: 0 };

  if (isOpenLand(kind)) {
    const clearing = kind === TileKind.Empty ? 0 : COSTS.bulldoze;
    const placed = { kind: BASE_KIND[network], cost: networkCost(network) + clearing };
    if (network === 'power') return placed;
    // A lone tile only needs to be level across one of the two directions.
    const ok = single
      ? slopeOk(state, x, y, new Set<Axis>(['x'])) || slopeOk(state, x, y, new Set<Axis>(['y']))
      : slopeOk(state, x, y, axes);
    return ok ? placed : { ...placed, grade: single ? new Set<Axis>(['x']) : axes };
  }

  const existing = SINGLE_NETWORK[kind];
  if (!existing || isBridge(kind) || isTunnel(kind)) return { reason: 'Tile occupied' };
  if (axes.size !== 1) return { reason: "Can't cross on a bend" };
  const along = axes.has('x') ? 'x' : 'y';
  const existingAxis = connectionAxis(state, x, y, existing);
  if (existingAxis === 'both') return { reason: "Can't cross a junction" };
  if (existingAxis === along) return { reason: "Can't run along another line" };
  if (existing !== 'power' && network !== 'power' && !slopeOk(state, x, y, new Set<Axis>(['x', 'y']))) {
    return { reason: 'Crossings must be flat' };
  }
  return { kind: crossingKind(existing, network), cost: networkCost(network) };
}

/** Plan a road, rail or power line drag. */
export function planNetwork(state: CityState, cmd: ToolCommand, network: Network): ToolPlan {
  const path = linePath(cmd.x0, cmd.y0, cmd.x1, cmd.y1);
  const tiles = path.map((t) => state.index(t.x, t.y));
  if (path.some((t) => !state.inBounds(t.x, t.y))) return fail('Off the map', tiles);

  if (cmd.tunnel && network !== 'power' && path.length > 1) return planTunnel(state, path, network);

  const bridges = planBridges(state, path, network, cmd);
  if ('reason' in bridges) return fail(bridges.reason, tiles, bridges.bad);

  const changes: { index: number; x: number; y: number; kind: number }[] = [];
  const grading: GradeTile[] = [];
  const bad: number[] = [];
  let cost = 0;
  let reason: string | undefined;
  for (const tile of path) {
    const index = state.index(tile.x, tile.y);
    if (bridges.water.has(index)) {
      changes.push({ index, x: tile.x, y: tile.y, kind: BRIDGE_KIND[network] });
      cost += COSTS.bridge;
      continue;
    }
    const placed = placeOnLand(state, tile, network, path.length === 1);
    if ('reason' in placed) {
      bad.push(index);
      reason ??= placed.reason;
      continue;
    }
    if (placed.cost > 0) {
      changes.push({ index, x: tile.x, y: tile.y, kind: placed.kind });
      cost += placed.cost;
    }
    if (placed.grade) grading.push({ x: tile.x, y: tile.y, axes: placed.grade });
  }
  if (reason !== undefined) return fail(reason, tiles, bad);
  if (changes.length === 0) return fail('Already built', tiles);

  // Sloping tiles are levelled across the line, at the terraform price.
  const grade = grading.length > 0 ? planGrade(state, grading, new Set(changes.map((c) => c.index))) : null;
  if (grade && 'reason' in grade) return fail(grade.reason, tiles, grade.bad);
  if (grade) cost += grade.steps * COSTS.terraform;

  return {
    ok: true,
    cost,
    tiles,
    bad: [],
    apply: () => {
      if (grade) applyHeights(state, grade.edits);
      for (const c of changes) setNetworkTile(state, c.index, c.x, c.y, c.kind);
    },
  };
}

export function setNetworkTile(state: CityState, index: number, x: number, y: number, kind: number): void {
  state.tiles[index] = kind;
  const flags = state.flags[index] ?? 0;
  state.flags[index] = isPower(kind) ? flags | TileFlag.CONDUCTIVE : flags & ~TileFlag.CONDUCTIVE;
  state.markDirtyAround(x, y);
}
