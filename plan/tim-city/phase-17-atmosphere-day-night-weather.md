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
