# Phase 21 — Performance, 256 Maps and Public Release

**Depends on:** 01–20 · **Enables:** the public 1.0 release

## Goal
Prove and meet every success criterion. Build a repeatable benchmark, then tune rendering and the sim until a 100,000+ population 128 city holds 60 fps and a 256 city holds 30 fps or better on the reference laptop. Confirm cross-browser behavior, load time and determinism. Tag and deploy version 1.0.

## Files touched
- `scripts/buildBenchCities.ts` — scripted headless cities: `bench-128.timcity` (≥ 100,000 population) and `bench-256.timcity` (≥ 250,000 population), written to `public/bench/`.
- `src/main.ts` — in all builds (the one deliberate exception to the phase-20 rule that production starts on the title screen), `?bench=<file>` loads `public/bench/<file>.timcity` directly, sets fast speed, and forces night and rain.
- `src/render/atmosphere/clock.ts` — `forceTimeOfDay(t)` for the bench.
- `src/render/atmosphere/weather.ts` — `forceWeather(kind)` for the bench.
- `e2e/bench.spec.ts` — loads each bench city via `?bench=` with agents at full caps; records frame times for 60 s via `requestAnimationFrame`; writes `bench-results.json`; fails if the 128 median is above 16.7 ms on the reference machine profile.
- `package.json` — scripts `bench:cities` and `bench` (Chromium only, headed, GPU on; run manually on the reference laptop, not in CI).
- `src/render/lod.ts` — distance LOD: buildings swap to a simplified box variant beyond 120 units; agents beyond 150 units are culled; pedestrians only below 30 units (already in phase 16).
- `src/render/culling.ts` — per-chunk frustum culling for terrain, water, networks and building instance ranges (bounding boxes per chunk).
- `src/render/lighting.ts` — shadow map fitted tighter to the visible frustum; shadow updates every 2nd frame on Medium and below.
- `src/render/buildings/instances.ts` — batch dirty-chunk rebuilds to at most 4 chunks per frame.
- `src/sim/worker.ts` — measure and log each system's time per tick in dev builds (logging only; timing never changes sim behavior).
- `src/sim/systems/traffic.ts` and `src/sim/scheduler.ts` — on 256 maps, always spread trips over 2 months (zone index modulo 32 across ticks). The split depends only on map size, so determinism holds. To keep traffic levels equal to 128 maps, each successful trip on a 256 map adds double load (`density × 8`) to its path.
- `src/sim/systems/traffic.ts` — cache paths per (source zone, goal) for 3 months unless the graph changed in their region.
- `src/render/quality.ts` — auto-quality: if the 5-second rolling median exceeds 20 ms, drop one quality tier once and show a toast; the player can override in settings.
- `vite.config.ts` — manual chunks: `three` + `postprocessing` in one vendor chunk; audio and fx loaded lazily after the first frame.
- `e2e/crossBrowser.spec.ts` — the first-run flow, save/load and disaster menu in Chromium, Firefox and WebKit.
- `e2e/loadTime.spec.ts` — throttled "Fast 4G"-like profile in Chromium; the title screen is interactive in under 5 s.
- `src/sim/determinism.test.ts` — extend to a 50-game-year scripted city using every tool and a triggered disaster.
- `README.md` — feature list, controls, how to build and run, link to the live site, credits for the open-source libraries used.
- `.github/workflows/ci.yml` — on tag `v*`, deploy to Pages as the release.

## Steps
1. Write `buildBenchCities.ts` and generate the bench saves.
2. Write `bench.spec.ts`; run it on the reference laptop to get a baseline.
3. Implement `culling.ts`, `lod.ts`, the shadow change and chunk-rebuild batching, each as its own commit. Re-run the benchmark after each and record the median in the commit message.
4. Add worker tick timing, the fixed 256-map traffic split and the traffic path cache; confirm the determinism test still passes after the cache (the cache must not change results — invalidate on any graph change in the path's chunks).
5. Write `quality.ts` and the Vite chunking.
6. Write `crossBrowser.spec.ts` and `loadTime.spec.ts`; fix any browser-specific failures.
7. Extend the determinism test to 50 years.
8. Update `README.md`; tag `v1.0.0`; push; confirm the release deploy.

## Build gate
```
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e
```
On the reference laptop: `pnpm bench` passes (128 median ≤ 16.7 ms; 256 median ≤ 33.3 ms).

## Test plan
- Run `pnpm bench` on the reference laptop (Intel Iris Xe or Apple M1 class) and attach `bench-results.json` to the release notes.
- Cross-browser, load-time and 50-year determinism tests pass.
- Walk through each success criterion in `overview.md` on the live site and record the result in the release notes.

## Commit
`perf: add culling, LOD, auto-quality and sim tick splitting; release v1.0.0`

## Rollback
Each optimization is a separate commit inside this phase, so a regression reverts only that commit. The release tag can be deleted and the previous Pages deploy restored by re-running the workflow on the earlier commit.
