# Phase 11 — Budget, Taxes, Bonds and Difficulty

**Depends on:** 02, 05, 06, 09 · **Enables:** 12 (tax complaints, approval), 14 (settings saved with the city), 15 (difficulty sets disaster rate), 20 (new-city settings)

## Goal
Make money matter. Tax income depends on population and land value. Service and road funding cost money each year. The yearly budget window lets the player set the tax rate and funding. Municipal bonds give a loan with interest. Running out of money leads to bankruptcy. Difficulty sets starting funds, tax sensitivity and the disaster rate.

## Files touched
- `src/shared/difficulty.ts` — `Easy { funds: 20000, taxSensitivity: 0.7, disasterRate: 0.5 }`, `Medium { 10000, 1.0, 1.0 }`, `Hard { 5000, 1.3, 1.5 }`.
- `src/shared/protocol.ts` — `init` gains `difficulty` (default `Medium`); `tick` gains `taxRate`, `funding`, `bonds` and the `ledger`.
- `src/sim/worker.ts` — reads starting funds from the difficulty on `init`.
- `src/sim/state.ts` — `taxRate` (0–20, default 7), `difficulty`, `randomDisasters: boolean` (default true), `bonds: { principal, rate, yearsLeft }[]`, `ledger` (this year's income and costs by line).
- `src/sim/systems/budget.ts` — at year end: income = Σ over zones of `population/jobs × landValue × taxRate × 0.002` (rounded); costs = roads (`roadTiles × $1 + railTiles × $2`) × road funding, police stations × $100 × police funding, fire stations × $100 × fire funding, bond payments. Funds update and a `yearBudget` event carries the ledger.
- `src/sim/systems/demand.ts` — tax term uses `(taxRate − 7) × 30 × taxSensitivity`.
- `src/sim/commands.ts` — `setTaxRate`, `setFunding`, `issueBond`, `repayBond`, `setRandomDisasters`.
- `src/sim/systems/bonds.ts` — bond: $10,000 principal at an interest rate of `5% + 1% per outstanding bond`, 10-year term, max 5 bonds; early repayment allowed.
- `src/sim/systems/bankruptcy.ts` — if funds are negative at year end, auto-issue a bond if possible; if not, emit `bankrupt` and set the game to a "city lost" state.
- `src/ui/BudgetWindow.tsx` — opens at year end (pauses the game); tax slider, three funding sliders, income/cost table with last year's actuals and next year's estimate, bond list with issue/repay buttons. Also opens from the top bar at any time.
- `src/ui/GameOver.tsx` — bankruptcy screen with "Start new city" (reloads with a fresh seed) and "Keep watching" options.
- `src/ui/store.ts` — budget signals.
- `src/sim/systems/budget.test.ts` — tests.

## Steps
1. Write `difficulty.ts`. Extend `protocol.ts` and `worker.ts` so `init` carries the difficulty and starting funds come from it. `src/main.ts` reads `?difficulty=` (`easy`, `medium`, `hard`) until phase 20 adds the New City screen.
2. Extend state and commands.
3. Write `budget.ts`, `bonds.ts` and `bankruptcy.ts`. Run budget on the `yearEnd` event.
4. Update `demand.ts` with the tax term.
5. Write `BudgetWindow.tsx` and `GameOver.tsx`.
6. Write tests.

## Implementation notes (changed during build)
- Bond instalments are straight-line: each year pays principal ÷ years left plus interest on what is still owed ($10,000 at 5% costs $12,750 in total). Rates are whole percent (5% + 1% per bond already out).
- The worker sends a live `BudgetInfo` (settings, bonds, last year's books, next year's estimate, construction so far) with every tick, so the window updates as sliders move, even while paused.
- The window pauses the game while open and restores the speed after; an "Open every year end" checkbox (stored per browser) turns the automatic pop-up off, leaving a year-end toast and the top-bar Budget button.
- Bankrupt cities stop accepting construction; the game-over screen offers "Keep watching" or a new city on a fresh seed.
- `?difficulty=easy|medium|hard` selects the preset until phase 20's New City screen.

## Build gate
```
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e
```

## Test plan
- `budget.test.ts`: a known city yields the expected income at 7% and 14%; 50% police funding halves police cost; bond interest accrues correctly over 10 years; negative funds auto-issue a bond; negative funds with 5 bonds emit `bankrupt`.
- Difficulty test: Easy, Medium and Hard start with $20,000, $10,000 and $5,000.
- `e2e/budget.spec.ts`: run to year end; the budget window appears; changing tax updates the estimate.
- Determinism test passes.

## Commit
`feat: add yearly budget, taxes, service funding, municipal bonds, bankruptcy and difficulty`

## Rollback
Revert the commit. Funds return to construction-cost-only behavior. `funding` stays at its phase-09 default of 100%.
