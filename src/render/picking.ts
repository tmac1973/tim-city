import { HEIGHT_UNIT, splitsNwSe } from './units';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface PickResult {
  /** Tile hit. */
  x: number;
  y: number;
  /** Nearest tile corner to the hit point. */
  cornerX: number;
  cornerY: number;
  /** World-space hit point. */
  point: Vec3;
}

const EPS = 1e-9;

/** Möller–Trumbore ray/triangle test; returns ray t or -1. */
function hitTriangle(o: Vec3, d: Vec3, a: Vec3, b: Vec3, c: Vec3): number {
  const e1x = b.x - a.x, e1y = b.y - a.y, e1z = b.z - a.z;
  const e2x = c.x - a.x, e2y = c.y - a.y, e2z = c.z - a.z;
  const px = d.y * e2z - d.z * e2y;
  const py = d.z * e2x - d.x * e2z;
  const pz = d.x * e2y - d.y * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < EPS) return -1;
  const inv = 1 / det;
  const tx = o.x - a.x, ty = o.y - a.y, tz = o.z - a.z;
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < -1e-7 || u > 1 + 1e-7) return -1;
  const qx = ty * e1z - tz * e1y;
  const qy = tz * e1x - tx * e1z;
  const qz = tx * e1y - ty * e1x;
  const v = (d.x * qx + d.y * qy + d.z * qz) * inv;
  if (v < -1e-7 || u + v > 1 + 1e-7) return -1;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t >= 0 ? t : -1;
}

/**
 * Find the terrain tile a ray hits. Walks the grid along the ray (DDA) and
 * tests each tile's two triangles, split exactly as the terrain mesh is, so
 * the result matches what the player sees. `corner(x, y)` is a height step.
 */
export function pickTile(
  corner: (x: number, y: number) => number,
  size: number,
  origin: Vec3,
  dir: Vec3,
): PickResult | null {
  // Clip the ray to the map's footprint in XZ.
  let tMin = 0;
  let tMax = Infinity;
  for (const [o, d] of [[origin.x, dir.x], [origin.z, dir.z]] as const) {
    if (Math.abs(d) < EPS) {
      if (o < 0 || o > size) return null;
      continue;
    }
    const t1 = (0 - o) / d;
    const t2 = (size - o) / d;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
  }
  if (tMin > tMax) return null;

  const startX = origin.x + dir.x * tMin;
  const startZ = origin.z + dir.z * tMin;
  let ix = Math.min(size - 1, Math.max(0, Math.floor(startX)));
  let iz = Math.min(size - 1, Math.max(0, Math.floor(startZ)));
  const stepX = Math.sign(dir.x);
  const stepZ = Math.sign(dir.z);
  const deltaX = stepX === 0 ? Infinity : Math.abs(1 / dir.x);
  const deltaZ = stepZ === 0 ? Infinity : Math.abs(1 / dir.z);
  let nextX = stepX > 0 ? (ix + 1 - origin.x) / dir.x : stepX < 0 ? (ix - origin.x) / dir.x : Infinity;
  let nextZ = stepZ > 0 ? (iz + 1 - origin.z) / dir.z : stepZ < 0 ? (iz - origin.z) / dir.z : Infinity;

  const v = (x: number, y: number): Vec3 => ({ x, y: corner(x, y) * HEIGHT_UNIT, z: y });

  for (let steps = 0; steps < 4 * size + 4; steps++) {
    if (ix < 0 || iz < 0 || ix >= size || iz >= size) return null;

    const nw = v(ix, iz);
    const ne = v(ix + 1, iz);
    const se = v(ix + 1, iz + 1);
    const sw = v(ix, iz + 1);
    const tris = splitsNwSe(nw.y, ne.y, se.y, sw.y)
      ? [[nw, sw, se], [nw, se, ne]]
      : [[nw, sw, ne], [ne, sw, se]];
    let best = -1;
    for (const [a, b, c] of tris as [Vec3, Vec3, Vec3][]) {
      const t = hitTriangle(origin, dir, a, b, c);
      if (t >= 0 && (best < 0 || t < best)) best = t;
    }
    if (best >= 0) {
      const point = { x: origin.x + dir.x * best, y: origin.y + dir.y * best, z: origin.z + dir.z * best };
      return {
        x: ix,
        y: iz,
        cornerX: Math.min(size, Math.max(0, Math.round(point.x))),
        cornerY: Math.min(size, Math.max(0, Math.round(point.z))),
        point,
      };
    }

    if (Math.min(nextX, nextZ) > tMax + 1e-6) return null;
    if (nextX < nextZ) {
      ix += stepX;
      nextX += deltaX;
    } else {
      iz += stepZ;
      nextZ += deltaZ;
    }
  }
  return null;
}
