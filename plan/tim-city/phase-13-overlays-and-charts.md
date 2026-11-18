# Phase 13 — Data Overlays, Minimap and Charts

**Depends on:** 02, 04, 05, 06, 07, 08, 09, 12 · **Enables:** 20 (onboarding points at overlays), 21 (performance tuning of overlay rendering)

## Goal
Make every hidden number visible. The player toggles 3D heatmap overlays for power, traffic, pollution, crime, land value, population density, police coverage, fire coverage and growth. A minimap shows the same overlays. A graphs window plots history. Overlay values come straight from the sim block fields, so what the player sees is what the sim uses.

## Files touched
- `src/shared/protocol.ts` — `tick` carries changed block-field chunks when an overlay is active (requested via a `subscribeField` command), so inactive fields cost no bandwidth.
- `src/shared/protocol.ts` — `requestHistory` command and `history` reply with the phase-12 ring buffers.
- `src/sim/worker.ts` — handles `subscribeField` and `requestHistory`.
- `src/render/buildings/instances.ts` — `setOverlayFade(on)` sets building material opacity to 30%.
- `src/render/overlays.ts` — per-overlay `DataTexture` (size/2 × size/2, R8) sampled by a terrain material overlay pass; mode "heat": color ramp from `palette.ts`; mode "columns": instanced translucent columns per 2×2 block with height ∝ value, for pollution, crime, land value and density. Buildings fade to 30% opacity while an overlay is on. Power overlay tints powered tiles yellow and unpowered zones red.
- `src/render/terrain.ts` — terrain material gets an overlay sampler uniform and blend factor.
- `src/ui/OverlayBar.tsx` — overlay toggle buttons with legend and keyboard shortcuts `F1`–`F9`.
- `src/ui/Minimap.tsx` — 2D canvas minimap (1 px per tile), tile colors from `palette.ts`, current overlay blended on top, camera frustum outline; click to move the camera.
- `src/ui/GraphsWindow.tsx` — hand-rolled SVG line charts: series toggles, 10-year monthly and 120-year yearly ranges, hover readout.
- `src/ui/charts/LineChart.tsx` — reusable SVG chart component.
- `src/render/overlays.test.ts` — tests.

## Steps
1. Add `subscribeField` and `requestHistory` to the protocol and worker. The graphs window requests history when it opens and once per game month while open.
2. Write `overlays.ts` and extend the terrain material.
3. Write `OverlayBar.tsx`, `Minimap.tsx`, `LineChart.tsx` and `GraphsWindow.tsx`.
4. Write tests.

## Build gate
```
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e
```

## Test plan
- `overlays.test.ts`: the texture uploaded for a field equals the sim's `blockFields` array byte for byte (checks the success criterion "overlay shows the values the sim uses").
- Column instance count equals the number of non-zero blocks.
- `e2e/overlays.spec.ts`: toggle each overlay; no console errors; no single frame takes longer than 100 ms in CI headless Chromium (a smoke check only; real frame-rate gates are in phase 21).
- Manual: the pollution overlay peaks at the coal plant; the graphs window shows population rising.

## Commit
`feat: add 3D data overlays, minimap and history graphs`

## Rollback
Revert the commit. The terrain material returns to phase-04 shading; the sim stops sending field chunks.
