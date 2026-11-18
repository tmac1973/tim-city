# Phase 05 — Civic, leisure and monument landmarks

**Depends on:** 01, 04 · **Enables:** 08

## Goal
Add nine landmarks, each with one clear, testable effect. They reuse the
`radiate` coverage helper and the Landmarks and Tourism ledger rows from
phase 04. Leisure landmarks earn tourism income when roads reach them from
the map edge.

| Landmark | Kind | Size | Cost | Upkeep / month | Unlock | Effect |
|---|---|---|---|---|---|---|
| City Hall | `CityHall` 261 | 3×3 | $3,000 | $50 | Town | Approval +5. One per city. |
| Hospital | `Hospital` 262 | 3×3 | $2,500 | $80 | Town | `healthCover`, radius 24. Residential score + cover/8. |
| University | `University` 263 | 4×4 | $6,000 | $120 | Capital | `educationCover`, radius 32. Industrial pollution ×0.5 and industrial tax ×1.25 where cover ≥ 64. One per city. |
| Museum | `Museum` 264 | 3×3 | $3,000 | $40 | City | Land value +60 at the centre, fading over 24 tiles. Tourism base $120. |
| Zoo | `Zoo` 265 | 4×4 | $4,000 | $60 | City | Land value +60, radius 24. Tourism base $150. |
| Amusement park | `AmusementPark` 266 | 4×4 | $8,000 | $100 | Capital | Land value +60, radius 24. Tourism base $250. |
| Statue | `Statue` 267 | 1×1 | $500 | $0 | Town | Approval +1. Land value +30, radius 8. |
| Clock tower | `ClockTower` 268 | 2×2 | $1,500 | $5 | City | Approval +2. Land value +30, radius 8. |
| "TIM" sign | `TimSign` 269 | 2×2 | $2,500 | $5 | Capital | Approval +3. Land value +30, radius 8. |

The total approval bonus from landmarks is capped at +15.

## Files touched
- `src/shared/tiles.ts`: the kinds 261–269 and their footprints.
- `src/shared/costs.ts`: the costs. `UPKEEP` gains the landmark entries.
  `LANDMARK_REACH` holds each landmark's radius and strength from the table
  (for example `zoo: { radius: 24, landValue: 60 }`).
  `TOURISM_BASE` and `LANDMARK_APPROVAL`.
- `src/shared/protocol.ts`: the nine `ToolId` values. Census `landmarks` gains
  the counts. A `tourism` field in the census.
- `src/shared/unlocks.ts`: the unlock classes from the table.
- `src/sim/state.ts`: add `'healthCover'` and `'educationCover'` to
  `EXTRA_FIELD_NAMES` from phase 04.
- `src/sim/serializeRegistry.ts`: `FORMAT_VERSION = 5`. Append
  `field:healthCover` and `field:educationCover` under "Version 5".
- `src/sim/migrate.ts`: the v4 → v5 step adds zeroed arrays.
- `src/sim/systems/coverage.ts`: health and education coverage through
  `radiate`.
- `src/sim/systems/landValue.ts`: landmark land-value boosts through `radiate`.
- `src/sim/systems/zones.ts`: the residential health term in `zoneScore`.
- `src/sim/systems/pollution.ts`: the university halving for industry.
- `src/sim/systems/budget.ts`: the university tax factor, the Landmarks upkeep
  and Tourism income.
- `src/sim/systems/tourism.ts` (new) and `src/sim/systems/index.ts`: monthly
  tourism.
- `src/sim/systems/traffic.ts`: export a `reachesEdge(state, starts)` helper
  that reuses `TripSearch` with `want = SERVES_EDGE`.
- `src/sim/systems/evaluation.ts`: the landmark approval bonus.
- `src/sim/tools/place.ts`: placement, and the one-per-city rule for City Hall
  and University.
- `src/ui/Toolbar.tsx`: add these nine to the Landmarks category, after the
  stadium, seaport and airport, sorted by unlock class.
- `src/ui/BudgetWindow.tsx`: the Landmarks and Tourism rows now show values.
- `src/ui/QueryPanel.tsx`: landmark effect text, and tourism income for
  leisure buildings.
- `src/render/overlays.ts`: the `health` and `education` overlays.
- `src/render/buildings/specials.ts`: nine models.
- Tests: `specials.test.ts`, `systems.test.ts`, `budget.test.ts`,
  `evaluation.test.ts` and `serialize.test.ts`.

## Steps
1. Add the kinds, footprints, costs, upkeep and unlock entries from the table.
2. Placement: every landmark needs flat ground of its size. City Hall and
   University fail with "Only one per city" if one already exists. Check this
   with a tile scan for the kind's top-left part (`parts === 1`), because the
   census can be a month old. All landmarks are conductive,
   bulldozable, can burn and can flood.
3. A landmark is "working" when it is powered and has road access, as police
   stations are. A landmark that is not working gives half of its effects and
   no tourism.
4. Coverage: the hospital radiates 255 into `healthCover` with radius 24, and
   the university into `educationCover` with radius 32. Both are scaled by
   working state only; there is no funding slider for landmarks.
5. `zoneScore`: for residential lots, add `healthCover[b] / 8`, which is up
   to +32.
6. Pollution: industrial-zone pollution sources whose block has
   `educationCover >= 64` emit 50%.
7. Budget: industrial tax from lots whose block has `educationCover >= 64` is
   multiplied by 1.25. Landmarks upkeep is the sum of `UPKEEP` over the
   nine new landmarks. The stadium, seaport and airport keep their v1 budget
   handling unchanged.
8. Land value: the museum, zoo and amusement park each radiate +60 with radius
   24. The monuments radiate +30 with radius 8. Add these to the land-value
   result before clamping to 0–255.
9. `tourism.ts` (`phaseTicks: [9]`): for each working leisure landmark, it
   first checks `reachesEdge` from the road tiles in its reach box. If the
   edge is not reachable, income is 0. If it is, income is
   `TOURISM_BASE[kind] × (1 − (crime[b] + pollution[b]) / 510)`, rounded down,
   where `b` is the landmark's centre block. The monthly total goes to
   `ledger.tourism` and the census `tourism`.
10. Evaluation: `approval = min(100, approvalFrom(...) + min(15, bonus))`. The
    bonus is the sum of `LANDMARK_APPROVAL` per building: City Hall 5,
    statue 1, clock tower 2 and "TIM" sign 3. A landmark that is not working
    counts half, as step 3 says. Sum the values with halves, then round the
    total down before the +15 cap. For example, a City Hall that is not
    working plus a working statue gives floor(2.5 + 1) = 3.
11. Toolbar: the Landmarks category lists every landmark, with locked ones
    greyed as phase 01 defines. Hints state the effect in one sentence.
12. Query panel: for example, "Zoo · Tourism $132/month · Land value +60
    nearby", or "Not working: needs power and a road".
13. Models in `specials.ts`, using the kit:
    - City Hall: a columned front and a dome.
    - Hospital: a white block with a red cross and a rooftop helipad.
    - University: brick halls around a green quad with a clock spire.
    - Museum: a stepped classical front.
    - Zoo: fenced paddocks with trees, a pond and little animal shapes.
    - Amusement park: a Ferris wheel that turns slowly, a coaster loop and
      tents.
    - Statue: a plinth with a figure.
    - Clock tower: a tall square tower with a lit clock face at night.
    - "TIM" sign: large lit letters on a scaffold, using the night emissive.

## Build gate
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm e2e`

## Test plan
- Unit: each landmark's effect, measured before and after placing it in a
  fixture city:
  - approval rises by the stated amount, and the total is capped at +15;
  - residential score near a hospital rises;
  - industrial pollution and tax under a university change by the stated
    factors;
  - land value near the leisure landmarks and monuments rises.
- Unit: a zoo with a road to the edge earns income. Cutting the road drops it
  to 0. Crime and pollution scale it down.
- Unit: a second City Hall is refused. Landmarks are locked before their
  class.
- Unit: a v4 save migrates to v5. `determinism.test.ts` passes.
- e2e: at Town, City Hall can be placed and the approval display rises.
- Manual: every model renders in the day and the night, and the Ferris wheel
  turns.

## Commit
`feat(sim): civic, leisure and monument landmarks with tourism income`

## Rollback
Revert the commit. Saves at format 5 will not load in the previous build. The
landmark systems are separate additions, and reverting leaves phase 04's
budget rows in place with 0 values.
