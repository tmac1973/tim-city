# Phase 03 — Seeded Terrain Generation

**Depends on:** 02 · **Enables:** 04 (terrain to render), 05 (terraform tools), 20 (new-city preview)

## Goal
Generate the starting map from a seed and three sliders: water, forest and hilliness. The output fills `heights`, and marks water and tree tiles in `tiles`. It includes rivers, lakes, an optional coast and hills. Generation is pure and deterministic, so the same seed and sliders always give the same map.

## Files touched
- `src/sim/terrain/noise.ts` — seeded 2D simplex noise built on `src/sim/rng.ts`.
- `src/sim/terrain/generate.ts` — `generateTerrain(state, { seed, water, forest, hills })`, with each slider in 0–100.
- `src/sim/terrain/rivers.ts` — river carving by steepest-descent walk from high ground to the map edge or coast.
- `src/sim/terrain/slope.ts` — helpers `tileCorners(x, y)`, `maxCornerDelta(x, y)`, `isFlat(x, y)`; used by tools and zones later.
- `src/sim/terrain/generate.test.ts` — tests.
- `src/shared/protocol.ts` — `init` message gains `terrain: { water, forest, hills }`.
- `src/sim/worker.ts` — calls `generateTerrain` on `init`.

## Steps
1. Write `noise.ts`: classic 2D simplex with a permutation table shuffled by the seeded RNG fork `"terrain"`.
2. In `generate.ts`, build corner heights from 4 octaves of noise. `hills` scales amplitude: 0 gives a near-flat map (max height 2), 100 uses the full 0–15 range. Quantize to integers.
3. Smooth so adjacent corners differ by at most 1 height step. This keeps every slope buildable by roads and makes terraform rules simple.
4. Set the sea level at height 2. With `water ≥ 40`, choose one map edge (from the RNG) and lower a band along it to make a coast. Corners at or below sea level make the tile `Water`.
5. Carve 1–3 rivers (count scales with `water`) in `rivers.ts`. Each river is 1–3 tiles wide, lowers its corners to sea level, and stops at the coast or map edge.
6. Fill basins that sit below sea level and are not connected to the sea as lakes when `water ≥ 20`.
7. Place forest with a second noise field: a tile becomes `Tree` when the field value exceeds `1 - forest/100` and the tile is dry.
8. Mark all chunks dirty after generation.
9. Write tests.

## Build gate
```
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e
```

## Test plan
- Same seed and sliders produce byte-identical `heights` and `tiles` arrays.
- No adjacent corner pair differs by more than 1.
- `water = 0` gives zero water tiles; `water = 100` gives at least 25% water.
- `forest = 0` gives zero trees.
- Every river tile connects to the map edge or to sea water (flood-fill check).
- Generation of a 256×256 map finishes in under 200 ms in Node.

## Commit
`feat(sim): add seeded terrain generator with coast, rivers, lakes and forest`

## Rollback
Revert the commit. The `init` message falls back to an all-flat empty map, which the phase-02 kernel already handles.
