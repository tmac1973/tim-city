# Phase 15 — Disaster Simulation

**Depends on:** 02, 04, 05, 06, 07, 09, 10, 11, 12, 14 · **Enables:** 18 (cinematic effects drive off disaster state), 19 (sirens and disaster audio)

## Goal
Add all eight disasters as sim systems: fire, flood, tornado, earthquake, plane crash, shipwreck, nuclear meltdown, and an original giant creature called the **Mirebeast** (a moss-covered amphibian that rises from water). Each damages the city through the sim, leaves rubble, and is reported in the news. Random disasters follow the difficulty rate and the player toggle. A menu triggers any disaster by hand. This phase renders disasters with simple, functional visuals; phase 18 makes them cinematic.

## Files touched
- `src/shared/tiles.ts` — `Flood` and `Radiation` tile kinds in the 320–399 range; `Rubble` already exists. A burning tile keeps its kind and gets the phase-02 `BURNING` flag; `fire.ts` sets and clears that flag and turns the tile into `Rubble` when it burns out.
- `src/sim/state.ts` — `disasters: ActiveDisaster[]` (type, position, path, timer) and `radiationYears` per tile (sparse map).
- `src/shared/protocol.ts` — `tick` carries the `disasters` list each tick while any is active.
- `src/sim/disasters/fire.ts` — burning tiles spread each tick to flammable 4-neighbors (flammable = trees, power lines, and every zone, building, station, plant and special tile; roads, rail, water, rubble and empty land do not burn) with chance `0.08 × (1 − fireCover/255)`; burn out after 8–16 ticks into rubble; fire stations within coverage extinguish at `fireCover/255 × 0.3` per tick.
- `src/sim/disasters/flood.ts` — starts at a coast or river tile; water spreads to dry tiles at or below sea level + 1 for 2 months, then recedes; flooded zones lose one density level.
- `src/sim/disasters/tornado.ts` — spawns at a random land tile, moves 1 tile per tick on a seeded random walk for 40–80 ticks, destroys a 3×3 area each step into rubble.
- `src/sim/disasters/earthquake.ts` — epicenter + radius 15; each tile in radius has a 15% chance to become rubble and 3% to ignite; road tiles in radius become potholed.
- `src/sim/disasters/planeCrash.ts` — requires an airport; impact within 20 tiles of it; 3×3 rubble plus fire.
- `src/sim/disasters/shipwreck.ts` — requires a seaport; the RNG picks a bridge tile or a shore tile within 12 tiles of the seaport; destroys the bridge span or shore tiles and spills oil: a pollution source of 200 on the 3×3 blocks around the impact for 12 game months. The impact itself ends the shipwreck disaster at once; the spill is stored separately in `state.pollutionSpills` (`{ x, y, monthsLeft }[]`, serialized in this phase), which `pollution.ts` reads and decrements each month.
- `src/sim/disasters/meltdown.ts` — requires a nuclear plant; every land tile in radius 8 of the plant center, including the plant footprint, becomes `Radiation` (water tiles stay water but count as pollution 255 while the radiation lasts); radiation tiles are unbuildable for 50 game years and cause max pollution; at each `yearEnd` it decrements `radiationYears` and turns tiles that reach 0 into `Empty`.
- `src/sim/systems/pollution.ts` — `Radiation` tiles are pollution sources of 255.
- `src/sim/tools/index.ts` — every build tool refuses `Radiation` tiles with the reason "Radioactive"; bulldozing them is also refused.
- `src/sim/disasters/mirebeast.ts` — random start requires mean pollution over populated blocks above 120; a manual trigger always works when the map has water; emerges from the water tile nearest the pollution peak, walks toward the highest-pollution block at 1 tile per 2 ticks, destroys a 2×2 footprint, starts fires; leaves after 120 ticks or when it reaches the map edge.
- `src/sim/disasters/scheduler.ts` — monthly random roll: base chance 1.5% per month × `difficulty.disasterRate`, only when `randomDisasters` is on; weighted pick among valid types (fire 30, flood 15, tornado 15, earthquake 10, plane crash 10, shipwreck 10, meltdown 5, Mirebeast 5), with weights renormalized over the types that `canStart`.
- `src/sim/commands.ts` — `triggerDisaster(type, x?, y?)`.
- `src/sim/systems/news.ts` — disaster headlines with location.
- `src/sim/systems/evaluation.ts` — the phase-12 "2 per tile burned this year" term counts tiles burned by every disaster (fires started by quakes, crashes and the Mirebeast included).
- `src/sim/serializeRegistry.ts` — add disaster state; bump format version to 2; `migrate.ts` adds the version-1 → 2 migration (empty disaster list).
- `src/render/disasterBasic.ts` — functional visuals: emissive flame quads on fire tiles, a translucent water plane on flood tiles, a gray cone for the tornado, a green glow on radiation tiles, and a simple low-poly Mirebeast mesh built from kit primitives with a walk bob.
- `src/ui/DisasterMenu.tsx` — list of disasters with "Trigger" buttons (disabled with a reason when invalid, e.g. "Needs an airport") and the random-disasters toggle.
- `src/sim/disasters/*.test.ts` — tests.

## Steps
1. Extend tiles and state. Add each disaster module with a common interface `{ canStart(state), start(state, rng, x?, y?), step(state, rng) → done }`.
2. Write `scheduler.ts` and the `triggerDisaster` command.
3. Extend news, evaluation, serializer and migration.
4. Write `disasterBasic.ts` and `DisasterMenu.tsx`; add a toolbar button for the menu.
5. Write tests.

## Implementation notes (changed during build)
- **Flooding is a tile flag, not a `Flood` kind.** `TileFlag.FLOODED` (1<<7) marks water over a tile, so the building under it survives and keeps its kind; the flood loses one density level on zones it reaches and clears the flag as it recedes. Only `Radiation` (320) was added as a kind.
- **Fire lives in `state.fireTicks`** (a per-tile `Uint8Array`, saved) with the phase-02 `BURNING` flag, not in the disaster list. A fire disaster ignites tiles and ends at once; fires started by quakes, crashes and the Mirebeast use the same path. Tiles that burn out add to `burnedThisYear`, which the evaluation reads.
- The modules share `common.ts` (`destroy`, `ignite`, `begin`, `randomTile`) and register in `disasters/index.ts` (`DEFS`, `triggerDisaster`, `rollRandomDisaster`, `disasterSystem`) instead of a separate `scheduler.ts`. Plane crash and shipwreck share `impacts.ts`.
- `triggerDisaster` takes only the type; the disaster picks its own spot. A refused trigger emits `disasterRefused` with the menu's reason ("Needs a nuclear plant"), shown as a toast. A started one emits `disaster`, and the camera flies to it.
- Save format version 2 appends `fireTicks`, the disaster list, the radiation map and the oil spills; `migrate.ts` fills them empty for version-1 saves and the v1 fixture test covers it.
- The census counts landmarks (airport, seaport, nuclear plant), which the menu uses to enable or disable triggers.
- `disasterBasic.ts` also draws rubble as low gray heaps, since disasters made rubble common for the first time.
- Bulldozing radioactive ground is a silent no-op inside a drag (and "Nothing to bulldoze" on a single tile); building on it fails with "Radioactive".
- CI now uploads Playwright traces and screenshots (`test-results/`) when e2e fails, to debug Chromium-only failures that do not reproduce locally.

## Build gate
```
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e
```

## Test plan
- One test per disaster: trigger on a fixture city; it changes the expected tiles; it ends; it leaves rubble the bulldozer can clear. The meltdown is the exception: it leaves `Radiation` tiles that refuse the bulldozer and turn `Empty` after 50 simulated years.
- Fire spreads slower with full fire coverage than with none (statistical test over 20 seeds).
- With `randomDisasters = false`, no disaster starts in 100 simulated years.
- `src/sim/fixtures/city-v1.timcity` (from phase 14) loads and migrates to version 2 with an empty disaster list.
- Determinism test with a triggered tornado passes.
- Manual: trigger each disaster from the menu and watch it play out.

## Commit
`feat(sim): add fire, flood, tornado, earthquake, plane crash, shipwreck, meltdown and Mirebeast disasters`

## Rollback
Revert the commit. Saves of format version 2 will not load in the reverted build; this is acceptable before the public release in phase 21.
