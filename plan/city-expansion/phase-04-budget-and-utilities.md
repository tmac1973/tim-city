# Phase 04 — Transit and Utilities budget lines, water and garbage

**Depends on:** 01, 02 · **Enables:** 05 (it reuses the coverage helper and
the Landmarks ledger line), 06, 07, 08

## Goal
Add the funding lines that later buildings draw on, and the two light utility
systems. Water towers and landfills cover a radius with a capacity. After the
grace period, a lot without water can't grow past level 4. A block without
garbage pickup loses land value. Every save made before this phase (format 1, 2 or 3) gets a 2-year grace
period with advisor warnings. That includes cities started in the phase 02
and 03 builds. New cities have no grace period, since both buildings are
available from the start.

| Building | Kind | Size | Cost | Upkeep / month | Radius | Capacity (lot levels) |
|---|---|---|---|---|---|---|
| Water tower | `WaterTower` 259 | 2×2 | $600 | $20 | 16 tiles | 300 |
| Landfill | `Landfill` 260 | 4×4 | $1,000 | $30 | 24 tiles | 500 |

## Files touched
- `src/shared/protocol.ts`:
  - `Funding` gains `transit` and `utilities`.
  - `Ledger` gains `transit`, `utilities`, `landmarks` and `tourism`. Transit,
    landmarks and tourism stay 0 until phases 05–06.
  - `ToolId` gains `waterTower` and `landfill`.
  - `ProblemId` gains `water` and `garbage`.
  - The census gains `unwateredLots` and `ungarbagedLots`.
- `src/shared/tiles.ts`: the two kinds and their footprints.
- `src/shared/costs.ts`: the costs plus `UPKEEP = { waterTower: 20, landfill: 30 }`
  and `UTILITY = { waterTower: { radius: 16, capacity: 300 }, landfill:
  { radius: 24, capacity: 500 } }`. Every radius and capacity is read from
  there.
- `src/sim/state.ts`: `funding.transit = 100`, `funding.utilities = 100` and
  `utilityGraceUntil: number` (a month index, default 0). Add an
  `EXTRA_FIELD_NAMES` list, separate from `FIELD_NAMES` so the saved array
  order of v3 does not move, holding `'waterCover'` and `'garbageCover'`.
  `field(name)` serves both lists.
- `src/sim/serializeRegistry.ts`: `FORMAT_VERSION = 4`. Append the arrays
  `field:waterCover` and `field:garbageCover` at the end under "Version 4".
  Add `utilityGraceUntil` to the header.
- `src/sim/migrate.ts`: the v3 → v4 step. It adds funding 100/100, zeroed
  cover arrays, and `utilityGraceUntil = currentMonthIndex + 24`.
- `src/sim/systems/coverage.ts`: extract `radiate(state, target, sx, sy,
  radius, strength)` from the police and fire loop. Add `updateUtilities`.
- `src/sim/systems/zones.ts`: the water cap and the `noWater` block reason.
- `src/sim/systems/landValue.ts`: the garbage penalty.
- `src/sim/systems/budget.ts`: the Utilities upkeep line and the funding
  scale.
- `src/sim/systems/evaluation.ts`: the problems `water` and `garbage`.
- `src/sim/systems/news.ts`: grace-period warnings.
- `src/sim/tools/place.ts`: placement for both buildings.
- `src/ui/BudgetWindow.tsx`: Transit and Utilities sliders and the new ledger
  rows. Rows with 0 for the whole year are hidden.
- `src/ui/Toolbar.tsx`: a new Utilities category with both tools.
- `src/render/overlays.ts`: the `water` and `garbage` overlays.
- `src/render/buildings/services.ts`: the water tower and landfill models.
- `src/sim/systems/systems.test.ts`, `budget.test.ts`, `serialize.test.ts` and
  `e2e/budget.spec.ts`: tests.

## Steps
1. Add the kinds, footprints, costs and the upkeep table.
2. Refactor `coverage.ts`: move the inner block loop into `radiate(...)`, which
   adds a linear falloff to a `Float32Array`. Police and fire call it, and
   their output stays byte-identical, so the existing tests pass unchanged.
3. `updateUtilities(state)` runs in the coverage system after police and fire.
   For each water tower (and separately each landfill), it works in three
   steps:
   - It sums the levels of every zone lot whose centre lies within the radius.
     That sum is the demand.
   - Its strength is `255 × min(1, capacity / max(1, demand)) ×
     funding.utilities / 100`. An unpowered building or one without road
     access runs at half strength.
   - It calls `radiate` into the water (or garbage) buffer and stores the
     result in `field('waterCover')` (or `garbageCover`).
   Buildings are processed in map order, which is deterministic.
4. A lot "has water" when `waterCover` at its block is 64 or more. Garbage is
   "collected" when `garbageCover` is 64 or more.
5. Grace: `utilityRulesActive(state)` returns
   `monthIndex(state.date) >= state.utilityGraceUntil`. New cities get
   `utilityGraceUntil = 0`.
6. `zones.ts`: when the rules are active and the lot has no water, the cap
   becomes `min(cap, 4)`. Add `'noWater'` to `growthBlock`, before `'tierCap'`.
   An unwatered lot above level 4 shrinks with the over-cap rule from
   phase 02.
7. `landValue.ts`: when the rules are active, a block with zone tiles and
   uncollected garbage loses 40 land value, floored at 0. A landfill also
   lowers land value by 30 within 4 tiles of its edge, and that applies
   whether or not the rules are active.
8. Budget:
   - The Utilities line is the sum of upkeep for every water tower and
     landfill, times `funding.utilities / 100`.
   - The Transit line exists with 0 cost until phase 06.
   - The Landmarks and Tourism rows exist with 0 until phase 05. Landmarks has
     no slider: a flat upkeep is always paid. Tourism is income.
9. Evaluation: problem `water` scores `unwateredLots / totalLots × 100`, and
   `garbage` the same with `ungarbagedLots`. Both count only while the rules
   are active. Before that, both scores are 0.
10. News: at 6 months and at 1 month before `utilityGraceUntil`, post "Water
    and garbage service will soon matter: build water towers and landfills
    near your neighbourhoods." When the rules start, post "Water and garbage
    rules are now in force."
11. Placement: the water tower needs 2×2 flat ground, and the landfill 4×4 flat
    ground. Both are conductive, bulldozable and can burn.
12. UI: a new Utilities category after Services. The Budget window shows the
    Transit and Utilities sliders beside the police and fire sliders. The
    `water` and `garbage` overlays reuse the coverage colour ramp. The query
    panel for a lot adds "Water: yes/no" and "Garbage: collected/not
    collected".
13. Models: the water tower is a tall cylinder on four legs, pale blue with a
    'TIM' band. The landfill is a fenced pit with brown and grey mounds and a
    small bulldozer that sways slightly.

## Build gate
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm e2e`

## Test plan
- Unit: police and fire coverage are unchanged after the `radiate` refactor.
  Compare against a stored fixture result.
- Unit: a lot with no water tower stops at level 4 once the rules are active,
  and grows to 6 or more with a tower in range. One tower over 400 lot levels
  of demand gives a strength of 0.75 × 255.
- Unit: a block with no garbage pickup loses 40 land value. Land value next
  to a landfill drops by 30.
- Unit: a migrated v3 save has `utilityGraceUntil` 24 months ahead. No cap
  applies before then, and the cap applies after. The news warnings fire at
  6 and 1 months before the end.
- Unit (`budget.test.ts`): the Utilities line equals the upkeep times funding.
  Funding at 50% halves both the cost and the strength.
- Unit: the `fixtures/city-v1.timcity` save migrates v1 → v4 and runs for 5
  years with no errors.
- e2e (`budget.spec.ts`): the Transit and Utilities sliders exist and persist
  through save and load.
- Manual: the overlays show the radius, and a migrated save shows the
  warnings.

## Commit
`feat(sim): water and garbage coverage with transit and utility budgets`

## Rollback
Revert the commit. Saves at format 4 will not load in the previous build. The
`radiate` refactor is covered by unchanged police and fire tests and stays
correct if the rest is reverted.
