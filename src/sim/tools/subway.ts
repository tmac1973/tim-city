import { COSTS } from '@/shared/costs';
import type { ToolCommand } from '@/shared/protocol';
import { TileKind } from '@/shared/tiles';
import type { CityState } from '../state';
import { stopEntry } from '../systems/transit';
import { linePath } from './network';
import { planBuilding } from './place';
import { fail, type ToolPlan } from './plan';

const onEdge = (state: CityState, x: number, y: number) => x === 0 || y === 0 || x === state.size - 1 || y === state.size - 1;

function layTrack(state: CityState, tiles: readonly number[]): void {
  for (const i of tiles) {
    state.subway[i] = 1;
    state.markDirty(i % state.size, Math.floor(i / state.size));
  }
}

/**
 * Subway track: an L-shaped drag like a road, underground, so it passes
 * under anything on the surface. Only new track is charged. It can't reach
 * the map edge.
 */
export function planSubway(state: CityState, cmd: ToolCommand): ToolPlan {
  const path = linePath(cmd.x0, cmd.y0, cmd.x1, cmd.y1);
  const tiles = path.filter((t) => state.inBounds(t.x, t.y)).map((t) => state.index(t.x, t.y));
  const edge = path.filter((t) => !state.inBounds(t.x, t.y) || onEdge(state, t.x, t.y)).map((t) => state.index(t.x, t.y));
  if (edge.length > 0) return fail('Too close to the edge', tiles, edge);
  const fresh = tiles.filter((i) => state.subway[i] !== 1);
  if (fresh.length === 0) return fail('Already built', tiles);
  return {
    ok: true,
    cost: fresh.length * COSTS.subway,
    tiles,
    bad: [],
    apply: () => {
      layTrack(state, fresh);
    },
  };
}

/** A station: an open tile beside a road; track is laid under it if there is none. */
export function planSubwayStation(state: CityState, cmd: ToolCommand): ToolPlan {
  if (!state.inBounds(cmd.x1, cmd.y1)) return fail('Off the map');
  const i = state.index(cmd.x1, cmd.y1);
  if (onEdge(state, cmd.x1, cmd.y1)) return fail('Too close to the edge', [i], [i]);
  if (stopEntry(state.size, state.tiles, i) < 0) return fail('Must be beside a road', [i], [i]);
  const building = planBuilding(state, cmd, TileKind.SubwayStation, 1, COSTS.subwayStation);
  if (!building.ok) return building;
  const needsTrack = state.subway[i] !== 1;
  return {
    ...building,
    cost: building.cost + (needsTrack ? COSTS.subway : 0),
    apply: () => {
      building.apply();
      if (needsTrack) layTrack(state, [i]);
    },
  };
}

/** Bulldoze in the underground view: lift the track in the box, leaving the surface alone. */
export function planLiftTrack(state: CityState, cmd: ToolCommand): ToolPlan {
  const tiles: number[] = [];
  for (let y = Math.max(0, Math.min(cmd.y0, cmd.y1)); y <= Math.min(state.size - 1, Math.max(cmd.y0, cmd.y1)); y++) {
    for (let x = Math.max(0, Math.min(cmd.x0, cmd.x1)); x <= Math.min(state.size - 1, Math.max(cmd.x0, cmd.x1)); x++) {
      tiles.push(state.index(x, y));
    }
  }
  const track = tiles.filter((i) => state.subway[i] === 1);
  if (track.length === 0) return fail('No track here', tiles);
  return {
    ok: true,
    cost: track.length * COSTS.bulldoze,
    tiles,
    bad: [],
    apply: () => {
      for (const i of track) {
        state.subway[i] = 0;
        state.markDirty(i % state.size, Math.floor(i / state.size));
      }
    },
  };
}
