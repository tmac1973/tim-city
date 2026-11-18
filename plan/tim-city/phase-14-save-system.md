# Phase 14 — Saving, Autosave and File Export

**Depends on:** 02, 04, 05, 06, 08, 09, 10, 11, 12 · **Enables:** 15 (disaster state is added to the save format), 20 (load menu), 21 (benchmark city fixture)

## Goal
Let the player keep cities. The sim serializes its full state into a versioned binary format. The game autosaves every game year to IndexedDB, keeps named save slots, and exports or imports a gzip-compressed `.timcity` file. Loading a save restores an identical sim, so the city continues exactly as before.

## Files touched
- `src/sim/serialize.ts` — `serialize(state): Uint8Array` and `deserialize(bytes): CityState`. Format: magic `TIMC`, `u16` format version, `u32` header length, JSON header (name, seed, size, date, funds, difficulty, settings, census, valves, bonds, ledger, history, evaluation, RNG states), then each typed array in a fixed registry order with a `u32` length prefix.
- `src/sim/serializeRegistry.ts` — ordered list of every typed array and JSON field the state owns; each later phase that adds state appends to it and bumps the format version.
- `src/sim/migrate.ts` — `migrations[version] = (old) => next`; applied in sequence on load.
- `scripts/makeFixtureSave.ts` — builds a scripted 10-year city with `runScript` and writes it with the current serializer.
- `src/sim/fixtures/city-v1.timcity` — committed version-1 fixture from that script; later phases that bump the format test their migration against it.
- `src/save/compress.ts` — `CompressionStream('gzip')` and `DecompressionStream('gzip')` wrappers.
- `src/save/db.ts` — `idb` database `tim-city` with stores `slots` (key: slot name) and `autosaves` (key: timestamp; keep the newest 3).
- `src/save/saveManager.ts` — `saveSlot(name)`, `loadSlot(name)`, `listSlots()`, `deleteSlot(name)`, `autosave()` on `yearEnd`, `exportFile()` (download `<city-name>.timcity`), `importFile(file)`.
- `src/shared/protocol.ts` — `requestSnapshot` and `loadSnapshot` messages.
- `src/sim/worker.ts` — handles snapshot requests; on load, replaces state and marks every chunk dirty.
- `src/ui/SaveLoadWindow.tsx` — slot list with thumbnails (a 256 px canvas grab of the current view), save as, load, delete, export, import; `Ctrl+S` quick-saves to the current slot.
- `src/ui/store.ts` — city name, current slot.
- `src/sim/serialize.test.ts`, `src/save/saveManager.test.ts` — tests (the latter uses `fake-indexeddb` as a dev dependency).

## Steps
1. Write `serializeRegistry.ts` listing all state from phases 02–13. Set format version 1.
2. Write `serialize.ts` and `migrate.ts` (version 1 has no migrations yet; the table and loop exist). Write `scripts/makeFixtureSave.ts`, add `pnpm fixture` to `package.json`, and commit `src/sim/fixtures/city-v1.timcity`.
3. Write `compress.ts`, `db.ts` and `saveManager.ts`. Add `fake-indexeddb` to dev dependencies.
4. Add protocol messages and worker handling.
5. Write `SaveLoadWindow.tsx`; add a top-bar save button.
6. Write tests.

## Build gate
```
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e
```

## Test plan
- `serialize.test.ts`: run a scripted city 20 years; serialize; deserialize; run both copies 10 more years; all arrays and JSON are identical (round-trip criterion).
- Export → gzip → import round-trip gives identical bytes.
- Loading a file with an unknown future version fails with a clear message.
- `saveManager.test.ts`: autosave keeps only the newest 3.
- `e2e/save.spec.ts`: save a slot, reload the page, load the slot, check date and population match.

## Commit
`feat: add versioned save format, IndexedDB slots, autosave and .timcity export/import`

## Rollback
Revert the commit. No other code reads saves yet. Existing IndexedDB data stays in the browser and is ignored.
