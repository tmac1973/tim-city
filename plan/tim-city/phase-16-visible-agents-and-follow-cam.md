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
