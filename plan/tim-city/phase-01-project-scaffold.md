# Phase 01 — Project Scaffold and Toolchain

**Depends on:** nothing · **Enables:** every later phase (build, test, lint and deploy pipeline)

## Goal
Create an empty but fully wired TypeScript project. It builds with Vite, renders a Preact root over a Three.js canvas, runs unit and browser tests, and deploys to GitHub Pages on every push to `main`. After this phase, every later phase only adds code; it never has to touch tooling again.

## Files touched
- `package.json` — pnpm project; scripts `dev`, `build`, `preview`, `lint`, `typecheck`, `test`, `e2e`; dependencies `three`, `postprocessing`, `preact`, `@preact/signals`, `idb`; dev dependencies `typescript`, `vite`, `@preact/preset-vite`, `vitest`, `@playwright/test`, `eslint`, `typescript-eslint`, `@types/three`.
- `pnpm-lock.yaml` — lockfile.
- `tsconfig.json` — `strict: true`, `noUncheckedIndexedAccess: true`, `target: ES2022`, `jsx: react-jsx`, `jsxImportSource: preact`, path alias `@/*` → `src/*`.
- `vite.config.ts` — Preact preset, `base: '/tim-city/'` for GitHub Pages, worker format `es`.
- `vitest.config.ts` — Node environment, includes `src/**/*.test.ts`.
- `playwright.config.ts` — projects for Chromium, Firefox and WebKit; `webServer` runs `pnpm preview`.
- `eslint.config.js` — flat config with `typescript-eslint` strict rules.
- `index.html` — single `<div id="app">` and `<canvas id="scene">`.
- `src/main.ts` — entry; creates the renderer stub and mounts the UI.
- `src/render/renderer.ts` — creates a `THREE.WebGLRenderer` on `#scene`, clears to sky blue, resizes with the window.
- `src/ui/App.tsx` — Preact root showing the text "Tim City".
- `src/shared/version.ts` — exports `GAME_VERSION = '0.1.0'`.
- `src/shared/version.test.ts` — trivial Vitest test so the test gate is live.
- `e2e/smoke.spec.ts` — loads the page, asserts the canvas exists and no console errors.
- `.github/workflows/ci.yml` — on push and PR: install, lint, typecheck, test, build, e2e; on push to `main` it also uploads `dist/` and deploys with `actions/deploy-pages`.
- `.gitignore`, `README.md` — standard ignores; one-paragraph project description and dev commands.

## Steps
1. Run `git init` in `/home/tim/Projects/tim_city`, create the GitHub repository `tim-city`, and set it as `origin`.
2. Run `pnpm init` and add the dependencies listed above at their current stable versions.
3. Write `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts` and `eslint.config.js` as described.
4. Write `index.html`, `src/main.ts`, `src/render/renderer.ts`, `src/ui/App.tsx` and `src/shared/version.ts`.
5. Make the canvas fill the window. Put the Preact root in an absolutely positioned layer above it with `pointer-events: none`; child panels set `pointer-events: auto`.
6. Write the unit test and the Playwright smoke test.
7. Run `pnpm exec playwright install --with-deps`.
8. Write `.github/workflows/ci.yml`. Enable GitHub Pages with source "GitHub Actions" in the repository settings.
9. Commit and push. Confirm the Pages URL shows the sky-blue canvas and the title text.

## Build gate
```
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e
```
The CI workflow passes on GitHub.

## Test plan
- `pnpm test` runs the version test and passes.
- `pnpm e2e` passes in Chromium, Firefox and WebKit.
- Open the deployed GitHub Pages URL. The page shows a sky-blue canvas and "Tim City", and the console has no errors.

## Commit
`chore: scaffold Vite + TypeScript + Three.js + Preact project with CI and Pages deploy`

## Rollback
Delete the repository contents. Nothing else depends on this phase yet. Partial application is not useful; finish or revert the whole phase.
