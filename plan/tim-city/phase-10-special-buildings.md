# Phase 10 — Stadium, Seaport and Airport

**Depends on:** 05, 06, 07, 08, 09 · **Enables:** 12 (demand-cap complaints), 15 (plane crash and shipwreck), 16 (planes and ships)

## Goal
Add the three special buildings that unlock growth, as in the classic rules. Without a stadium, residential demand caps at a population threshold. Without a seaport, industrial demand caps. Without an airport, commercial demand caps. Each building has its own 3D model and its own side effects.

## Files touched
- `src/shared/tiles.ts` — stadium (4×4), seaport (4×4, must touch water on one side), airport (6×6, flat); all registered in `FOOTPRINTS`.
- `src/shared/costs.ts` — stadium $5,000, seaport $3,000, airport $10,000.
- `src/sim/tools/place.ts` — placement rules: seaport needs at least 4 water tiles along one edge; airport needs the whole footprint at one height after auto-level and refuses slopes above 1 step.
- `src/sim/systems/demand.ts` — caps: R valve capped at 0 when `resPop > 50,000` and no powered stadium; I valve capped at 0 when `indJobs > 7,000` and no powered seaport; C valve capped at 0 when `comJobs > 10,000` and no powered airport. Each cap emits a `demandCap` event once per year while active.
- `src/sim/systems/pollution.ts` — airport adds pollution 120; seaport adds 60.
- `src/sim/systems/landValue.ts` — airport subtracts 60 land value within 6 tiles of its footprint (noise).
- `src/sim/systems/traffic.ts` — I trips may end at a powered seaport as an export goal.
- `src/render/buildings/specials.ts` — stadium bowl with field and floodlights; seaport with quay, cranes and containers; airport with runway, terminal and control tower.
- `src/ui/Toolbar.tsx` — specials group.
- `src/sim/systems/specials.test.ts` — tests.

## Steps
1. Extend tiles, costs, placement rules and toolbar.
2. Add the demand caps and the side effects.
3. Write `specials.ts` models with the phase-07 kit parts and new parts (cranes, runway markings, floodlight masts).
4. Write tests.

## Build gate
```
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e
```

## Test plan
- `specials.test.ts`: forced census above each threshold caps the matching valve; adding the powered building lifts the cap; seaport placement fails away from water; airport placement fails on rough terrain.
- Determinism test passes.
- Manual: place each building; check models, footprint leveling, and the query panel.

## Commit
`feat: add stadium, seaport and airport with classic demand caps`

## Rollback
Revert the commit. Demand returns to uncapped phase-09 behavior.
