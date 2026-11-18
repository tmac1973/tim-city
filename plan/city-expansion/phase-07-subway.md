# Phase 07 — Subway track, stations and the underground view

**Depends on:** 01, 04, 06 · **Enables:** 08

## Goal
At City (10,000 people), the player can drag subway track underground and
place stations. Track lives in its own saved layer, so the surface stays
free. Trips can enter at a station, ride the track cheaply, and leave at
another station. An underground view fades the surface and shows track as
tubes, stations as markers, and trains as moving dots.

| Item | Value |
|---|---|
| Track | `subway` layer, $40 per tile |
| Station | `SubwayStation` 28, a 1×1 surface tile in the transport range, $800 |
| Upkeep | $1 a month per track tile and $20 per station, on the Transit line |
| Ride cost per tile | `0.3 / max(0.25, funding.transit / 100)`, so 0.3 at full funding |
| Enter or leave at a station | 2 (`TRANSFER_COST`) |

## Files touched
- `src/shared/tiles.ts`: the `SubwayStation` kind, and `isTransportKind` is true
  for it, so a station connects to the roads beside it.
- `src/shared/costs.ts`: the costs and upkeep.
- `src/shared/protocol.ts`: the `ToolId` values `subway` and `subwayStation`,
  census `subwayRiders`, the `underground` view flag and the subway layer in
  the snapshot.
- `src/shared/unlocks.ts`: `subway` and `subwayStation` → class 2 (City).
- `src/sim/state.ts`: `subway: Uint8Array`, 1 where track runs.
- `src/sim/serializeRegistry.ts`: `FORMAT_VERSION = 6`. Append
  `['subway', state.subway]` under "Version 6".
- `src/sim/migrate.ts`: the v5 → v6 step adds a zeroed layer.
- `src/sim/tools/subway.ts` (new): the drag tool and station placement.
- `src/sim/tools/bulldoze.ts`: in the underground view, bulldoze clears track.
  On the surface it never touches track.
- `src/sim/graph.ts`: `SUBWAY_COST`, and the underground node helpers.
- `src/sim/systems/traffic.ts`: `TripSearch` uses two layers.
- `src/sim/systems/budget.ts` and `census.ts`: the subway costs and riders.
- `src/ui/Toolbar.tsx`: Subway and Subway station in Transit.
- `src/ui/store.ts`: the `undergroundView` signal. It is on while a subway tool
  is active, or after V is pressed. V is free today.
- `src/render/underground.ts` (new) and `src/render/renderer.ts`: the
  underground view.
- `src/render/agents/subwayTrains.ts` (new): train markers.
- `src/render/overlays.ts`: the `transit` overlay adds subway lines.
- `src/render/buildings/services.ts`: the station entrance model.
- `src/render/mirror.ts`: carry `subway` layer deltas.
- `scripts/buildBenchCities.ts`: add 4 subway lines to the Megalopolis 256
  bench city. A subway line is 2 stations joined by 40 tiles of straight
  track.
- Tests: `tools.test.ts`, `traffic.test.ts`, `serialize.test.ts`,
  `determinism.test.ts` and `e2e/tools.spec.ts`.

## Steps
1. Add the kind, costs, upkeep, unlocks and the `subway` array with the format
   bump and the migration.
2. Track tool (`subway.ts`): an L-shaped drag like the road tool. It sets
   `subway = 1` on each tile not already set and charges $40 per new tile. It
   ignores the surface kind and the height, so it may pass under water,
   buildings and roads. Tiles on the map edge are refused, so track can't leave
   the map.
3. Station tool: it places a `SubwayStation` on an open land tile with a road
   on one of its edges. If the tile has no track, it also lays track there,
   charging $40. Stations are conductive and bulldozable. Bulldozing a station
   leaves the track.
4. Bulldoze in the underground view: the bulldoze drag clears `subway` tiles
   at $1 each, and it clears nothing on the surface.
5. Search layers: node `n < size²` is a surface tile, and node `size² + i` is
   the track under tile `i`. `TripSearch` buffers (`dist`, `parent`, `stamp`)
   grow to `2 × size²`. Moves:
   - surface to surface is as now;
   - underground to underground moves to the four neighbours where both tiles
     have track, at the ride cost;
   - surface ↔ underground happens only on a `SubwayStation` tile with track,
     at `TRANSFER_COST`.
   `MAX_EXPANSIONS` and `MAX_TRIP_COST` are unchanged. Destination checks use
   the surface tile only, so a trip must come up at a station.
6. Paths: `path()` maps nodes back to tile indices. `loadPath` adds traffic
   only for surface road tiles, so underground legs add none. A trip with at
   least one underground node counts as a subway rider.
7. Budget: Transit line = bus stops (phase 06) + track tiles × $1 + stations ×
   $20, times `funding.transit / 100`.
8. Underground view (`underground.ts`):
   - When `undergroundView` is on, the terrain, building, tree and network
     materials are set to transparent at opacity 0.25 with `depthWrite`
     false. When it is off, the original values come back.
   - Track is drawn as instanced cylinders 0.4 tiles below each tile's lowest
     corner height, joined between neighbouring track tiles, in emissive
     orange.
   - Stations are vertical cyan shafts from the surface down to the track.
   - Data overlays and the minimap overlay are hidden while the view is on.
   - The view is rebuilt when the mirror reports a `subway` change.
9. Trains (`subwayTrains.ts`): treat the track as a graph. For each connected
   track component that has 2 or more stations, run one marker per pair of
   consecutive stations along the component, up to 30 markers. Each marker is
   a glowing capsule that moves at 6 tiles/s and waits 2 s at stations. They
   show only in the underground view and stop while the game is paused.
10. Toolbar: Subway (drag) and Subway station in Transit, locked until City.
    Selecting either turns on the underground view, and dropping the tool turns
    it off unless V turned it on.
11. Query: a station shows "Subway station · riders M/month (city)". In the
    underground view, a track tile shows "Subway track".
12. Model: the station entrance is a small stairwell with a railing and a lit
    round sign in Tim City blue with a white "S".

## Build gate
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm e2e`
- `pnpm bench` (run locally, because it is not in CI): the monthly tick on the
  Megalopolis 256 bench city with its 6 bus lines and 4 subway lines stays within 10% of the
  number recorded in the phase 06 commit body.

## Test plan
- Unit (`tools.test.ts`): track under a building leaves the building unchanged
  and costs $40 per new tile. A station without a road beside it is refused.
  Subway is locked before City.
- Unit (`traffic.test.ts`): two districts 80 road tiles apart are linked by
  stations and 40 tiles of track. Trips between them succeed, and before the
  link they failed. The road between them carries less traffic.
- Unit: underground legs add no traffic. At 25% funding the ride cost is 1.2.
- Unit: a v5 save migrates. Save and load keeps the track.
  `determinism.test.ts` passes.
- e2e (`tools.spec.ts`): with a test city at City class, drag track and place
  two stations. The underground view turns on, and the query shows a station.
- Manual: the fade, tubes, shafts and moving markers look right in the day
  and the night, and the view turns off when the tool is dropped.

## Commit
`feat(sim): subway track, stations and underground view`

## Rollback
Revert the commit. Saves at format 6 will not load in the previous build. The
two-layer search is the riskiest change. If it regresses, revert this phase
alone; phase 06 does not depend on it.
