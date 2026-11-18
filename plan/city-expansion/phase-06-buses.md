# Phase 06 — Bus stops and buses

**Depends on:** 01, 04 · **Enables:** 07 (it shares the Transit category and
the search changes), 08

## Goal
Players place bus stops beside roads. Each month the sim links every pair of
stops within 12 road tiles and marks the road tiles on the path between them
as bus lanes. A trip whose lot has a stop within 4 tiles drives bus lanes at a
lower cost, and it adds only 25% of its normal load to those blocks. Buses
appear as agents that drive between linked stops, and the player can follow
them. Bus stops are available from the start.

| Item | Value |
|---|---|
| Kind | `BusStop` 27, a 1×1 tile in the transport range |
| Cost | $150 |
| Upkeep | $5 a month per stop, on the Transit line |
| Link distance | 12 road tiles |
| Boarding distance | 4 tiles, Chebyshev, from the lot edge |
| Bus-lane step cost | `1 − 0.4 × funding.transit / 100`, which is 0.6 at full funding |
| Bus-lane load | 25% of the normal car load |

## Files touched
- `src/shared/tiles.ts`: the `BusStop` kind (1×1 footprint). It is not a
  road. `isTransportKind` stays false for it.
- `src/shared/costs.ts`: `COSTS.busStop` and `UPKEEP.busStop`.
- `src/shared/protocol.ts`: the `busStop` `ToolId`, census `busRiders` and
  `busStops`, and the `busLinks: [number, number][]` stop-pair list for the
  renderer.
- `src/sim/state.ts`: `busLane: Uint8Array` (size × size) and
  `busLinks: [number, number][]`. Neither is saved; both are rebuilt.
- `src/sim/systems/transit.ts` (new): `buildBusLanes(state)` and the exported
  constants `BUS_LINK_TILES = 12`, `BUS_BOARD_TILES = 4`,
  `BUS_LANE_DISCOUNT = 0.4` and `BUS_LOAD_SHARE = 0.25`. `graph.ts` and
  `traffic.ts` import them.
- `scripts/buildBenchCities.ts`: add 6 bus lines to the Megalopolis 256
  bench city. A bus line is 8 stops, 10 road tiles apart, along one road.
- `src/sim/systems/traffic.ts`: call `buildBusLanes` at tick 0, after
  `buildServiceMap`. Add a `bus` flag on a search. Apply the bus-lane cost and
  load.
- `src/sim/graph.ts`: `stepCost` takes `bus: boolean` and returns the bus-lane
  cost when both tiles are bus lanes.
- `src/sim/serialize.ts`: call `buildBusLanes` after `deserialize`, so a city
  loaded mid-month routes the same as a city that kept running.
- `src/sim/systems/budget.ts`: Transit line = stops × $5 ×
  `funding.transit / 100`.
- `src/sim/systems/census.ts`: count stops and riders.
- `src/sim/tools/place.ts`: bus stop placement.
- `src/ui/Toolbar.tsx`: a new Transit category with Bus stop.
- `src/ui/QueryPanel.tsx`: the stop info.
- `src/render/overlays.ts`: the `transit` overlay shows bus lanes.
- `src/render/buildings/services.ts`: the bus shelter model.
- `src/render/agents/buses.ts` (new), `src/render/agents/models.ts` and
  `src/render/agents/index.ts`: the bus agents.
- `src/render/agents/budget.ts`: buses count toward the car agent cap.
- `src/ui/FollowHud.tsx`: a "Bus" label for followed buses.
- Tests: `traffic.test.ts`, a new `transit.test.ts`, `tools.test.ts`,
  `src/render/agents/buses.test.ts` and `e2e/tools.spec.ts`.

## Steps
1. Add the kind, cost and upkeep. Placement: the stop needs open land that
   shares an edge with a road tile. It is conductive and bulldozable. It needs
   no power.
2. `buildBusLanes(state)`:
   - Clear `busLane` and `busLinks`.
   - Collect the stops in map order. For each stop, find its entry road: the
     first road neighbour in the order west, east, north, south.
   - From each stop's entry road, run a breadth-first search over road tiles up
     to 12 steps.
   - For every other stop whose entry road is reached, and only for pairs with
     a lower index first, walk the parent chain and set `busLane = 1` on each
     tile. Push the pair to `busLinks`.
   The search buffers are reused across stops, as `TripSearch` reuses its
   buffers.
3. Bus trips: in `runTrip`, a trip is a bus trip if any `BusStop` tile lies
   within the lot's reach box widened to 4 tiles from the lot edge. Pass
   `bus` into `TripSearch.find` and from there into `stepCost`.
4. `stepCost(state, a, b, bus)`: if `bus` and both tiles have `busLane`, the
   road cost is the bus-lane cost from the table. Potholes still double it.
   Rail and transfer costs are unchanged.
5. Load: in `loadPath`, a road tile with `busLane` on a bus trip adds
   `load × 0.25`, rounded down and at least 1 when the load is above 0. A
   block takes the highest load of its tiles in that trip, once, so the
   existing once-per-block rule still holds.
6. Riders: a bus trip whose path has at least one bus-lane tile counts as one
   rider in `census.busRiders`. The value resets monthly at tick 0.
7. Budget: as in Files touched. At 0% funding the lanes still exist, with a
   step cost of 1, the same as a car, but the 25% load rule remains. That
   keeps the effect simple: funding sets only the speed.
8. Query on a stop: "Bus stop · linked to N stops · city bus riders M/month".
   Query on a road with a bus lane adds "Bus route".
9. Overlay `transit`: bus lanes in yellow and stops as dots. Phase 07 adds
   subways to this overlay.
10. Renderer, in `buses.ts`. Build on `cars.ts` and `roadGraph.ts`:
    - For each link in `busLinks`, up to 40 links taken in list order, keep
      one bus. It drives the road path between the two stops, waits 3 s at
      each stop, and turns back.
    - The bus is a yellow box model 1.6 times the length of a car, with
      windows.
    - Buses use the existing render agent budget in
      `src/render/agents/budget.ts` and count as cars for the quality caps.
    - Buses register with the follow-cam like cars, and the HUD shows "Bus".
    - Buses stop moving while the game is paused, as cars do.
11. Model: a small glass shelter with a roof and a blue sign, facing the road.

## Build gate
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm e2e`

## Test plan
- Unit (`transit.test.ts`): two stops 10 road tiles apart are linked, and the
  path tiles are marked. At 13 tiles they are not linked. The result is
  deterministic.
- Unit (`traffic.test.ts`): on a congested test road, adding stops at both ends
  lowers the traffic field on that road by at least 50% after 3 months. A trip
  from a lot more than 4 tiles from any stop sees normal costs.
- Unit: a trip with a destination at road cost 65 (over `MAX_TRIP_COST` 60) is
  reachable when a bus lane covers 30 tiles of the path.
- Unit: a save loaded mid-month gives the same next-month state as an unbroken
  run (`determinism.test.ts`).
- Unit (`budget.test.ts`): 10 stops cost $50 a month at full funding.
- Unit (`buses.test.ts`): a bus follows its link path and turns back at the
  ends.
- e2e: place two stops on a road. The query panel shows "linked to 1 stop",
  and a bus agent appears.
- Manual: follow a bus with the follow-cam.
- Bench (local): run `pnpm bench` on the bench city with its 6 bus lines, and
  record the frame time and monthly tick in
  the commit body. Phase 07 compares against these numbers.

## Commit
`feat(sim): bus stops, bus lanes and visible buses`

## Rollback
Revert the commit. There is no format bump: bus lanes are rebuilt, not saved.
A save that contains `BusStop` tiles would show unknown tiles in the previous
build.
