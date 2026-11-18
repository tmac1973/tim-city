# Phase 01 — Toolbar flyouts and unlocks

**Depends on:** nothing · **Enables:** every later phase. Each later phase adds
its tools to a category and gives them an unlock step.

## Goal
Turn the toolbar's tool groups into one button per category, each opening a
flyout. Add a population-based unlock system that the sim enforces and the UI
shows. No new building exists yet. This phase moves the existing tools only,
and every existing tool stays unlocked from the start. The game plays exactly
as v1 does, with a toolbar that has room for the tools that later phases add.

## Files touched
- `src/shared/unlocks.ts` (new): the `UNLOCK_CLASS` table that maps a `ToolId`
  to a city-class index, plus `isUnlocked(tool, classReached)` and
  `unlocksAt(classIndex)`.
- `src/shared/unlocks.test.ts` (new): unit tests for the table and helpers.
- `src/sim/commands.test.ts` (new): the locked-command test.
- `src/sim/commands.ts`: reject a `ToolCommand` for a locked tool.
- `src/sim/systems/evaluation.ts`: the existing `milestone` event gains the list
  of tools that unlock at the new class.
- `src/shared/protocol.ts`: add `unlocked: ToolId[]` to the `milestone` event.
  Add `classReached` to the snapshot that the UI receives. It is not
  there today.
- `src/ui/Toolbar.tsx`: replace the always-open `GROUPS` lists with category
  buttons and flyouts. Show locked tools.
- `src/ui/store.ts`: add the `openCategory` signal, `lastToolByCategory`
  (in memory) and `classReached`.
- `src/ui/Toasts.tsx` and `src/sim/systems/news.ts`: the milestone toast and
  news item name the new unlocks.
- `src/styles.css`: flyout and locked-tool styles.
- `e2e/tools.spec.ts`, `e2e/helpers.ts` and other specs that click toolbar
  buttons: open the category first. Add a helper `pickTool(page, name)`.

## Steps
1. Create `src/shared/unlocks.ts`. `UNLOCK_CLASS: Partial<Record<ToolId, number>>`
   lists only the tools that are locked at the start. Any tool missing from the
   table has class 0. In this phase the table is empty, and each later phase
   adds its own tools. `isUnlocked(tool, classReached)` returns
   `(UNLOCK_CLASS[tool] ?? 0) <= classReached`. `unlocksAt(c)` returns the tools
   whose class equals `c`, in table order.
2. In `src/sim/commands.ts`, before any tool command runs, check
   `isUnlocked(cmd.tool, state.classReached)`. On failure, return the existing
   tool-error result with the message
   `Unlocks at <CityClass> (<threshold> people)`. Take the name from
   `CITY_CLASSES` and the threshold from `CLASS_THRESHOLDS`.
   `state.classReached` is already saved, so this adds no new save state.
3. In `evaluation.ts`, where `milestone` is emitted, add
   `unlocked: unlocksAt(reached)`. A city that skips classes in one month
   (only possible from a save edit) emits the unlocks of each class it passed.
   Loop from the old class + 1 to the new class.
4. In the toast for `milestone`, add "Unlocked: A, B, C" when the list is not
   empty. Use the tool names from the toolbar definitions. In `news.ts`, give
   the same list as a second sentence.
5. Toolbar layout: the left toolbar shows one square button per category, with
   the icon and label of the category's last chosen tool and a small category
   caption. The categories are Zones, Transport, Power, Services, Landmarks,
   Land and Info, and they keep the current tool lists. The stadium, seaport
   and airport stay in Landmarks, where they are today. Clicking a category
   button opens its flyout to the right, which lists every tool with its
   name, key, cost and hint, as the current tool rows do. Clicking a tool
   selects it, closes the flyout and records it in
   `lastToolByCategory[category]`. Clicking the category button again, pressing
   Escape or clicking the map closes the flyout. A category with one tool
   (Info) selects that tool directly and opens no flyout.
6. Keyboard shortcuts select their tool directly, as now, without opening a
   flyout, and update `lastToolByCategory`. Escape closes an open flyout before
   it runs any of its current actions.
7. Locked tools: the flyout shows them greyed, with a lock icon and
   "Town · 2,000 people" in place of the cost. Clicking a locked tool or
   pressing its key does nothing except show the tool-error toast with the
   same message the sim gives.
8. Keep `useFitHeight`. It now measures the shorter category column. The flyout
   is positioned with CSS beside its button, and it is clamped to the window
   height with `max-height: calc(var(--app-h) - 24px)` and `overflow-y: auto`.
9. Add a tiny `GROUPS` entry field `category: string`, so later phases can add
   categories (Transit, Utilities) by adding entries. A category with no tools
   is not drawn.
10. Update the e2e specs. Add `pickTool(page, toolName)` to `e2e/helpers.ts`. It
    clicks the category button, then the tool, and every spec that used a
    direct tool-button click calls it.

## Build gate
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm e2e`

## Test plan
- Unit (`unlocks.test.ts`): a tool missing from the table is unlocked at class
  0. A tool given class 2 is locked at 1 and unlocked at 2. `unlocksAt` returns
  table order.
- Unit (new `src/sim/commands.test.ts`): with a temporary table
  entry injected through a test-only setter `setUnlockTableForTest`, a locked
  tool's place command fails with the "Unlocks at" message and changes no
  tiles or funds.
- e2e (`tools.spec.ts`): open the Zones flyout and pick Residential. The flyout
  closes and the category button shows Residential. Pressing R selects Road
  with no flyout. Escape closes an open flyout.
- e2e: all existing specs pass through `pickTool`.
- Manual: at 1280×720 and at 150% interface size, the flyouts fit the window
  and scroll if needed.

## Commit
`feat(ui): category flyout toolbar and population unlock system`

## Rollback
Revert the commit. There is no save-format change, so saves made with this
phase load in the previous build. The unlock table is empty in this phase, so
reverting removes no gameplay.
