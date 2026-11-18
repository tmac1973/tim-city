# Phase 18 — Cinematic Disaster Effects

**Depends on:** 04, 05, 07, 12, 15, 16, 17 · **Enables:** 19 (audio cues sync to effect events), 20 (title screen sample city can show a tornado), 21 (particle budgets)

## Goal
Replace the functional disaster visuals from phase 15 with cinematic ones. Fire uses particles that spread with the sim. A tornado has a twisting funnel that throws debris. Flood water rises and recedes smoothly. Earthquakes shake the camera. Plane crashes and shipwrecks have impact effects. Meltdowns glow. The Mirebeast gets a full animated model. All effects follow sim state; they never drive it.

## Files touched
- `src/render/fx/particles.ts` — one GPU particle system (instanced billboards, ring buffer of 30,000 particles) with emitters; shared by all effects.
- `src/render/fx/fire.ts` — flame and smoke emitters on each burning tile; ember sparks; orange point-light pool (max 8 nearest lights); charred building tint as tiles burn.
- `src/render/fx/tornado.ts` — funnel mesh from a twisted, scrolling-noise shader cylinder; dust ring at the base; debris particles; follows the sim path with interpolation between ticks.
- `src/render/fx/flood.ts` — water surface plane per flooded region whose height eases between ticks; murky color; ripple rings.
- `src/render/fx/quake.ts` — camera shake (trauma model, decays) scaled by distance to epicenter; dust bursts on rubble tiles; ground crack decals.
- `src/render/fx/impact.ts` — plane crash: falling plane mesh, explosion flash, smoke column; shipwreck: tilted sinking ship, oil slick decal.
- `src/render/fx/meltdown.ts` — bright flash, mushroom of steam, then a pulsing green glow and drifting particles over radiation tiles.
- `src/render/fx/mirebeast.ts` — skinned low-poly Mirebeast built in code (bones for legs, tail, jaw); walk cycle, roar animation, water drips on emergence; footfall dust; buildings in its path crumble with debris.
- `src/render/fx/cameraEvents.ts` — when a disaster starts, a toast offers "Watch" which flies the camera to it.
- `src/render/disasterBasic.ts` — deleted; its users switch to the new modules.
- `src/render/fx/*.test.ts` — tests.

## Steps
1. Write `particles.ts` with a single draw call per blend mode (additive and alpha).
2. Write each effect module with the interface `{ onSimUpdate(disasters, tiles), update(dt), dispose() }`.
3. Build the Mirebeast skeleton and animation in code with `THREE.Skeleton` and `SkinnedMesh`.
4. Remove `disasterBasic.ts` and route disaster state to the new modules.
5. Add `cameraEvents.ts`.
6. Write tests.

## Implementation notes (changed during build)
- **Particles:** two instanced systems (additive, alpha) plus a third additive one drawn without a depth test for big flashes, which otherwise clipped into the ground. Particles are animated entirely in the vertex shader from per-particle start values; the ring buffer only uploads the slots written that frame. Each system draws only the slots in use and none at all once every particle is dead: drawing all 30,000 idle slots cost about 230 ms per frame under software GL (CI).
- **No point lights for fire.** Each burning tile gets an additive, flickering glow pool on the ground instead; real point lights would add per-fragment cost to every lit material all the time. Flame emission is budgeted (2,400 per second across all fires) so a huge fire thins out rather than slowing down.
- Burning buildings are scorched dark through their batch colour until they fall. A dust burst marks every tile that turns to rubble (any cause), which also gives nearby collapses a small camera jolt.
- Flood water: one sheet per flooded tile, with per-vertex flood and drain times so it rises and sinks smoothly in the shader; drained tiles leave the mesh once their water has sunk.
- The modules are `fx/tiles.ts` (rubble, fire, flood, radiation glow and motes), `tornado.ts`, `mirebeast.ts`, `impacts.ts` (plane crash, shipwreck with oil slick, meltdown flash and mushroom, quake cracks), `quake.ts` (trauma shake) and `fx/index.ts`, rather than one file per disaster.
- The Mirebeast is a `SkinnedMesh` with 15 bones and rigid skinning (each box follows one bone): four-legged walk, tail sway, a roar every 6–11 s, drips while it rises or sinks, dust at each footfall.
- **`cameraEvents.ts` lives in `src/ui/`**, since it uses the toast store. A disaster the player triggers from the menu still flies the camera there; a random one shows a "Fire!"-style toast with a Watch button. Toasts gained an optional action button.
- `e2e/disasters.spec.ts` places a nuclear plant, airport and seaport through the debug handle (all dry runs sent at once — one per frame takes minutes under software GL), then triggers every enabled disaster from the menu.
- Measured: 21 tiles burning at night on the starter city, 60 fps; tornado, crash, meltdown and Mirebeast all hold 60 fps on this machine.

## Build gate
```
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e
```

## Test plan
- `particles.test.ts`: the ring buffer never exceeds 30,000 live particles.
- `quake.test.ts`: shake trauma decays to zero.
- `e2e/disasters.spec.ts`: trigger each disaster from the menu; no console errors; the page keeps rendering.
- Manual: trigger each disaster by day and by night; check that the effects match the sim tiles; frame rate stays at 45 fps or better during a large fire on a full 128 city.

## Commit
`feat(render): add cinematic particle fire, tornado, flood, quake, impacts, meltdown and Mirebeast`

## Rollback
Revert the commit. This restores `disasterBasic.ts` and its functional visuals. No sim or save data changes.
