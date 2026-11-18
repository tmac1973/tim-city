# Phase 02 — Zone density tiers

**Depends on:** 01 · **Enables:** 04 (the water cap joins the growth caps), 08

## Goal
Let the player paint R, C and I zones as low, medium or high density. The tier
caps the level a lot can reach: low at 3, medium at 6, high at 8. Levels 7–8
also need land-value class 2 or higher. The tier is stored in a new per-tile
array. v1 saves migrate with every existing zone set to high, so nothing
shrinks. High density unlocks at Town.

## Files touched
- `src/shared/tiles.ts`: add `ZoneTier = { Low: 0, Medium: 1, High: 2 }`,
  `TIER_CAP = [3, 6, 8]` and `HIGH_LV_GATE = 2`.
- `src/sim/state.ts`: add `readonly zoneTier: Uint8Array` (size × size).
- `src/sim/serializeRegistry.ts`: set `FORMAT_VERSION = 3`, and append
  `['zoneTier', state.zoneTier]` at the end of `savedArrays` under a
  "Version 3: density tiers" comment.
- `src/sim/migrate.ts`: add the v2 → v3 migration. It fills `zoneTier` with 2
  on every tile where `zoneOf(tile)` is not null, and 0 elsewhere.
- `src/sim/serialize.test.ts`: cover the round trip and the migration.
- `src/shared/protocol.ts`: add the optional `tier?: ZoneTier` to
  `ToolCommand`. Add `tier` to the query result for zones, and a
  `growthBlock` reason.
- `src/sim/tools/place.ts`: zone placement writes `zoneTier` for all 9 tiles
  of the lot. Rezoning the same type with a different tier changes the tier.
- `src/shared/costs.ts`: `COSTS.rezone = 50`.
- `src/sim/tools/footprint.ts`: the shared footprint-clearing helper resets
  `zoneTier` to 0, so bulldoze and disasters both get it.
- `src/sim/systems/zones.ts`: apply the cap and the land-value gate. Shrink a
  lot above its cap.
- `src/sim/tools/query.ts`: report the tier, the cap and the reason growth is
  blocked.
- `src/shared/unlocks.ts`: add the pseudo-tools `zoneHigh` (class 1, Town).
- `src/shared/protocol.ts`: add `'zoneHigh'` to `ToolId`, used only for the
  unlock check.
- `src/ui/store.ts`: add the `zoneTier` signal (default Medium).
- `src/ui/Toolbar.tsx`: a Low / Medium / High tier picker in the Zones flyout
  header. Pressing a zone key while that zone tool is active cycles the tier.
- `src/ui/toolController.ts`: send `tier` with zone commands.
- `src/ui/QueryPanel.tsx`: show "Density: Medium (max level 6)" and the block
  reason.
- `src/render/overlays.ts`: add a `zoneTier` overlay that shades lots light,
  mid or dark by tier.
- `src/render/mirror.ts`: carry `zoneTier` deltas to the main thread.
- `src/render/buildings/zoneMarkers.ts`: empty-lot markers get one, two or
  three stripes for low, medium or high.
- `src/sim/systems/systems.test.ts`, `src/sim/tools/tools.test.ts` and
  `e2e/tools.spec.ts`: new tests.

## Steps
1. Add the constants to `tiles.ts`. Add `tierCap(tier, lvClass)`, which
   returns `TIER_CAP[tier]` for low and medium. For high it returns 8 when
   `lvClass >= HIGH_LV_GATE` and 6 otherwise.
2. Add `zoneTier` to `CityState`, allocated like `parts`. Add it to
   `savedArrays` last. Bump `FORMAT_VERSION` to 3.
3. In `migrate.ts`, add the v2 → v3 step. Read the `tiles` array of the raw
   save, allocate `zoneTier`, and set 2 wherever `zoneOf(kind)` is not null.
4. In `place.ts`, zone placement takes `cmd.tier ?? ZoneTier.Medium`. If the
   tier is High and `zoneHigh` is locked, fail with the unlock message from
   phase 01. Write the tier to all 9 lot tiles.
5. Rezoning: dragging a zone tool over an existing lot of the same type with a
   different tier changes that lot's tier for $50 (`COSTS.rezone = 50` in
   `costs.ts`), and its buildings stay. A lot of another type is still
   "occupied", as now. A drag that only crosses lots that already have the
   chosen tier costs nothing and changes nothing.
6. In `zones.ts`, read `tier = state.zoneTier[i]` and
   `cap = tierCap(tier, lvClass)`. Growth needs `density < cap` in addition to
   the current checks. When `density > cap` (after a downzone, or after land
   value falls on a high lot at level 7–8), the lot loses one level with
   chance `CHANGE_CHANCE` each month, before the growth checks run. This uses
   the same rng draw order as now: one `nextFloat` for the roll.
7. Add `growthBlock(state, i)` in `zones.ts`. It returns the first reason that
   applies, in this order: `'unpowered'`, `'noRoad'`, `'tripFailed'`,
   `'tierCap'`, `'landValue'` (high tier at 6 with lvClass < 2), `'demand'` or
   `null`. `query.ts` includes the reason and `QueryPanel.tsx` shows it in
   words. For example, "Can't grow: low density allows up to level 3".
8. Bulldoze and every disaster that turns a zone into rubble must reset
   `zoneTier` to 0. Do this in the shared footprint-clearing helper in
   `src/sim/tools/footprint.ts`, so every path gets it.
9. UI: the Zones flyout header shows three chips (Low, Medium, High). High is
   locked with the lock style from phase 01 until Town. Pressing Z while
   Residential is active cycles Low → Medium → High → Low and skips locked
   tiers. Each zone tool's button shows the tier as a 1–3 bar badge. The cost
   tag says "$100 per lot · Medium".
10. Rendering: the building variants already scale with density. A low-tier
    lot at level 3 uses the house variants. Add the stripe markers on empty
    lots and the `zoneTier` overlay, which is sampled per tile from
    `zoneTier` and drawn in the existing overlay texture path.
11. The mirror worker-to-main snapshot (`src/render/mirror.ts`) must carry
    `zoneTier` for the overlay and markers. Send it with the tile deltas the
    same way `parts` is sent.

## Build gate
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm e2e`

## Test plan
- Unit (`systems.test.ts`): with demand forced high, a low lot stops at 3,
  a medium lot at 6, a high lot at 8 with land-value class 2 and at 6 with
  class 1.
- Unit: downzoning a level 6 lot to low drops it to 3 within 24 months under a
  fixed seed. Bulldozing clears `zoneTier`.
- Unit (`tools.test.ts`): rezoning costs $50 per changed lot and $0 for lots
  already at that tier. High is refused before Town.
- Unit (`serialize.test.ts`): v3 round trip keeps tiers. The
  `fixtures/city-v1.timcity` save migrates with every zone at high and the same
  zone levels as before.
- Unit (`determinism.test.ts`): it still passes, with tiers in the replay.
- e2e (`tools.spec.ts`): pick Residential, switch to Low, paint a lot and query
  it. The panel says "Low".
- Manual: the overlay shows three shades, and old saves look the same as
  before.

## Commit
`feat(sim): low, medium and high zone density tiers`

## Rollback
Revert the commit. Saves written at format 3 will not load in the previous
build, which refuses newer formats with a clear error. Tell players about
this before reverting. v2 saves are unaffected.
