import { type BufferGeometry, Color } from 'three';
import { FLOOR, Kit } from './buildings/kit';

/** Beyond this distance from the camera, buildings draw their simple model. */
export const BUILDING_LOD_DISTANCE = 120;
/** Beyond this distance, vehicles and people are not drawn at all. */
export const AGENT_CULL_DISTANCE = 150;


/**
 * A far-away stand-in for a building: its bounding box in the model's
 * average wall and roof colours, with one band of glass per floor so
 * windows still light up the skyline at night. A few dozen triangles
 * instead of hundreds or thousands.
 */
export function lodModel(geometry: BufferGeometry): BufferGeometry {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const pos = geometry.getAttribute('position');
  const col = geometry.getAttribute('color');
  const normal = geometry.getAttribute('normal');
  const glow = geometry.getAttribute('glow');
  const wall = new Color(0, 0, 0);
  const roof = new Color(0, 0, 0);
  let walls = 0;
  let roofs = 0;
  let commercial = false;
  for (let i = 0; i < pos.count; i++) {
    const g = glow.getX(i);
    if (g >= 1) commercial = true;
    if (g > 0) continue;
    const c = new Color(col.getX(i), col.getY(i), col.getZ(i));
    if (normal.getY(i) > 0.7) {
      roof.add(c);
      roofs++;
    } else {
      wall.add(c);
      walls++;
    }
  }
  if (walls > 0) wall.multiplyScalar(1 / walls);
  if (roofs > 0) roof.multiplyScalar(1 / roofs);
  const k = new Kit();
  if (!box) return k.build();
  const { min, max } = box;
  // Slightly inset so the box sits inside the lot like the real model.
  const w = (max.x - min.x) * 0.92;
  const d = (max.z - min.z) * 0.92;
  const cx = (max.x + min.x) / 2;
  const cz = (max.z + min.z) / 2;
  const h = max.y;
  k.block(cx, cz, w, d, 0, h, walls ? wall : 0x999999, roofs ? roof : 0x777777);
  const floors = Math.floor((h - 0.05) / FLOOR);
  if (floors >= 1) k.windows(cx, cz, w, d, 0, floors, commercial ? 'band' : 'strip');
  return k.build();
}
