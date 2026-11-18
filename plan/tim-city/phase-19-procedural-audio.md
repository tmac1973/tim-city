# Phase 19 — Procedural Audio and Generative Music

**Depends on:** 04, 05, 06, 07, 11, 12, 15, 16, 17, 18 · **Enables:** 20 (audio settings in the settings menu)

## Goal
Add sound with zero audio files. All effects, ambience and music are synthesized with the Web Audio API. UI and construction sounds give feedback. The city has an ambient bed that follows camera position, traffic, time of day and weather. Disasters have sirens, rumbles and roars. A calm generative soundtrack plays in the background.

## Files touched
- `src/audio/engine.ts` — single `AudioContext` (resumed on first user input), master, music, SFX and ambience buses with gain nodes; a compressor on the master.
- `src/audio/synth.ts` — building blocks: oscillators with ADSR envelopes, filtered noise, FM bells, simple convolution reverb from a generated impulse.
- `src/audio/sfx.ts` — named sounds: `click`, `place`, `bulldoze`, `cannotPlace`, `coin`, `zoneGrow` (soft chime), `milestone` (fanfare arpeggio), `budgetOpen`.
- `src/audio/ambience.ts` — layers mixed by camera height and focus: traffic hum (noise through a low-pass, gain from visible car count), birds by day near trees, crickets at night, wind on hills, surf near coast, rain and thunder from weather state.
- `src/audio/disasterAudio.ts` — siren (two-tone oscillator with Doppler from emergency vehicle position), fire crackle, tornado roar, quake rumble (sub-bass noise), explosion, Mirebeast roar (formant-filtered noise sweep).
- `src/audio/music.ts` — generative soundtrack: pentatonic scales, chord progressions chosen by the visual RNG, soft pad plus plucked melody plus light percussion; tempo 70–90 BPM; mood shifts with time of day and approval rating; scheduled 2 bars ahead with `AudioContext.currentTime`.
- `src/audio/positional.ts` — `PannerNode` placement for world-positioned sounds relative to the camera.
- `src/main.ts` — wires events (tool results, sim events, agent counts, weather, fx events) to audio.
- `src/ui/store.ts` — volume signals `master`, `music`, `sfx`, `ambience`, and `muted`; `M` toggles mute.
- `src/audio/*.test.ts` — tests with a mocked `AudioContext`.

## Steps
1. Write `engine.ts`, `synth.ts` and `positional.ts`.
2. Write `sfx.ts` and connect tool, budget and milestone events.
3. Write `ambience.ts` and connect agent counts, weather and clock.
4. Write `disasterAudio.ts` and connect fx events.
5. Write `music.ts`.
6. Add volume signals; settings UI comes in phase 20, so `M` is the only control here.
7. Write tests.

## Build gate
```
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e
```

## Test plan
- `music.test.ts`: scheduler never schedules notes in the past; notes stay inside the current scale.
- `engine.test.ts`: muting sets master gain to 0; buses connect in the right order.
- Manual: place roads and zones and hear feedback; zoom to a busy street and hear traffic; zoom out and hear wind; at night hear crickets; trigger a fire and hear sirens move with the fire truck; music plays without clicks or gaps for 30 minutes.

## Commit
`feat(audio): add synthesized SFX, city ambience, disaster audio and generative music`

## Rollback
Revert the commit. The game is silent again. No sim or save data changes.
