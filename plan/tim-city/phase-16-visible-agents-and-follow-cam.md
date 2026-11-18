# Phase 16 — Visible Agents and Street-Level Follow Camera

**Depends on:** 04, 05, 07, 08, 09, 10, 13, 15 · **Enables:** 17 (headlights at night), 18 (emergency vehicles in disasters), 19 (traffic audio scales with agent count), 21 (agent budgets)

## Goal
Fill the city with motion that tells the truth. Cars and buses drive on roads in numbers that follow the sim's traffic density. Trains run on rail. Planes take off and land at airports. Ships sail to seaports. Pedestrians walk in busy commercial blocks when the camera is close. Agents are visual only: they run on the main thread with their own RNG and never change sim state. A follow mode lets the camera ride with any vehicle at street level.

## Files touched
- `src/render/agents/roadGraph.ts` — client-side lane graph built from mirrored road tiles: two lanes per road, curves at corners, intersections with simple turn choices.
- `src/render/agents/cars.ts` — pooled cars with 6 low-poly vehicle variants (sedan, hatchback, van, truck, bus, taxi) in one `InstancedMesh` each; target car count per road 2×2 block = `floor(traffic / 64)` (0–3), read from the `traffic` field, which the main thread subscribes to permanently with phase-13 `subscribeField`; missing cars spawn and extra cars despawn once per second; despawn at random after 20–60 s; follow lanes with car-following spacing; stop briefly at intersections.
- `src/render/agents/trains.ts` — 1 train per connected rail network per 30 rail tiles (max 12); 3–5 cars; follow rail splines; slow on curves.
- `src/render/agents/planes.ts` — airports launch a plane every 20–40 s: taxi, takeoff along the runway, climb, fly off-map; landings mirror it.
- `src/render/agents/ships.ts` — seaports spawn a cargo ship every 30–60 s that sails along a water path (BFS over water tiles) from the map edge to the quay and back.
- `src/render/agents/pedestrians.ts` — only when camera distance < 30: up to 400 tiny capsule figures with walk bob along sidewalks of C zones at level ≥ 3 and around parks and the stadium.
- `src/render/agents/emergency.ts` — fire trucks drive from the nearest fire station to tiles with the `BURNING` flag (from the mirror); police cars patrol roads within 10 tiles of each police station; both use flashing light materials.
- `src/render/agents/budget.ts` — fixed global caps: cars 2,500, trains 12, planes 6, ships 6, pedestrians 400. (Phase 20 makes them scale with graphics quality.)
- `src/render/agents/visualRng.ts` — `Math.random`-free seeded RNG for agents, separate from the sim RNG.
- `src/render/camera.ts` — `follow(agent)` mode: camera sits behind and above the vehicle at street level with smoothed chase; `Esc` or any pan exits follow mode (and `Esc` does nothing else while following).
- `src/ui/FollowHud.tsx` — shows vehicle type and a "Next vehicle" button (`Tab`) while following.
- `src/render/agents/*.test.ts` — tests.

## Steps
1. Write `visualRng.ts`, `roadGraph.ts` and `budget.ts`.
2. Write `cars.ts` and `emergency.ts`; then `trains.ts`, `planes.ts`, `ships.ts`, `pedestrians.ts`.
3. Update agents in one `update(dt)` call per frame. Write instance matrices into preallocated buffers; set `instanceMatrix.needsUpdate` once per mesh.
4. Add follow mode to the camera and `FollowHud.tsx`. Clicking a vehicle with the query tool starts follow mode.
5. Write tests.

## Implementation notes (changed during build)
- **Traffic reaches the main thread on its own channel.** `TickMessage.traffic` carries the traffic field at every month start and on the first tick, so agents never compete with the overlay subscription (which stays one field at a time).
- **Car count per block is `min(3, ceil(traffic / 64))`**, not `floor`: any road in use shows at least one car. The plan's floor left quiet suburbs empty, which read as broken. `planCars` is the pure spawn/cull planner the tests use.
- Vehicles move tile by tile along quadratic lane curves (`roadGraph.ts` `Segment`), right-hand traffic 0.17 from the centre line; a `Mover` shared by cars, police and fire trucks picks exits per tile. Car-following uses per-tile buckets of last frame's positions; a car stuck over 4 s creeps forward so junctions cannot lock.
- Road vehicles draw at 1.25× and pedestrians at 1.6× true scale so they read at city zoom.
- `NetworkLayer.surfaceAt` gives the wheel height on decks, ramps and slopes, with per-tile caches cleared on any chunk rebuild. Agents in tunnels are hidden.
- Trains keep a trail of the segments they passed; cars sit at fixed distances back along it. At a dead end the train waits 2.5 s and the last car becomes the head (`reverseDirection`).
- Ships on water that never reaches the map edge sail from the farthest reachable water tile instead, so lake ports still get ships.
- Plane runways come from the same per-lot hash turn the building layer uses for the airport model.
- Police cars start from the nearest road within 3 tiles of the station (the sim's road reach). Fire trucks route by BFS from the nearest station to a road within 2 tiles of the fire, and leave once nothing burns within 3 tiles.
- Agents hold still while the game is paused.
- Follow mode: a capture-phase key handler makes Esc and Tab act only on the follow camera; pan keys also exit. The near plane drops to 0.06 while following, and tilt-shift is turned off at street level.
- Measured: about 2,400 cars on a 128 map at a steady 60 fps; the agent update takes about 0.9 ms per frame.
- **CI fixes carried in this commit:** the save window's listing ignores stale results (a slow first read overwrote the post-save list on CI); `?quality=low` turns off shadows and the blur passes, and the interaction-heavy e2e specs use it; CI runs e2e with one worker, since Chromium's software WebGL starved when browsers ran in parallel. Phase 20's quality setting builds on `quality`.

## Build gate
```
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e
```

## Test plan
- `cars.test.ts`: spawn counts per block grow with traffic value and never exceed the global cap.
- `roadGraph.test.ts`: lanes connect across a T and a cross intersection; dead ends turn around.
- Ships path only through water tiles.
- Determinism test still passes (agents do not touch sim state).
- Manual: a busy city shows heavy traffic on the roads the traffic overlay marks red; follow a train through a tunnel; follow a plane off the runway. Frame rate stays at 60 fps on a 128 city with the full agent caps.

## Commit
`feat(render): add cars, trains, planes, ships, pedestrians, emergency vehicles and follow camera`

## Rollback
Revert the commit. Agents are purely visual; removing them changes no sim or save data.
