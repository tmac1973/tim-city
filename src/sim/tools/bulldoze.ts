import { COSTS } from '@/shared/costs';
import type { ToolCommand } from '@/shared/protocol';
import { isBridge, isNetwork, TileKind } from '@/shared/tiles';
import type { CityState } from '../state';
import { clearPart, footprintAt } from './footprint';
import { fail, type ToolPlan } from './plan';

/** Clear everything in the dragged rectangle. Buildings go to rubble. */
export function planBulldoze(state: CityState, cmd: ToolCommand): ToolPlan {
  const x0 = Math.max(0, Math.min(cmd.x0, cmd.x1));
  const x1 = Math.min(state.size - 1, Math.max(cmd.x0, cmd.x1));
  const y0 = Math.max(0, Math.min(cmd.y0, cmd.y1));
  const y1 = Math.min(state.size - 1, Math.max(cmd.y0, cmd.y1));

  const result = new Map<number, number>();
  const tiles: number[] = [];
  let cost = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const index = state.index(x, y);
      tiles.push(index);
      if (result.has(index)) continue;

      const footprint = footprintAt(state, x, y);
      if (footprint) {
        for (let dy = 0; dy < footprint.size; dy++) {
          for (let dx = 0; dx < footprint.size; dx++) {
            result.set(state.index(footprint.x + dx, footprint.y + dy), TileKind.Rubble);
            cost += COSTS.bulldozeBuilding;
          }
        }
        continue;
      }

      const kind = state.tiles[index] ?? 0;
      // Radioactive ground can't be cleared, only waited out.
      if (kind === TileKind.Empty || kind === TileKind.Water || kind === TileKind.Radiation) continue;
      if (isNetwork(kind)) {
        result.set(index, isBridge(kind) ? TileKind.Water : TileKind.Empty);
        cost += COSTS.bulldoze;
      } else if (kind === TileKind.Tree || kind === TileKind.Rubble) {
        result.set(index, TileKind.Empty);
        cost += COSTS.bulldoze;
      } else {
        result.set(index, TileKind.Rubble);
        cost += COSTS.bulldozeBuilding;
      }
    }
  }
  if (result.size === 0) return fail('Nothing to bulldoze', tiles);

  return {
    ok: true,
    cost,
    tiles: [...new Set([...tiles, ...result.keys()])],
    bad: [],
    apply: () => {
      for (const [index, kind] of result) {
        state.tiles[index] = kind;
        state.flags[index] = 0;
        clearPart(state, index);
        state.markDirtyAround(index % state.size, Math.floor(index / state.size));
      }
    },
  };
}
