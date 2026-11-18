import { COSTS } from '@/shared/costs';
import { type Network, TileKind } from '@/shared/tiles';
import type { CityState } from '../state';
import { type PathTile, placeOnLand, setNetworkTile } from './network';
import { corners, fail, type ToolPlan } from './plan';

export const MAX_TUNNEL = 16;

const TUNNEL_KIND: Partial<Record<Network, number>> = { road: TileKind.RoadTunnel, rail: TileKind.RailTunnel };

/**
 * Bore a straight tunnel. The two end tiles become portals and must sit at
 * the same height. Every tile between them must have ground above the road
 * (highest corner at least one step above the portals), and the hill must
 * rise at least two steps somewhere, or it is a cutting, not a tunnel.
 */
export function planTunnel(state: CityState, path: readonly PathTile[], network: Network): ToolPlan {
  const tiles = path.map((t) => state.index(t.x, t.y));
  const first = path[0];
  const last = path[path.length - 1];
  const tunnelKind = TUNNEL_KIND[network];
  if (!first || !last || tunnelKind === undefined) return fail('No tunnel here', tiles);
  if (first.x !== last.x && first.y !== last.y) return fail('Tunnels must be straight', tiles);
  if (path.length < 3) return fail('Tunnel too short', tiles);
  const interior = path.slice(1, -1);
  if (interior.length > MAX_TUNNEL) return fail(`Tunnel too long (max ${String(MAX_TUNNEL)})`, tiles);

  const ends = [first, last];
  const endIndices = ends.map((t) => state.index(t.x, t.y));
  const level = Math.min(...corners(state, first.x, first.y));
  if (Math.min(...corners(state, last.x, last.y)) !== level) {
    return fail('Tunnel ends must be level', tiles, endIndices);
  }

  let cost = 0;
  const portals: { index: number; x: number; y: number; kind: number }[] = [];
  for (const end of ends) {
    const placed = placeOnLand(state, end, network, false);
    if ('reason' in placed) return fail(placed.reason, tiles, [state.index(end.x, end.y)]);
    // Portal heights must match exactly, so portals are never graded.
    if (placed.grade) return fail('Portal too steep', tiles, [state.index(end.x, end.y)]);
    cost += placed.cost;
    if (placed.cost > 0) portals.push({ index: state.index(end.x, end.y), x: end.x, y: end.y, kind: placed.kind });
  }

  const bad: number[] = [];
  let reason: string | undefined;
  let peak = 0;
  for (const tile of interior) {
    const index = state.index(tile.x, tile.y);
    const kind = state.tiles[index] ?? 0;
    const top = Math.max(...corners(state, tile.x, tile.y));
    peak = Math.max(peak, top);
    if (kind !== TileKind.Empty && kind !== TileKind.Tree) {
      bad.push(index);
      reason ??= 'Tile occupied';
    } else if (top < level + 1) {
      bad.push(index);
      reason ??= 'No hill to tunnel through';
    }
  }
  if (reason !== undefined) return fail(reason, tiles, bad);
  if (peak < level + 2) return fail('Hill too low for a tunnel', tiles, interior.map((t) => state.index(t.x, t.y)));
  cost += interior.length * COSTS.tunnel;

  return {
    ok: true,
    cost,
    tiles,
    bad: [],
    apply: () => {
      for (const p of portals) setNetworkTile(state, p.index, p.x, p.y, p.kind);
      for (const t of interior) setNetworkTile(state, state.index(t.x, t.y), t.x, t.y, tunnelKind);
    },
  };
}
