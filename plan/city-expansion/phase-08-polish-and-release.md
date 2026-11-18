# Phase 08 — Onboarding, balance pass and v2.0.0

**Depends on:** 01, 02, 03, 04, 05, 06, 07 · **Enables:** the v2.0.0 release

## Goal
Make the new features discoverable and check them together. Add onboarding
tips, an end-to-end playthrough test, a migration soak test of the v1 fixture,
and a performance check. Then bump the version and tag v2.0.0.

## Files touched
- `src/ui/onboarding/tips.ts` and `tips.test.ts`: new tips.
- `src/sim/systems/news.ts`: news items for first bus riders, the first subway
  and the first tourism income.
- `src/sim/fixtures/city-v6.timcity` (new, made by `pnpm fixture`): a v2
  fixture with every new feature.
- `scripts/makeFixtureSave.ts`: build the v6 fixture with tiers, new plants,
  utilities, landmarks, buses and a subway.
- `src/sim/serialize.test.ts`: soak tests for both fixtures.
- `e2e/playable.spec.ts`: a v2 playthrough.
- `scripts/buildBenchCities.ts` and `e2e/bench.spec.ts`: add 20 water towers and 10
  landfills to the Megalopolis bench city.
- `src/shared/version.ts`, `package.json` and `src/shared/version.test.ts`: the
  version 2.0.0.
- `README.md`: a features section for v2.
- `CHANGELOG.md` (create it if it is missing): the v2.0.0 entry.

## Steps
1. Tips (one each, shown once, using the existing tip system):
   - the first time the Zones flyout opens: "Pick low, medium or high density.
     Press the zone key again to cycle.";
   - the first lot blocked by `noWater`: "This lot needs water to grow. Build
     a water tower nearby.";
   - the first month any road block has a traffic value of 200 or more: "Bus stops along busy roads take cars
     off them.";
   - reaching City: "Subways unlocked. Press V to see underground.";
   - the first leisure landmark: "Landmarks earn tourism when roads reach them
     from the edge of the map."
2. News: "The first bus riders are on their way" when `busRiders` goes from 0
   to more than 0. "The subway opens!" when `subwayRiders` goes from 0 to more
   than 0. "Tourists arrive: $N this month" for the first tourism income above
   0. Each fires once per city, tracked by `state.newsFlags`, a header field.
   Add it to `savedHeader`, with a missing value reading as empty.
3. Fixture: extend `makeFixtureSave.ts` to build `city-v6.timcity`, and commit
   the file.
4. Soak tests:
   - `city-v1.timcity` migrates to v6, keeps every zone level (all high tier),
     gets a 24-month grace period and runs for 5 game years with no thrown
     errors and population above 50% of its start;
   - `city-v6.timcity` loads and runs for 5 years with bus and subway riders
     above 0 every month.
5. e2e playthrough in `playable.spec.ts`, on a 128 map at a raised game speed:
   - zone low R and medium C, and place a wind turbine, a water tower and a
     landfill;
   - press Play, and wait for population above 0;
   - place two bus stops, and assert that a bus agent appears;
   - save, reload and load the save, and assert the stops and tiers are back.
6. Bench: add 20 water towers and 10 landfills to the Megalopolis 256 bench
   city, which already has the bus and subway lines from phases 06 and 07. Run `pnpm bench` on a checkout of the `v1.0.0` tag (the baseline, with the
   v1 bench city) and on this phase's build (with the extended city). The frame
   time must be within 10% of the baseline and the monthly tick within 15%. If either fails, profile and fix inside this phase before
   tagging.
7. Balance pass: play a new Normal city for 20 game years on the live preview
   build. Change only these constants: costs, outputs, upkeep and tourism bases in
   `src/shared/costs.ts`; tier caps in `src/shared/tiles.ts`; the utility and landmark radii,
   capacities and strengths (`UTILITY` and `LANDMARK_REACH`) in
   `src/shared/costs.ts`; `SUBWAY_COST` in `src/sim/graph.ts`; and
   `BUS_LANE_DISCOUNT` and `BUS_LOAD_SHARE` in `src/sim/systems/transit.ts`. In the commit body,
   record every changed constant with its old and new values.
8. Version: set `GAME_VERSION = '2.0.0'` and the `package.json` version to
   2.0.0. Update `version.test.ts`.
9. Docs: add a README "What's new in 2.0" list, and add the CHANGELOG entry.
10. Release: push to main, check CI and the Pages deploy, and confirm that the
    live bundle contains "Subway station" and "Water tower". Then tag
    `v2.0.0` and push the tag.

## Build gate
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm e2e`
- `pnpm bench` (local)

## Test plan
- Unit: the tips fire once each. The news flags persist through save and load.
- Unit: the two soak tests in step 4.
- e2e: the playthrough in step 5 passes in Chromium, Firefox and WebKit.
- Bench: the numbers in step 6 are recorded in the commit body.
- Manual: a fresh visit to the live site after deploy shows the title screen,
  and a new city starts paused with the grouped toolbar.

## Commit
`chore(release): v2.0.0 onboarding, soak tests and balance pass`

## Rollback
Revert the commit and delete the `v2.0.0` tag if it was pushed. The tips,
news and fixtures are additive. A balance-constant revert is safe at any time,
because constants are not saved.
