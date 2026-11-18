import type { ToolCommand } from '@/shared/protocol';
import { ZONE_SIZE, type ZoneType } from '@/shared/tiles';
import type { CityState } from '../state';
import { linePath, planNetwork } from './network';
import { planZones } from './place';
import { type Axis, fail, type ToolPlan } from './plan';

/**
 * The block a drag from (x0, y0) to (x1, y1) lays: the far corner moves so
 * the land inside the ring is a whole number of 3×3 lots each way (at least
 * one).
 */
export function blockRect(x0: number, y0: number, x1: number, y1: number): { x0: number; y0: number; x1: number; y1: number } {
  const fit = (a: number, b: number) => {
    const inside = Math.max(ZONE_SIZE, Math.round((Math.abs(b - a) - 1) / ZONE_SIZE) * ZONE_SIZE);
    return a + (b >= a ? 1 : -1) * (inside + 1);
  };
  return { x0, y0, x1: fit(x0, x1), y1: fit(y0, y1) };
}

/** A closed ring of road tiles around the rectangle, in order, corners turning both ways. */
function ringPath(x0: number, y0: number, x1: number, y1: number) {
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);
  const path = [
    ...linePath(left, top, right, bottom),
    ...linePath(right, bottom, left, top).slice(1, -1),
  ];
  for (const t of path) {
    const corner = (t.x === left || t.x === right) && (t.y === top || t.y === bottom);
    if (corner) t.axes = new Set<Axis>(['x', 'y']);
  }
  return path;
}

/**
 * Block tool: a ring of road sized to whole lots, and optionally zones of
 * one type (at the chosen density) filling the inside.
 */
export function planBlock(state: CityState, cmd: ToolCommand): ToolPlan {
  if (cmd.x0 === cmd.x1 && cmd.y0 === cmd.y1) return fail('Drag out a rectangle');
  const r = blockRect(cmd.x0, cmd.y0, cmd.x1, cmd.y1);
  if (!state.inBounds(r.x1, r.y1)) return fail('Too close to the edge');
  const ring = planNetwork(state, { ...cmd, ...r, tunnel: false }, 'road', ringPath(r.x0, r.y0, r.x1, r.y1));
  if (!ring.ok && ring.reason !== 'Already built') return ring;
  if (cmd.fill === undefined) return ring;

  const left = Math.min(r.x0, r.x1);
  const right = Math.max(r.x0, r.x1);
  const top = Math.min(r.y0, r.y1);
  const bottom = Math.max(r.y0, r.y1);
  // Lot centres run from one tile in from the ring's inside edge to one tile in from the other.
  const zones = planZones(state, { ...cmd, x0: left + 2, y0: top + 2, x1: right - 2, y1: bottom - 2 }, cmd.fill as ZoneType);
  if (!ring.ok && !zones.ok) return zones;
  const parts = [ring, zones].filter((p) => p.ok);
  return {
    ok: true,
    cost: parts.reduce((sum, p) => sum + p.cost, 0),
    tiles: [...ring.tiles, ...zones.tiles],
    bad: zones.bad,
    apply: () => {
      for (const p of parts) p.apply();
    },
  };
}
