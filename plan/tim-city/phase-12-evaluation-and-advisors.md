# Phase 12 — Evaluation, History, News and Advisors

**Depends on:** 04, 05, 06, 08, 09, 10, 11 · **Enables:** 13 (history graphs), 14 (history saved), 15 (disaster news), 20 (milestone onboarding hints)

## Goal
Tell the player how the city is doing and why. The sim computes mayor approval, an opinion poll, the top problems, a city score and the city class. It keeps history buffers for graphs. A news ticker reports events. The advisor panel names the cause of each top problem and the map location where it is worst, with a button that flies the camera there.

## Files touched
- `src/sim/systems/evaluation.ts` — yearly problem scores, each 0–100:
  - crime = mean crime over populated blocks / 2.55;
  - pollution = mean pollution over populated blocks / 2.55;
  - housing cost = mean land value of R blocks with density ≥ 5 / 2.55;
  - taxes = `max(0, taxRate − 7) × 8`;
  - traffic = mean traffic over road blocks / 2.55;
  - unemployment = `max(0, 1 − E) × 100`;
  - fires = share of populated blocks with `fireCover < 64` × 100, plus 2 per tile burned this year, capped at 100.
  
  Approval = `clamp(100 − (0.5 × top1 + 0.3 × top2 + 0.2 × top3), 0, 100)`. City score (0–1,000) = `approval × 5 + min(250, max(0, yearly population growth %) × 25) + mean(policeCover, fireCover over populated blocks) / 255 × 250`. Poll = top 4 problems; the percent of citizens naming each = its score / sum of the top-4 scores × 100.
- `src/sim/systems/cityClass.ts` — Village < 2,000; Town < 10,000; City < 50,000; Capital < 100,000; Metropolis < 500,000; Megalopolis ≥ 500,000. Emits `milestone` on promotion.
- `src/sim/systems/history.ts` — ring buffers: monthly for 10 years and yearly for 120 years, for population, R/C/I counts, funds, crime, pollution, traffic, approval, score.
- `src/sim/systems/hotspots.ts` — one fixed rule per problem, each returning tile `x, y` and a cause sentence:
  - crime → worst crime block; cause "No police coverage" when `policeCover < 64`, else "Low land value".
  - pollution → worst pollution block; cause names the largest source kind within 6 tiles (industry, power plant, road traffic, airport, seaport).
  - housing cost → highest land-value R block; cause "Land value too high for residents".
  - taxes → the R zone that lost the most density this year, measured against `state.densityAtYearStart` (a `Uint8Array(size²)` snapshot of zone-center densities that `evaluation.ts` takes at each `yearEnd`, added to `src/sim/state.ts` in this phase); cause "Residents leaving over taxes".
  - traffic → worst traffic block; cause "Road over capacity" (traffic value > 200), with a hint to add rail when none is within 5 tiles.
  - unemployment → the populated R zone farthest by path from any C or I zone; cause "Not enough jobs nearby".
  - fires → the most populated block with `fireCover < 64`; cause "No fire coverage".
- `src/sim/systems/news.ts` — news events from sim events: milestones, demand caps, brownouts, budget results, bankrupt warnings, approval swings ±10, and (later) disasters; each with a headline template and optional location.
- `src/ui/EvaluationWindow.tsx` — approval gauge, poll bars, score and change, city class, population.
- `src/ui/AdvisorPanel.tsx` — one card per top problem: cause sentence, severity, and "Show me" button that calls `CityCamera.flyTo(x, y)`.
- `src/ui/NewsTicker.tsx` — scrolling headlines along the bottom; click a headline with a location to fly there.
- `src/render/camera.ts` — add `flyTo(x, y)` with eased motion.
- `src/shared/protocol.ts` — `tick` adds `evaluation` (on year end) and `news` items.
- `src/sim/systems/evaluation.test.ts` — tests.

## Steps
1. Write `history.ts`, `cityClass.ts`, `evaluation.ts`, `hotspots.ts` and `news.ts`; schedule evaluation on `yearEnd` and history on `monthEnd`.
2. Extend the protocol and the camera.
3. Write the three UI components; add top-bar buttons for Evaluation and Advisors.
4. Write tests.

## Implementation notes (changed during build)
- **Monthly evaluation.** Problems, hotspots, approval and score are computed every month (tick 13) so advisors help from the first month; the yearly `evaluation` event, approval-swing news, and last-year baselines still happen at year end. Promotions are announced the month they happen.
- **Housing cost rescaled.** The planned "mean land value ÷ 2.55" made any land value a complaint (a village with fair land value rated it its #2 problem). It is now `max(0, mean − 96) ÷ 1.59`: no complaint at or below average land value, 100 at the maximum. The tax score is clamped to 100.
- **Unemployment hotspot** uses straight-line distance to the nearest job zone instead of path distance (cheaper; same intent).
- Problems with no place (e.g. "Taxes are fair") have no "Show me" button.
- The evaluation window and advisor panel are one "City report" dialog (top-bar "City · approval%" button); "Show me" closes it and flies the camera to the hotspot. News headlines come from sim events via `news.ts` as they are emitted.

## Build gate
```
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e
```

## Test plan
- `evaluation.test.ts`: a high-crime test city ranks crime first; raising the tax to 20% puts taxes in the top problems; approval stays in 0–100; class thresholds promote correctly and emit one `milestone` each.
- `hotspots` test: the worst pollution block is next to the coal plant in the fixture city.
- History buffers wrap correctly after 120 years.
- Manual: click "Show me" on each advisor card; the camera flies to the named spot.

## Commit
`feat: add city evaluation, opinion poll, city class, history, news ticker and advisor hotspots`

## Rollback
Revert the commit. The sim loses evaluation output; no other system reads it except later phases not yet built.
