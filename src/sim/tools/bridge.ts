import type { ToolCommand } from '@/shared/protocol';
import { type Network, TileKind } from '@/shared/tiles';
import type { CityState } from '../state';
import type { PathTile } from './network';

export const MAX_BRIDGE = 16;

/**
 * Find the water tiles a line crosses. Each run of water must be on a
 * straight drag, at most 16 tiles long, and have land on both ends.
 */
export function planBridges(
  state: CityState,
  path: readonly PathTile[],
  _network: Network,
  cmd: ToolCommand,
): { water: Set<number> } | { reason: string; bad: number[] } {
  const isWater = (t: PathTile) => state.tiles[state.index(t.x, t.y)] === TileKind.Water;
  const water = path.filter(isWater).map((t) => state.index(t.x, t.y));
  if (water.length === 0) return { water: new Set() };

  const straight = cmd.x0 === cmd.x1 || cmd.y0 === cmd.y1;
  if (!straight) return { reason: 'Bridges must be straight', bad: water };

  let runStart = -1;
  for (let i = 0; i <= path.length; i++) {
    const tile = path[i];
    const wet = tile !== undefined && isWater(tile);
    if (wet && runStart < 0) runStart = i;
    if (!wet && runStart >= 0) {
      const run = path.slice(runStart, i).map((t) => state.index(t.x, t.y));
      if (runStart === 0 || i === path.length) return { reason: 'Bridges must reach land', bad: run };
      if (run.length > MAX_BRIDGE) return { reason: `Bridge too long (max ${String(MAX_BRIDGE)})`, bad: run };
      runStart = -1;
    }
  }
  return { water: new Set(water) };
}
