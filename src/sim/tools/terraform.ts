import { SEA_LEVEL } from '@/shared/constants';
import { COSTS } from '@/shared/costs';
import type { ToolCommand } from '@/shared/protocol';
import { TileKind } from '@/shared/tiles';
import type { CityState } from '../state';
import { applyHeights, type HeightEdits, reshapeable, spread, stepCount, touchedTiles } from './grade';
import { corners, fail, type ToolPlan } from './plan';

/**
 * Raise, lower or level the corners under a square brush centred on tile
 * (x0, y0). Neighbouring corners follow so no two adjacent corners ever
 * differ by more than one step. Costs $20 per corner per step moved.
 */
export function planTerraform(state: CityState, cmd: ToolCommand): ToolPlan {
  if (!state.inBounds(cmd.x0, cmd.y0)) return fail('Off the map');
  const r = (cmd.brush - 1) / 2;
  const tx0 = Math.max(0, cmd.x0 - r);
  const ty0 = Math.max(0, cmd.y0 - r);
  const tx1 = Math.min(state.size - 1, cmd.x0 + r);
  const ty1 = Math.min(state.size - 1, cmd.y0 + r);
  const brushTiles: number[] = [];
  for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) brushTiles.push(state.index(x, y));

  const side = state.size + 1;
  const levelTo = Math.round(corners(state, cmd.x0, cmd.y0).reduce((a, b) => a + b, 0) / 4);
  const seeds: [number, number][] = [];
  for (let cy = ty0; cy <= ty1 + 1; cy++) {
    for (let cx = tx0; cx <= tx1 + 1; cx++) {
      const c = cy * side + cx;
      const h = state.heights[c] ?? 0;
      seeds.push([c, cmd.tool === 'raise' ? h + 1 : cmd.tool === 'lower' ? h - 1 : levelTo]);
    }
  }
  const edits: HeightEdits = new Map();
  spread(state, edits, seeds);

  const steps = stepCount(state, edits);
  if (steps === 0) {
    const reason = cmd.tool === 'level' ? 'Already level' : cmd.tool === 'raise' ? "Can't go higher" : "Can't go lower";
    return fail(reason, brushTiles);
  }
  const touched = touchedTiles(state, edits);
  const blocked = [...touched].filter((i) => !reshapeable(state.tiles[i] ?? 0));
  if (blocked.length > 0) return fail("Can't reshape under buildings", [...touched], blocked);

  return {
    ok: true,
    cost: steps * COSTS.terraform,
    tiles: [...touched],
    bad: [],
    apply: () => {
      applyHeights(state, edits);
      // Water follows the ground: fully submerged tiles flood, raised ones drain.
      for (const i of touched) {
        const x = i % state.size;
        const y = (i - x) / state.size;
        const wet = corners(state, x, y).every((h) => h <= SEA_LEVEL);
        const kind = state.tiles[i] ?? 0;
        if (wet && kind !== TileKind.Water) state.tiles[i] = TileKind.Water;
        else if (!wet && kind === TileKind.Water) state.tiles[i] = TileKind.Empty;
      }
    },
  };
}
