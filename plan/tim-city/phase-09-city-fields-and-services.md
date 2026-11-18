# Phase 09 — City Fields and Public Services

**Depends on:** 02, 05, 06, 07, 08 · **Enables:** 10, 11 (service funding), 12 (problems), 13 (overlays), 15 (fire coverage fights fires)

## Goal
Add the spatial fields that make the classic city react to the player: land value, pollution, crime, population density and growth rate. Add police stations, fire stations and parks, whose coverage scales with a funding level. Feed these fields back into zone growth.

## Files touched
- `src/shared/tiles.ts` — police station (3×3), fire station (3×3), park (1×1), large park with pond (3×3), all registered in `FOOTPRINTS`; a new flag bit `POTHOLED` for damaged road tiles.
- `src/sim/graph.ts` — edge cost doubles on `POTHOLED` road tiles.
- `src/shared/costs.ts` — police $500, fire $500, park $10, large park $150.
- `src/sim/state.ts` — `blockFields.landValue`, `pollution`, `crime`, `popDensity`, `growth` (all 2×2 blocks, 0–255); `blockFields.policeCover`, `fireCover` (2×2 blocks, 0–255); `funding = { road: 100, police: 100, fire: 100 }` (percent).
- `src/sim/systems/pollution.ts` — sources per block: I zones `20 × density level`, coal plant 255, `traffic / 2` (phase 10 adds airport and seaport); then subtract 30 per park and 5 per tree tile in the block; then one 3×3 box blur per month.
- `src/sim/systems/landValue.ts` — `clamp(128 − 1.5 × distToCenter + 30 (water within 3 tiles) + min(40, 5 × trees within 2 tiles) + 40 (park within 4 tiles) + 3 × height − pollution/2 − crime/2, 0, 255)`; the city center is the population-weighted centroid.
- `src/sim/systems/crime.ts` — `clamp(popDensity/2 + (255 − landValue)/4 − policeCover/2, 0, 255)`.
- `src/sim/systems/coverage.ts` — police and fire coverage: each station radiates `255 × funding/100` at its center with linear falloff to 0 at 20 tiles; values add and clamp to 255; unpowered or no-road stations count at 50%.
- `src/sim/systems/popDensity.ts` — residents per block, then one 3×3 box-blur pass.
- `src/sim/systems/growthRate.ts` — per-block change in population since last month (for the growth overlay).
- `src/sim/systems/roads.ts` — road maintenance: when `funding.road < 100`, each month a share of road tiles (`(100 − funding) / 400`) gain the `POTHOLED` flag; a potholed tile that is picked again becomes rubble.
- `src/sim/systems/zones.ts` — `localBonus` now `landValue/4 − pollution/4 − crime/4 − traffic/8`; R zones subtract a further 100 when any I zone lies within 4 tiles of their footprint.
- `src/render/buildings/variants.ts` — station and park recipes.
- `src/ui/Toolbar.tsx` — services group with shortcuts: police `O`, fire `F`, park `K`, large park `Shift+K`.
- `src/render/networks.ts` — potholed road tiles get a cracked-asphalt variant.
- `src/sim/tools/query.ts` — add all field values.
- `src/sim/systems/fields.test.ts` — tests.

## Steps
1. Extend tiles, costs, and the toolbar. Add station and park recipes to the building kit.
2. Write the field systems. Schedule each on its own ticks of the month so no single tick runs them all: pollution tick 2, land value tick 4, crime tick 6, coverage tick 8, density tick 10, growth tick 12, roads tick 14.
3. Store `funding` on state with defaults of 100%. Phase 11 adds the UI that edits it.
4. Update `zones.ts` with the full `localBonus`.
5. Extend `query.ts`.
6. Write tests.

## Implementation notes (changed during build)
- **No crime where nobody lives**: blocks with zero population density get crime 0, so the crime field reflects neighbourhoods rather than empty fields.
- **Land value drives building style**: when a zone changes density it takes the land-value class (land value ÷ 64, 0–3) of its block, so better areas get the nicer phase 07 variants.
- **The road tool repairs potholes** at the normal road price; re-laying any network tile clears the flag.
- Small parks are painted by dragging a box (each open tile gets one); stations and large parks place like plants.
- The toolbar became three columns and the RCI meter moved beside the speed controls so the HUD fits a 720 px window with room for phase 10's tools.

## Build gate
```
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e
```

## Test plan
- `fields.test.ts`: a coal plant raises pollution nearby and lowers land value; a police station lowers crime within its radius; funding at 50% halves coverage; a park raises land value; underfunded roads degrade over 2 years.
- Growth test: identical cities with and without a nearby industrial block show slower R growth near industry.
- Determinism test passes.
- Manual: query tiles near a factory and near a park; values differ as expected.

## Commit
`feat(sim): add land value, pollution, crime, density fields and police/fire/park services`

## Rollback
Revert the commit. Zone growth returns to phase-08 scoring. No saved data exists yet.
