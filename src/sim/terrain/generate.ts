import { MAX_HEIGHT, SEA_LEVEL } from '@/shared/constants';
import type { TerrainOptions } from '@/shared/protocol';
import { TileKind } from '@/shared/tiles';
import type { CityState } from '../state';
import { Simplex2D } from './noise';
import { costToSink, tracePath } from './rivers';

/** Lowest dry-land height before carving; water only appears where carved. */
const LAND_BASE = SEA_LEVEL + 1;

const MASK_COAST = 1;
const MASK_RIVER = 2;
const MASK_LAKE = 4;

export interface TerrainReport {
  riverTiles: number[];
  lakeTiles: number[];
}

/** Stretch fbm output, which clusters near 0.5, toward the full [0, 1] range. */
function stretch(n: number): number {
  return Math.min(1, Math.max(0, (n - 0.5) * 1.8 + 0.5));
}

/**
 * Fill state.heights and state.tiles from the seed and the three sliders
 * (each 0–100). Pure and deterministic: same seed + sliders → same map.
 */
export function generateTerrain(state: CityState, opts: TerrainOptions): TerrainReport {
  const { size } = state;
  const side = size + 1;
  const h = new Int16Array(side * side);
  const mask = new Uint8Array(side * side);

  // 1. Rolling land from fractal noise; hills sets the relief above the base.
  const heightNoise = new Simplex2D(state.random('terrain/height'));
  const relief = 2 + Math.round((opts.hills / 100) * (MAX_HEIGHT - LAND_BASE - 2));
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const n = stretch(heightNoise.fbm(x / 48, y / 48, 4));
      h[y * side + x] = LAND_BASE + Math.round(n * relief);
    }
  }

  // 2. Coast along one map edge, with a noisy shoreline.
  if (opts.water >= 40) carveCoast(state, h, mask, side, opts.water);

  // 3. Lakes: low blobs that become basins below the surrounding land.
  if (opts.water >= 20) carveLakes(state, h, mask, side, opts.water);

  smooth(h, side);

  // 4. Rivers run from high ground to the coast or the map edge.
  if (opts.water > 0) carveRivers(state, h, mask, side, opts.water);

  // 5. Re-smooth so river and lake banks slope instead of forming cliffs.
  smooth(h, side);

  for (let i = 0; i < h.length; i++) state.heights[i] = h[i] ?? 0;
  return classifyTiles(state, mask, opts.forest);
}

function carveCoast(state: CityState, h: Int16Array, mask: Uint8Array, side: number, water: number): void {
  const rng = state.random('terrain/coast');
  const edge = rng.nextInt(4);
  const shoreNoise = new Simplex2D(rng);
  const size = side - 1;
  const band = size * (0.12 + ((water - 40) / 60) * 0.23);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const depth = edge === 0 ? y : edge === 1 ? size - x : edge === 2 ? size - y : x;
      const along = edge === 0 || edge === 2 ? x : y;
      const shoreline = band + shoreNoise.fbm(along / 40, 0.5, 3) * size * 0.16 - size * 0.08;
      if (depth < shoreline) {
        const i = y * side + x;
        h[i] = 0;
        mask[i] = (mask[i] ?? 0) | MASK_COAST;
      }
    }
  }
}

function carveLakes(state: CityState, h: Int16Array, mask: Uint8Array, side: number, water: number): void {
  const rng = state.random('terrain/lakes');
  const shapeNoise = new Simplex2D(rng);
  const count = 1 + Math.floor((water - 20) / 30);
  const radius = 3 + water / 20;
  const margin = Math.ceil(radius) + 4;
  for (let lake = 0; lake < count; lake++) {
    const cx = margin + rng.nextInt(side - 2 * margin);
    const cy = margin + rng.nextInt(side - 2 * margin);
    const reach = Math.ceil(radius * 1.4);
    for (let y = cy - reach; y <= cy + reach; y++) {
      for (let x = cx - reach; x <= cx + reach; x++) {
        // Sample noise around a circle by angle, so the shoreline is irregular.
        const angle = Math.atan2(y - cy, x - cx);
        const wobble = 0.6 + 0.8 * shapeNoise.fbm(Math.cos(angle) * 1.3 + lake * 7, Math.sin(angle) * 1.3, 3);
        if (Math.hypot(x - cx, y - cy) <= radius * wobble) {
          const i = y * side + x;
          h[i] = Math.min(h[i] ?? 0, SEA_LEVEL);
          mask[i] = (mask[i] ?? 0) | MASK_LAKE;
        }
      }
    }
  }
}

function carveRivers(state: CityState, h: Int16Array, mask: Uint8Array, side: number, water: number): void {
  const rng = state.random('terrain/rivers');
  const count = Math.min(3, 1 + Math.floor(water / 40));
  const isSink = (i: number): boolean => {
    const x = i % side;
    const y = (i - x) / side;
    return x === 0 || y === 0 || x === side - 1 || y === side - 1 || ((mask[i] ?? 0) & MASK_COAST) !== 0;
  };
  const meander = new Simplex2D(rng);
  const extraCost = new Float32Array(side * side);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) extraCost[y * side + x] = 20 * meander.fbm(x / 18, y / 18, 3);
  }
  const dist = costToSink(h, side, isSink, extraCost);

  const margin = Math.floor(side / 8);
  const sources: [number, number][] = [];
  for (let river = 0; river < count; river++) {
    // Of a sample of interior corners, the one farthest (by cost) from any
    // sink makes the longest river; keep sources apart from each other.
    let best = -1;
    for (let attempt = 0; attempt < 40; attempt++) {
      const x = margin + rng.nextInt(side - 2 * margin);
      const y = margin + rng.nextInt(side - 2 * margin);
      const farEnough = sources.every(([sx, sy]) => Math.hypot(sx - x, sy - y) > side / 4);
      const i = y * side + x;
      if (farEnough && (dist[i] ?? 0) > 0 && (best < 0 || (dist[i] ?? 0) > (dist[best] ?? 0))) best = i;
    }
    if (best < 0) continue;
    sources.push([best % side, Math.floor(best / side)]);

    // Width in tiles is 1–3; carving w+1 corners across leaves w water tiles.
    const width = 1 + rng.nextInt(3);
    const lo = -Math.floor((width - 1) / 2);
    const hi = lo + width;
    for (const corner of tracePath(dist, side, best)) {
      const px = corner % side;
      const py = (corner - px) / side;
      for (let dy = lo; dy <= hi; dy++) {
        for (let dx = lo; dx <= hi; dx++) {
          const x = px + dx;
          const y = py + dy;
          if (x < 0 || y < 0 || x >= side || y >= side) continue;
          const i = y * side + x;
          h[i] = Math.min(h[i] ?? 0, SEA_LEVEL);
          mask[i] = (mask[i] ?? 0) | MASK_RIVER;
        }
      }
    }
  }
}

/**
 * Lower corners until no two 4-neighbour corners differ by more than 1.
 * Two chamfer passes compute min over all corners of (height + distance).
 */
function smooth(h: Int16Array, side: number): void {
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const i = y * side + x;
      let v = h[i] ?? 0;
      if (x > 0) v = Math.min(v, (h[i - 1] ?? 0) + 1);
      if (y > 0) v = Math.min(v, (h[i - side] ?? 0) + 1);
      h[i] = v;
    }
  }
  for (let y = side - 1; y >= 0; y--) {
    for (let x = side - 1; x >= 0; x--) {
      const i = y * side + x;
      let v = h[i] ?? 0;
      if (x < side - 1) v = Math.min(v, (h[i + 1] ?? 0) + 1);
      if (y < side - 1) v = Math.min(v, (h[i + side] ?? 0) + 1);
      h[i] = v;
    }
  }
}

function classifyTiles(state: CityState, mask: Uint8Array, forest: number): TerrainReport {
  const { size, heights } = state;
  const side = size + 1;
  const forestNoise = new Simplex2D(state.random('terrain/forest'));
  const threshold = 1 - forest / 100;
  const report: TerrainReport = { riverTiles: [], lakeTiles: [] };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = y * side + x;
      const corners = [c, c + 1, c + side, c + side + 1];
      const tile = state.index(x, y);
      const isWater = corners.every((i) => (heights[i] ?? 0) <= SEA_LEVEL);
      if (isWater) {
        state.tiles[tile] = TileKind.Water;
        const allMasked = (bit: number) => corners.every((i) => ((mask[i] ?? 0) & bit) !== 0);
        if (allMasked(MASK_RIVER)) report.riverTiles.push(tile);
        else if (allMasked(MASK_LAKE)) report.lakeTiles.push(tile);
      } else if (forest > 0 && stretch(forestNoise.fbm(x / 20, y / 20, 3)) > threshold) {
        state.tiles[tile] = TileKind.Tree;
      } else {
        state.tiles[tile] = TileKind.Empty;
      }
    }
  }
  state.markAllDirty();
  return report;
}
