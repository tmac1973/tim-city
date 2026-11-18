# Phase 17 — Day/Night, Weather and Seasons

**Depends on:** 04, 05, 07, 16 · **Enables:** 18 (disaster effects look right at night and in rain), 19 (weather ambience), 20 (title screen uses a night sky)

## Goal
Give the diorama life over time. A 6-minute real-time day cycle moves the sun, shifts sky colors, and turns on building windows, street lights and vehicle headlights at night. Weather events bring rain, snow and fog. Seasons follow game months: snow cover in winter and autumn tint on trees. All of this is visual only and uses the visual RNG, so it never changes the sim.

## Files touched
- `src/render/atmosphere/clock.ts` — visual clock: one day per 6 real minutes; pauses with the game; `timeOfDay` 0–1.
- `src/render/atmosphere/sky.ts` — gradient sky dome shader with sun disk, stars at night, and horizon haze; colors keyed by `timeOfDay` from `palette.ts`.
- `src/render/lighting.ts` — sun direction and color from the clock; hemisphere light dims at night; a moon light at 15% intensity.
- `src/render/buildings/atlas.ts` — emissive window channel; shader uniform `nightFactor` lights a seeded subset of windows (more in C zones, flicker on/off over time).
- `src/render/atmosphere/streetLights.ts` — instanced lamp posts along roads at every 3rd tile; emissive heads plus a cheap additive ground glow decal at night.
- `src/render/agents/cars.ts` — headlight and taillight emissive quads at night.
- `src/render/post.ts` — `BloomEffect` with luminance threshold so only emissive surfaces glow; exposure follows the clock.
- `src/render/atmosphere/weather.ts` — state machine: clear, overcast, rain, storm, snow, fog; seeded transitions every 2–6 real minutes; snow only in game months Dec–Feb, rain more likely in Mar–May and Sep–Nov.
- `src/render/atmosphere/precipitation.ts` — GPU point particles in a box around the camera (20,000 points); rain streaks and snowflakes; splash dots on the ground.
- `src/render/atmosphere/fog.ts` — `FogExp2` density by weather; lightning flashes during storms.
- `src/render/atmosphere/seasons.ts` — terrain and tree color uniforms: snow blend Dec–Feb (melting through March), autumn tint Sep–Nov.
- `src/ui/TimeOfDayBadge.tsx` — small sun/moon icon with weather symbol in the top bar.
- `src/render/atmosphere/*.test.ts` — tests.

## Steps
1. Write `clock.ts`, `sky.ts`, and update `lighting.ts`.
2. Add the emissive window channel and `nightFactor` uniform; write `streetLights.ts`; add headlights.
3. Add bloom to `post.ts`.
4. Write `weather.ts`, `precipitation.ts`, `fog.ts` and `seasons.ts`.
5. Write `TimeOfDayBadge.tsx`.
6. Write tests.

## Implementation notes (changed during build)
- **No window atlas.** Buildings are vertex-coloured geometry, so the building kit's existing `glow` attribute carries a per-pane random value (0–1 for homes, 1–2 for shop and office glass). `atmosphere/uniforms.ts` patches the building material: a pane lights when its hash falls under 45% (homes) or 72% (commercial), re-rolled every ~23 s per building, scaled by `uNight`. The per-building seed comes from the batch matrix.
- One `patchMaterial` helper adds snow (upward faces, from the view-space normal), autumn (green-dominant colours only, so trunks stay brown) and window light to terrain, trees and buildings through shared uniforms. Roads stay clear of snow.
- **Fog stays linear.** Weather pulls the existing `Fog` near/far in (to 3/70 at full fog) and colours it with the sky horizon, instead of switching to `FogExp2`; the clear-weather diorama keeps its crisp edges.
- The shadow-casting light never drops below 0.45 elevation even when the sky's sun is low; a grazing sun pushed shadows past the shadow map and showed its edge as a hard rectangle. Dawn and dusk still colour the light and the sky.
- Unlit shaders (water, smoke) and unlit vertex-coloured overlays (zone lot fills, flood sheets) dim with a shared daylight level (`uLight`, `DAYLIT`); otherwise they glowed at night.
- No exposure change: bloom (threshold 1.1 on the HDR buffer) catches only emissives — windows, lamp heads, headlights, emergency light bars.
- No ground splash dots for rain; streaks plus fog read well enough at every zoom, and the precipitation box grows with camera distance (24–120 units) so rain shows when zoomed out.
- Lightning is a double flash of the hemisphere light and sky, using the visual RNG.
- `?time=0.9` and `?weather=rain` set the starting time of day and weather (for checks and screenshots).
- Measured: 2,400 cars, night, storm, 128 map — steady 60 fps; agent update about 0.9 ms.

## Build gate
```
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e
```

## Test plan
- `clock.test.ts`: 360 s of unpaused time is exactly one day; paused time does not advance.
- `weather.test.ts`: snow never starts outside Dec–Feb; transitions are deterministic for a fixed visual seed.
- Determinism test still passes.
- Manual: watch a full day; windows light up at dusk; street lights and headlights glow with bloom; rain and snow look right; fog thickens; frame rate stays at 60 fps on a full 128 city at night in rain.

## Commit
`feat(render): add day/night cycle, lit windows, street lights, bloom, weather and seasons`

## Rollback
Revert the commit. The scene returns to fixed daylight. No sim or save data changes.
