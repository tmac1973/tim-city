# Phase 02 — Simulation Core, Worker and Time

**Depends on:** 01 · **Enables:** 03 (terrain lives in sim state), 04 (renderer reads sim snapshots), every sim system after it

## Goal
Build the headless, deterministic simulation kernel. It holds all city state in flat typed arrays, runs in a Web Worker, advances time on a fixed tick schedule, and talks to the main thread through a typed message protocol. The same kernel also runs in Node for tests. No game systems exist yet; this phase delivers the frame they plug into.

## Files touched
- `src/shared/constants.ts` — `MAP_SIZES = [128, 256]`, `TICKS_PER_MONTH = 16`, `MAX_HEIGHT = 15`, speed table `{ paused: 0, slow: 8000, normal: 4000, fast: 1500 }` (ms per game month).
- `src/shared/tiles.ts` — `TileKind` enum (`Empty`, `Water`, `Tree`, `Rubble`, plus reserved ranges for road, rail, power line, zones, buildings), and bit flags `POWERED`, `CONDUCTIVE`, `BURNING`, `ZONE_CENTER`, `BULLDOZABLE`.
- `src/shared/protocol.ts` — discriminated unions `MainToWorker` (`init { name, seed, size }`, `setSpeed`, `command`) and `WorkerToMain` (`ready { name, seed, size }`, `tick`, `event`, `error`). `tick` carries date, funds, and a list of dirty 32×32 chunk ids with copied typed-array slices (transferable).
- `src/sim/rng.ts` — `sfc32` PRNG seeded from a 128-bit seed string hash; `nextInt(n)`, `nextFloat()`, `fork(label)` for per-system streams.
- `src/sim/state.ts` — `CityState`: `name`, `seed`, `size`, `tiles: Uint16Array(size²)`, `flags: Uint8Array(size²)`, `heights: Uint8Array((size+1)²)` (corner heights), `blockFields` record of `Uint8Array((size/2)²)` grids (filled by later phases), `funds`, `date {year, month, tick}`, `rng`, `dirtyChunks: Set<number>`.
- `src/sim/scheduler.ts` — `System` interface `{ name, phaseTicks: number[], run(state, tick) }`. The scheduler runs each system on the ticks it lists, so heavy monthly passes spread over the 16 ticks.
- `src/sim/commands.ts` — command queue; commands apply at the start of the next tick, in arrival order, so replays are deterministic.
- `src/sim/sim.ts` — `Simulation` class: `step()` advances one tick, runs commands then systems, advances the date, collects dirty chunks.
- `src/sim/worker.ts` — worker entry; owns a `Simulation`, runs a timer from the speed table, posts `tick` messages.
- `src/sim/bridge.ts` — main-thread wrapper around the worker with typed `send()` and an event emitter for `tick` and `event`.
- `src/sim/replay.ts` — `runScript(seed, size, actions[], months)` runs the kernel headless; used by determinism tests in this and later phases.
- `src/sim/sim.test.ts`, `src/sim/rng.test.ts`, `src/sim/determinism.test.ts` — unit tests.
- `src/main.ts` — starts the bridge with name `"New City"`, seed from `?seed=` (default `"tim"`) and size from `?size=` (`128` or `256`, default `128`), and logs the date on each tick in dev mode.

## Steps
1. Write `constants.ts` and `tiles.ts`. Reserve `TileKind` number ranges so later phases add kinds without renumbering: 0–15 terrain, 16–63 transport, 64–79 power, 80–255 zones and buildings, 256–319 specials, 320–399 disaster tiles.
2. Write `rng.ts`. Hash the seed string with `cyrb128` into four 32-bit words for `sfc32`. `fork(label)` derives a child stream by hashing `seed + label`, so adding a new system never shifts other systems' random streams.
3. Write `state.ts` with all arrays allocated at construction. Add `markDirty(x, y)` that inserts the chunk id `(y>>5) * (size>>5) + (x>>5)`.
4. Write `scheduler.ts` and `sim.ts`. Tick order: apply queued commands → run scheduled systems → advance `tick` (16 per month, 12 months per year) → emit `monthEnd` / `yearEnd` events.
5. Write `protocol.ts`, `worker.ts` and `bridge.ts`. The worker uses `setTimeout` chained to the speed's ms-per-tick (`msPerMonth / 16`). On each tick it posts only dirty chunk slices, as transferable `ArrayBuffer`s.
6. Write `replay.ts`.
7. Write tests: RNG gives a known sequence for a fixed seed; 12×16 ticks advance exactly one year; commands apply in order; two runs of the same script give byte-identical state.

## Build gate
```
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e
```

## Test plan
- `rng.test.ts`: seed `"tim"` gives a fixed first 10 values (snapshot).
- `sim.test.ts`: 192 ticks advance the date by one year; `yearEnd` fires once.
- `determinism.test.ts`: `runScript` twice with the same seed and an empty action list; all state arrays are equal.
- Manual: run `pnpm dev`, open the console, and see the date advance about once per 4 s per month at the default `normal` speed.

## Commit
`feat(sim): add deterministic typed-array sim kernel, worker bridge and tick scheduler`

## Rollback
Revert the commit. Only `src/main.ts` outside `src/sim` and `src/shared` changes; reverting restores the phase-01 stub.
