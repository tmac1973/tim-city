# Phase 06 — Power Grid, Zones and Growth Simulation

**Depends on:** 02, 03, 05 · **Enables:** 07 (buildings to render), 08 (trip sources), 09 (fields read zone data), 10, 11, 12

## Goal
Add the heart of the classic simulation. The player places coal and nuclear power plants and R, C and I zones. Power flows through the grid. Zones grow and decay based on power, road access and RCI demand. The census counts population and jobs. This phase runs headless; phase 07 renders the result.

## Files touched
- `src/shared/tiles.ts` — add coal plant (4×4), nuclear plant (4×4), and zone kinds: for each of R, C, I, an empty-zone kind and density levels 1–8 on the 3×3 block center, with a land-value class 0–3 for variant choice. Register zones (3×3) and plants (4×4) in `FOOTPRINTS` so the bulldozer clears them whole.
- `src/shared/costs.ts` — coal plant $3,000, nuclear plant $5,000, each zone $100.
- `src/sim/tools/place.ts` — footprint placement for zones (3×3) and plants (4×4); terrain must have `maxCornerDelta ≤ 1` across the footprint; the tool levels the footprint automatically and charges terraform cost for it.
- `src/sim/systems/power.ts` — monthly flood fill from each plant through `CONDUCTIVE` tiles (power lines, zones, plants, buildings; not plain roads). Coal plant supplies 700 units, nuclear 2,000; each zone consumes 1 unit per density level, minimum 1 for an empty zone. When demand exceeds supply, the fill stops at capacity, leaving the farthest zones unpowered.
- `src/sim/systems/zones.ts` — per-zone evaluation on its scheduled ticks; growth and decay of density using the score below.
- `src/sim/systems/demand.ts` — RCI valves, run once per month.
- `src/sim/systems/census.ts` — `resPop`, `comJobs`, `indJobs`, total population, counts of each zone type and plant; stored on `CityState.census`.
- `src/sim/tools/query.ts` — query command returns tile info: kind, density, powered, and (after later phases) land value, pollution, crime, traffic.
- `src/ui/Toolbar.tsx` — add tools and shortcuts: residential `Z`, commercial `X`, industrial `C`, coal plant `G`, nuclear plant `N`, query `Q`. The query result shows as a toast until phase 07 adds the panel.
- `src/sim/systems/*.test.ts` — tests.

## Steps
1. Extend tiles and costs. Write `place.ts` and register zone and plant tools in `src/sim/tools/index.ts`. Add the toolbar buttons.
2. Write `power.ts`. BFS from each plant over a 4-neighbor graph of conductive tiles; mark `POWERED`; account capacity. Emit `brownout` when any zone is unpowered.
3. Write `demand.ts` with classic-style valves:
   - Employment ratio `E = (comJobs + indJobs) / max(1, resPop)`.
   - `resTarget = (E − 1) × 1500`.
   - `comTarget = (resPop / (3 × max(1, comJobs)) − 1) × 1500` (people need shops).
   - `indTarget = ((resPop + 2000) / (2 × max(1, indJobs)) − 1) × 1500` (the 2,000 is base export demand).
   - Tax rate (default 7%, editable from phase 11) subtracts `(tax - 7) * 30` from each valve.
   - Targets clamp to −2,000…+2,000. Each valve moves 10% of the way toward its target each month.
4. Write `zones.ts`. For each zone center: if unpowered, decay one level with 10% chance per month. If no road within 3 tiles of the footprint edge, do not grow. Otherwise compute `score = valve + localBonus`, where `localBonus` is 0 now and gains land value, pollution, crime and traffic terms in phases 08 and 09. With `threshold(level) = 100 + 150 × level`, grow one level when `score > threshold(level)` and an RNG roll under 30% passes; shrink one level when `score < −threshold(level)` and the same roll passes.
5. Map density levels to population: R level n houses `n × 20` residents (max 160), C and I level n give `n × 15` jobs.
6. Write `census.ts`, run at month end.
7. Write `query.ts` and wire the query tool to a simple info toast for now (phase 07 adds the panel).
8. Write tests.

## Build gate
```
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e
```

## Test plan
- `power.test.ts`: a plant powers a connected zone; a cut line leaves the far zone unpowered; overload leaves the farthest zones unpowered.
- `zones.test.ts`: a powered R zone next to a road, with positive valve, grows to level ≥ 2 within 24 months on a fixed seed; an unpowered zone never grows.
- `demand.test.ts`: many residents and few jobs push C and I valves up and R down.
- Determinism test: scripted starter city gives an identical population after 10 years across two runs.
- Manual: build a plant, lines, roads and zones with the toolbar; watch census values in the dev console rise; bulldoze a zone and see the whole 3×3 cleared.

## Commit
`feat(sim): add power grid, RCI zones, growth/decay, demand valves and census`

## Rollback
Revert the commit. Phase-05 tools keep working; zone and plant tiles are only in this phase's tile ranges, so nothing else breaks.
