# Phase 20 — Title Screen, New-City Flow, Settings and Onboarding

**Depends on:** 02, 03, 04, 05, 06, 07, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19 · **Enables:** 21 (final performance tuning covers the full user flow)

## Goal
Wrap the game in a polished front door. A title screen shows a slowly orbiting sample city at dusk. The New City flow sets name, difficulty, map size, terrain sliders and seed with a live 3D preview. A settings menu controls graphics quality, audio and controls. Contextual tips teach a first-time player to build a powered, growing city in under 10 minutes without external help.

## Files touched
- `src/ui/screens/TitleScreen.tsx` — logo, "New City", "Continue" (latest autosave or slot), "Load", "Settings".
- `src/render/titleScene.ts` — loads a bundled sample city save, orbits the camera, forces dusk on the visual clock.
- `public/sample-city.timcity` — sample city built with a script (`scripts/buildSampleCity.ts`) using `runScript` from phase 02 and `serialize` from phase 14.
- `scripts/buildSampleCity.ts` — scripted city: coast, downtown, rail, airport, seaport, stadium; runs 40 game years headless and writes the save.
- `src/ui/screens/NewCityScreen.tsx` — name field, difficulty (Easy/Medium/Hard with funds shown), map size (128/256), sliders for water, forest and hills, seed field with a dice button; live preview renders on a small canvas.
- `src/render/previewScene.ts` — lightweight renderer reuse of `terrain.ts`, `water.ts` and `trees.ts` for the preview, regenerating on slider change (debounced 150 ms) through a dedicated preview worker call `generatePreview`.
- `src/shared/protocol.ts` — `generatePreview` message returning heights and tiles only.
- `src/ui/screens/SettingsWindow.tsx` — graphics quality (Low/Medium/High/Ultra: shadow map size, bloom, tilt-shift, agent caps, particle cap, pixel ratio), audio volumes from phase 19, edge-scroll toggle, mouse sensitivity, key bindings help table.
- `src/shared/settings.ts` — settings schema, defaults (High), saved to `localStorage` with try/catch and in-memory fallback.
- `src/render/agents/budget.ts` — scale the phase-16 caps by quality: Low 25%, Medium 50%, High 100%, Ultra 150%.
- `src/render/camera.ts` — edge scrolling (cursor within 8 px of the window edge pans; on by default) and a mouse sensitivity multiplier (0.5–2.0, default 1.0) for rotate and tilt.
- `src/ui/onboarding/tips.ts` — ordered tip triggers: first launch (camera controls), no power plant, plant with no lines, zones without roads, first unpowered zone, first growth, first budget window, first overlay hint when a top problem appears, first disaster.
- `src/ui/onboarding/TipBubble.tsx` — dismissible bubble anchored to the relevant toolbar button or map spot; "Don't show tips" toggle in settings.
- `src/ui/Toolbar.tsx` — every tool tooltip shows name, cost, shortcut and a one-line purpose.
- `src/ui/App.tsx` — screen router: title → new city / load → game; `Esc` opens a pause menu (Resume, Save, Load, Settings, Quit to title), except in follow mode, where `Esc` only exits follow mode (phase 16).
- `e2e/firstRun.spec.ts` — full first-run flow.

## Steps
1. Write `scripts/buildSampleCity.ts`; add `pnpm sample` to `package.json`; generate and commit `public/sample-city.timcity`.
2. Write `titleScene.ts` and `TitleScreen.tsx`.
3. Add `generatePreview` to the protocol and worker; write `previewScene.ts` and `NewCityScreen.tsx`.
4. Write `settings.ts` and `SettingsWindow.tsx`; apply quality settings to renderer, post, agents and particles.
5. Write `tips.ts` and `TipBubble.tsx`; extend tooltips.
6. Add the screen router and pause menu to `App.tsx`. Keep the `?seed=`, `?size=` and `?difficulty=` start parameters in `src/main.ts` only under `import.meta.env.DEV`; production builds always start on the title screen.
7. Write the e2e test.

## Implementation notes (changed during build)
- **Start parameters stay in production builds.** The game opens on the title screen unless the address names a city (`load`, `seed`, `size` or `new`). Shared seed links and every end-to-end test start a city straight from the address, and the New City screen starts one the same way (`?new=1&name=…&seed=…`), as loading a save already did. This replaces step 6's DEV-only rule.
- The title screen is the sample city itself: loaded into the normal renderer, paused, at golden hour (07:38 pm) in summer with clear weather, the camera slowly orbiting the built-up area. Agents keep moving; there are no autosaves, toasts or budget pop-ups in title mode.
- `scripts/buildSampleCity.ts` (`pnpm sample`) levels and clears four neighbourhood sites on a coastal map, lays roads first (grading next to a building fails), places contiguous zones so power passes lot to lot, adds services, parks, a stadium, seaport and airport, and grows the city 40½ years (so the save is in summer). Population 6,200; the gzipped save is 13 KB.
- **The New City preview runs in the existing worker** (`generatePreview` → `previewTerrain`), on a second small WebGL canvas that reuses the terrain, water and tree layers. A unit test checks it matches the map the game then starts with.
- Quality presets (`src/shared/settings.ts`) switch live: shadows on/off and map size (materials recompile), pixel ratio, the post chain (bloom, tilt-shift with vignette, SMAA — rebuilt by `PostFx.configure`), agent caps (`AGENT_SCALE`; instance buffers are sized for Ultra) and particle emission (`FX_SCALE`). `?quality=` in the address still overrides the saved setting.
- Esc order: drop the active tool, else close the open window, else toggle the pause menu (follow mode keeps its own Esc). The pause menu pauses the game and restores the speed on resume.
- Tips (`onboarding/tips.ts`) read counts the main thread gathers from the mirror every 2 s (`cityFacts`) plus store state; each shows once, in order, and hides while a menu or window is open. An extra "press Play" tip sits between powering the zones and the first residents.
- **Snow needs a December:** January to March of the founding year stay green, so a new city does not open under snow.
- Toolbar tooltips already showed name, cost, shortcut and purpose (phase 06), so `Toolbar.tsx` needed no change there.
- The tools e2e test turns tips off (the welcome tip covers the middle of the map it hovers) and allows 20 s for the first dry run while shaders compile.

## Build gate
```
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e
```

## Test plan
- `firstRun.spec.ts`: title → New City → set name and seed → Start → place plant, line, road and zones by following tips → unpause → population > 0 within 3 real minutes at fast speed.
- Preview for the same seed and sliders matches the started map (heights array equality).
- Settings persist across reload; with `localStorage` blocked, the game still runs with defaults.
- Manual usability check: one person who has not seen the game builds a powered, growing city in under 10 minutes using only in-game tips.

## Commit
`feat(ui): add title screen, new-city flow with live preview, settings, pause menu and onboarding tips`

## Rollback
Revert the commit. The game starts directly in a default city as in earlier phases. Saves and sim are unchanged.
