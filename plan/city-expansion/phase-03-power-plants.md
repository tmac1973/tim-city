# Phase 03 — Solar, wind, gas and oil power

**Depends on:** 01 · **Enables:** 08

## Goal
Add four plants with distinct trade-offs. Solar and wind output is set once a
month: wind turbines on high ground give 50% more, and solar farms give 40%
less in an overcast month. The sim rolls overcast months itself so they stay
deterministic, and the renderer leans its weather toward clouds in those
months. Oil unlocks at City. The others are available from the start.

| Plant | Kind | Size | Cost | Output | Pollution (coal = 1) | Other |
|---|---|---|---|---|---|---|
| Solar farm | `SolarFarm` 66 | 4×4 | $2,500 | 300 | 0 | ×0.6 in an overcast month |
| Wind turbine | `WindTurbine` 67 | 1×1 | $400 | 40 | 0 | ×1.5 on high ground |
| Gas plant | `GasPlant` 68 | 4×4 | $2,200 | 500 | 0.5 | — |
| Oil plant | `OilPlant` 69 | 4×4 | $2,600 | 1,000 | 1.5 | Fire-start chance ×3 on its tiles |

## Files touched
- `src/shared/tiles.ts`: the four kinds and their footprints.
  `WIND_SIZE = 1`, and the others use `PLANT_SIZE`.
- `src/shared/costs.ts`: the `COSTS` entries `solarFarm`, `windTurbine`,
  `gasPlant` and `oilPlant`. Extend `POWER_SUPPLY` with `solar: 300`,
  `wind: 40`, `gas: 500` and `oil: 1000`. Add `PLANT_POLLUTION`.
- `src/shared/protocol.ts`: the `ToolId` values `solar`, `wind`, `gas` and
  `oil`. Census `plants` gains the four counts. Add `overcast: boolean` to the
  snapshot.
- `src/sim/state.ts`: add `overcast: boolean` (default false).
- `src/sim/serializeRegistry.ts`: add `overcast` to `savedHeader`. It's a
  header field, so there is no format bump: a missing value reads as false in
  `deserialize`.
- `src/sim/systems/power.ts`: `plantSupply(state, i)` returns the per-plant
  output with its modifiers. The plant list includes the new kinds.
- `src/render/atmosphere/seasons.ts` and `src/shared/constants.ts`: move
  `isWinter` to `constants.ts`, and `seasons.ts` re-exports it.
- `src/sim/systems/climate.ts` (new) and `src/sim/systems/index.ts`: a
  monthly system that rolls `state.overcast`.
- `src/sim/systems/pollution.ts`: plant pollution from `PLANT_POLLUTION`.
- `src/sim/systems/census.ts`: count the new plants and sum the actual output.
- `src/sim/disasters/fire.ts`: random ignition weight ×3 on oil plant tiles.
- `src/sim/tools/place.ts`: placement for the four tools. Wind is 1×1 and needs
  no flat ground. The others use the plant footprint rules.
- `src/sim/tools/query.ts` and `src/ui/QueryPanel.tsx`: plant output and
  modifiers.
- `src/shared/unlocks.ts`: `oil` → class 2 (City).
- `src/ui/Toolbar.tsx`: add the four tools to the Power category. Wind uses
  key E, which is free today (W pans the camera).
- `src/render/buildings/plants.ts`: models for the four plants and spinning
  turbine blades.
- `src/render/atmosphere/weather.ts`: weather odds take `overcast`.
- `src/sim/systems/systems.test.ts`, `src/sim/tools/tools.test.ts` and
  `src/render/atmosphere/weather.test.ts`: tests.

## Steps
1. Add the kinds 66–69 and register the footprints: 4 for solar, gas and oil,
   and 1 for wind.
2. Add the costs, outputs and `PLANT_POLLUTION = { coal: 1, nuclear: 0,
   solar: 0, wind: 0, gas: 0.5, oil: 1.5 }`. Refactor `pollution.ts` to scale
   its current coal value by these factors instead of checking for coal by
   name.
3. Create `climate.ts`, with `phaseTicks: [0]`. At the start of each month it
   draws from `state.random('climate')` and sets `state.overcast` with these
   chances. Months are 0-based, as in `GameDate`. Winter is months 11, 0
   and 1, as `isWinter` in `src/render/atmosphere/seasons.ts` defines it.
   Move `isWinter` to `src/shared/constants.ts` so the sim can import it.
   The chances are 25% in winter, 30% in the wet months 2–4 and 8–10, and
   15% in months 5–7. The sets do not overlap. Register the system before `power`.
4. High ground for wind: a turbine at tile (x, y) has high ground when its
   highest corner height is at least 4 steps above the lowest corner height in
   the 17×17 box centred on it, clipped to the map. Work it out in a function
   `windOnHighGround(state, x, y)` in `power.ts`.
5. `plantSupply(state, i)` returns `POWER_SUPPLY[kind]`, times 0.6 for solar in
   an overcast month, and times 1.5 for wind on high ground (rounded down). The
   power system uses it in place of the current lookup. The plant list scan
   includes all six plant kinds.
6. Fire: in `fire.ts`, the random-ignition pick weights oil plant tiles ×3.
   Coal and the others stay at the current weight.
7. Placement: wind turbines go on any open land tile, including slopes, and
   they are conductive like plants. Solar, gas and oil use the coal plant's
   rules (flat-ground grading and footprint checks). All four are bulldozable,
   can burn, can flood, and are destroyed by the disasters that destroy
   plants.
8. Query: a plant shows "Output 450 / 300 base", and its modifier as text.
   For example, "High ground +50%" or "Overcast month −40%". Add a city-level
   line, "Power supply / demand", which is already in the census.
9. Toolbar: add the Power entries with hints. Wind: "40 units, 60 on high
   ground. Clean and small." Solar: "300 units, less in cloudy months.
   Clean." Gas: "500 units. Half the smoke of coal." Oil: "1,000 units.
   Smoky, and it catches fire easily."
10. Models (`plants.ts`, low-poly kit as the coal plant uses):
    - Solar: 4×4 rows of tilted dark-blue panels on posts.
    - Wind: a white tower about 3 tiles tall, with a nacelle and three blades
      that rotate at 0.6 rad/s. The blades stop when the turbine is unpowered
      or the game is paused.
    - Gas: two white spherical tanks and a short stack.
    - Oil: a refinery with two cylindrical tanks, pipes, a tall stack and a
      flare flame particle.
    Use the existing smoke particles in `particles.ts`: gas emits at half the
    coal rate and oil at 1.5 times it.
11. Weather: `Weather.step` takes `overcast` from the snapshot. When it is
    true, `odds()` multiplies the clear weight by 0.2 and doubles overcast and
    storm. Weather remains visual only.

## Build gate
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm e2e`

## Test plan
- Unit: each plant powers exactly its output on a grid of 1-level lots.
- Unit: a turbine on a hill, made with terraform, gives 60, and on flat land
  40. Solar gives 180 when `overcast` is forced true.
- Unit: the `climate` roll is deterministic for a seed, and over 1,200 months
  its rate is within 5 percentage points of the expected mix.
- Unit: oil pollution is 1.5× coal and gas pollution is 0.5×. Oil is refused
  before City.
- Unit: `determinism.test.ts` passes. An old save without `overcast` loads as
  false.
- Unit (`weather.test.ts`): overcast odds have clear at 20% of its normal
  weight.
- e2e: pick Wind and place it. The query panel shows "Output 40".
- Manual: the turbine blades spin, and the oil flare and the smoke show.

## Commit
`feat(sim): solar, wind, gas and oil power plants`

## Rollback
Revert the commit. There is no format bump, but a save that contains the new
plant kinds would show unknown tiles in the previous build. Before reverting,
note that such saves need the new build. `overcast` is ignored by older builds.
