# Phase 08 — Trip Generation and Traffic Density

**Depends on:** 02, 05, 06 · **Enables:** 09 (traffic feeds pollution and land value), 12 (traffic complaints), 13 (traffic overlay), 16 (visible cars sample the density)

## Goal
Simulate traffic the way the overview decided: each zone generates trips to suitable destinations over the road and rail graph, and successful paths add load to a traffic density grid. Zones that cannot reach destinations do not grow. Rail carries trips with lower load and no pollution. Heavy traffic slows growth and raises pollution.

## Files touched
- `src/sim/graph.ts` — transport graph built from road and rail tiles; nodes at tiles; edge cost road 1, rail 0.4, road-rail transfer 2 (only at rail stations, i.e. any rail tile adjacent to a road). Rebuilt incrementally when network tiles change.
- `src/sim/systems/traffic.ts` — trip generation and A* search.
- `src/sim/tools/index.ts` — after any tool changes road or rail tiles, call `graph.patch(changedTiles)`.
- `src/sim/state.ts` — add `blockFields.traffic` (2×2 blocks, 0–255) and per-zone `tripOk` flags.
- `src/sim/systems/zones.ts` — growth requires `tripOk`; `localBonus` subtracts `traffic / 8` at the zone.
- `src/sim/tools/query.ts` — add traffic value.
- `src/sim/systems/traffic.test.ts` — tests.

## Steps
1. Write `graph.ts`. Keep an adjacency list keyed by tile index; patch it from the tool handler when network tiles change.
2. Write `traffic.ts`. Each month, every zone center runs one trip on a tick spread by `zoneIndex % 16`:
   - R → nearest reachable C or I within 60 path cost.
   - C → nearest reachable R.
   - I → nearest reachable R, or the map edge (exports).
   - Start and goal are road or rail tiles touching the footprints.
3. A* uses a binary heap and a max expansion of 4,000 nodes. On success, add `density × 4` to the traffic value of every road tile's 2×2 block on the path (rail tiles add nothing). On failure, clear `tripOk`.
4. Decay every traffic value by 25% per month before new trips add load, so traffic follows the current city.
5. Update `zones.ts` to use `tripOk` and the traffic penalty.
6. Write tests.

## Implementation notes (changed during build)
- **Nearest-destination search is uniform-cost (Dijkstra), not A\*.** A\* needs one known goal; a trip looks for whichever reachable destination is closest. The search reuses typed-array buffers and a binary heap, and stops at 60 cost or 4,000 expansions as planned.
- **No stored graph.** `src/sim/graph.ts` reads neighbours straight from tile kinds (road 1, rail 0.4, road↔rail transfer 2), so it can never go stale and needs no patching from the tool handler. Phase 09's potholes become a cost multiplier there.
- **Trip ends.** Any road or rail tile within the 3-tile road reach of a lot serves that lot (a per-month service map); map-edge roads count as export destinations for industry.
- A trip adds its load **once per 2×2 block** it drives through. `TRIP_FAILED` is a tile flag on the zone centre (default clear, so new zones may grow before their first trip).
- Homes now need a reachable job or shop zone to grow, as the classic rules intend; the phase 06 growth test gained an industrial zone up the road.

## Build gate
```
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e
```

## Test plan
- `traffic.test.ts`: an R zone linked by road to a C zone gets `tripOk`; an isolated R zone does not; a long road corridor shows rising traffic along the path; adding a parallel rail line lowers the road traffic on that corridor.
- Performance test: 1,000 zones on a 256 map finish a full month of trips in under 40 ms total in Node.
- Determinism test with a scripted city stays byte-identical.
- Manual: query a busy road and see a high traffic value.

## Commit
`feat(sim): add road/rail trip generation, A* pathing and traffic density`

## Rollback
Revert the commit. `zones.ts` returns to phase-06 behavior (no trip requirement).
