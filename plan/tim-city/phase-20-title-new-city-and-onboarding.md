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
