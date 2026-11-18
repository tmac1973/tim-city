# Tim City

An original 3D city builder that runs in the browser. Zone land, run power and transit, balance the budget, and keep your citizens happy while a low-poly diorama city grows around you. Built with TypeScript, Three.js and Preact. The project plan lives in [`plan/tim-city/`](plan/tim-city/overview.md).

## Development

```bash
pnpm install
pnpm dev        # start the dev server
pnpm lint       # ESLint
pnpm typecheck  # tsc --noEmit
pnpm test       # Vitest unit tests
pnpm build      # production build into dist/
pnpm e2e        # Playwright tests in Chromium, Firefox and WebKit
```

Run `pnpm exec playwright install --with-deps` once before the first `pnpm e2e`. WebKit tests always run in CI. Locally they run only with `PW_WEBKIT=1`, because Playwright's WebKit build needs Ubuntu system libraries.
