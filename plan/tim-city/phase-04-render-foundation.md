# Phase 04 — 3D Render Foundation

**Depends on:** 02, 03 · **Enables:** 05 (tools need picking and network meshes), 07 (buildings), every visual phase after it

## Goal
Render the generated terrain as a stylized low-poly diorama. This phase delivers chunked terrain meshes, water, instanced trees, the free orbit camera, tile picking under the cursor, base lighting with shadows, and the tilt-shift post effect. It establishes the render architecture every later visual phase extends: a client-side mirror of sim arrays, rebuilt per dirty chunk.

## Files touched
- `src/render/renderer.ts` — owns `WebGLRenderer`, `Scene`, `EffectComposer` (from `postprocessing`), and the frame loop.
- `src/render/mirror.ts` — `CityMirror`: client copy of `tiles`, `flags`, `heights`; applies `tick` chunk slices and emits `chunkChanged(id)`.
- `src/render/palette.ts` — the art palette: one place for all terrain, water, foliage, zone and UI accent colors.
- `src/render/terrain.ts` — one `BufferGeometry` per 32×32 chunk; flat-shaded triangles with vertex colors by height band (sand, grass, rock); skirt geometry on the map edge so the map reads as a diorama slab.
- `src/render/water.ts` — one plane per chunk at sea level, with a custom `ShaderMaterial`: depth-based color, animated normal ripples, soft shoreline foam.
- `src/render/trees.ts` — 3 low-poly tree variants; one `InstancedMesh` per variant; instances from `Tree` tiles with seeded jitter.
- `src/render/camera.ts` — `CityCamera`: target point plus distance, yaw and pitch. WASD/arrow pan, right-drag rotate, middle-drag tilt, wheel zoom, smooth damping, clamped to map bounds and 20–80° pitch.
- `src/render/picking.ts` — ray against the terrain height field (analytic per tile, no mesh raycast); returns tile `x, y` and corner.
- `src/render/lighting.ts` — hemisphere light plus one directional sun with a 2048 shadow map fitted to the camera view each frame.
- `src/render/post.ts` — `TiltShiftEffect` (strength tied to zoom), `SMAAEffect`, and a mild `VignetteEffect`.
- `src/render/cursor.ts` — hovered-tile outline drawn as a line loop on the terrain.
- `src/main.ts` — wires bridge → mirror → renderer.
- `src/render/picking.test.ts` — unit tests on the analytic picking math.
- `e2e/render.spec.ts` — loads the page with `?seed=e2e`, waits for the first frame, asserts no WebGL errors.

## Steps
1. Write `palette.ts`. All later visual phases take colors from it, which keeps the look consistent.
2. Write `mirror.ts` and connect it to the bridge `tick` event.
3. Write `terrain.ts`. Each tile is two triangles split along the diagonal that best matches its corner heights. Height unit is 0.5 world units; tile size is 1 world unit. Rebuild only chunks named in `chunkChanged`.
4. Write `water.ts` with the shader and per-chunk planes. Skip chunks with no water tiles.
5. Write `trees.ts`. Recompute instance matrices for changed chunks only, using a per-chunk instance range.
6. Write `camera.ts` and `picking.ts`. Picking steps the ray across tiles (DDA over the grid) and tests each tile's two triangles.
7. Write `lighting.ts` and `post.ts`. Tilt-shift focus follows the camera target.
8. Write `cursor.ts` to show the hovered tile.
9. Write tests.

## Build gate
```
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e
```

## Test plan
- `picking.test.ts`: rays at known angles hit the expected tiles on flat and sloped test height fields.
- `render.spec.ts` passes in all three browsers.
- Manual: open `pnpm dev`. The map shows hills, coast, rivers and forest. Pan, rotate, tilt and zoom are smooth. The hover outline follows the cursor on slopes. Tilt-shift blurs the near and far edges. Frame rate stays at 60 fps on a 256 map (`?size=256`) on the reference laptop.

## Commit
`feat(render): add chunked diorama terrain, water, trees, orbit camera, picking and tilt-shift`

## Rollback
Revert the commit. `src/main.ts` falls back to the phase-01 canvas; the sim keeps running headless.
