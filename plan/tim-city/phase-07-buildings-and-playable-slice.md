# Phase 07 — Procedural Buildings and the Playable Slice

**Depends on:** 02, 04, 05, 06 · **Enables:** 10 (special buildings use the kit), 16 (agents need building positions), 17 (night windows), 18, 20

## Goal
Turn sim zones into a living 3D city. A parametric kit builds 192 low-poly building variants at load. Instanced meshes place them on zone footprints. Construction and demolition animate. The RCI demand meter and a query panel complete the first truly playable version: place power, roads and zones, then watch a city grow.

## Files touched
- `src/render/buildings/kit.ts` — parametric part generators: box mass, setbacks, gable, hip and flat roofs, parapet, rooftop units, chimneys, awnings, signage panels, window bands (as UV regions into one atlas).
- `src/render/buildings/variants.ts` — variant recipes per zone type × density 1–8 × land-value class 0–3; a seeded generator yields 2 variants per cell (3 × 8 × 4 × 2 = 192 total) and merges each into one `BufferGeometry`.
- `src/render/buildings/atlas.ts` — one 1024² canvas-generated texture: facade colors, window grids (with an emissive channel used in phase 17), roof textures.
- `src/render/buildings/instances.ts` — one `InstancedMesh` per variant; per-chunk instance bookkeeping; variant chosen by hashing the zone center tile, so a building keeps its look until its density changes. The same hash picks one of 4 rotations and a per-instance color tint from `palette.ts`, so two buildings with the same variant still look different.
- `src/render/buildings/plants.ts` — distinctive coal plant (stacks with smoke particles) and nuclear plant (cooling tower) models.
- `src/render/buildings/construction.ts` — scaffolding rise animation over 1.5 s on growth; dust puff and sink on decay or bulldoze.
- `src/render/buildings/zoneMarkers.ts` — empty zones show tinted ground (green R, blue C, yellow I) with a dashed border; an unpowered zone shows a pulsing lightning icon sprite.
- `src/ui/RciMeter.tsx` — three vertical bars from the `tick` message valves.
- `src/ui/QueryPanel.tsx` — floating panel with the query tool result.
- `src/ui/TopBar.tsx` — add total population from `tick.census`.
- `src/shared/protocol.ts` — `tick` adds `valves` and `census`.
- `src/render/buildings/variants.test.ts` — tests.
- `e2e/playable.spec.ts` — scripted starter city through the UI.

## Steps
1. Write `atlas.ts`, then `kit.ts`. Every part outputs positions, normals, UVs into the atlas, and a vertex color for tint.
2. Write `variants.ts`. Residential: houses at levels 1–3, row houses and walk-ups at 4–6, apartment towers at 7–8. Commercial: shops, then offices, then glass towers. Industrial: sheds, then factories with stacks, then large plants with tanks. Higher land-value class adds detail and height variance.
3. Write `instances.ts`. Place a building on the 3×3 footprint center at the leveled height. Rebuild only changed chunks.
4. Write `plants.ts`, `construction.ts` and `zoneMarkers.ts`.
5. Write `RciMeter.tsx` and `QueryPanel.tsx`; route query results to the panel instead of the toast; add population to the top bar.
6. Write tests.

## Build gate
```
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e
```

## Test plan
- `variants.test.ts`: generation is deterministic; every recipe cell has exactly 2 variants; each variant fits its 3×3 footprint bounds; total vertex count under 400k.
- `playable.spec.ts`: place a coal plant, power line, roads and R/C/I zones; run fast speed for 60 s; assert population > 0 in the top bar.
- Manual: play for 10 minutes. Buildings rise with scaffolding, vary in look, and the city looks like a diorama. Draw calls stay under 300 with a full 128 map.

## Commit
`feat(render): add procedural building kit, instanced city, RCI meter and query panel`

## Rollback
Revert the commit. The sim keeps growing zones headless; only the visuals and two UI widgets disappear.
