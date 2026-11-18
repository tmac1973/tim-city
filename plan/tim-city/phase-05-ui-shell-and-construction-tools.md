# Phase 05 — UI Shell and Construction Tools

**Depends on:** 02, 03, 04 · **Enables:** 06 (zone and plant placement reuse the tool system), 08 (rail and road graph), every phase that adds a tool or panel

## Goal
Give the player a HUD and the first construction tools. The player can build roads, rail and power lines (with bridges and tunnels), bulldoze, and terraform. Each action costs money. The sim validates and applies every action, so the main thread only sends commands. Networks render with auto-tiled meshes.

## Files touched
- `src/ui/App.tsx` — layout: top bar, left toolbar, bottom-right speed controls, toast area.
- `src/ui/store.ts` — Preact signals: `date`, `funds`, `speed`, `activeTool`, `hoverTile`, `toasts`.
- `src/ui/TopBar.tsx` — city name, date, funds (from the `ready` and `tick` messages), and the map seed with a "Copy seed" button so players can share it.
- `src/ui/Toolbar.tsx` — tool buttons with icons (inline SVG) and keyboard shortcuts: road `R`, rail `T`, power line `P`, bulldoze `B`, raise terrain `U`, lower terrain `J`, level terrain `L`; shows name, cost and shortcut in the tooltip.
- `src/ui/SpeedControls.tsx` — pause, slow, normal, fast; `Space` toggles pause, `1`/`2`/`3` set speeds.
- `src/ui/Toasts.tsx` — short messages such as "Not enough funds" or "Too steep".
- `src/shared/costs.ts` — single cost table: road $10/tile, rail $20/tile, power line $5/tile, bridge $50/tile, tunnel $100/tile, bulldoze $1/tile (rubble $1, building $5/tile), terraform $20 per corner step.
- `src/shared/tiles.ts` — add road, rail, power line, road+line, rail+line, road/rail crossing, bridge and tunnel kinds with connection bits; add a `FOOTPRINTS` table (kind → width × height, empty for now) that later phases fill for multi-tile buildings.
- `src/sim/tools/index.ts` — command handler: dispatch by tool, validate, charge funds, mutate state, mark chunks dirty, emit `toolResult` events with a reason on failure.
- `src/sim/tools/network.ts` — line tool for road, rail and power: L-shaped path from drag start to end; auto-connect bits; crossing rules (road×rail crossing, road+line, rail+line combos).
- `src/sim/tools/bridge.ts` — when a drag crosses water in a straight line, build a bridge from bank to bank; maximum 16 tiles.
- `src/sim/tools/tunnel.ts` — when the player holds `Shift` during a straight road or rail drag, build a tunnel: the start and end tiles must be at the same height, and every tile between them must have its lowest corner at least 2 levels above that height; maximum 16 tiles. Without `Shift`, roads and rail follow the surface.
- `src/sim/tools/bulldoze.ts` — clear any tile. If the tile's kind has an entry in `FOOTPRINTS`, find the footprint origin and clear the whole footprint into rubble. Cost per tile: $1 for trees, rubble and networks; $5 for building tiles.
- `src/sim/tools/terraform.ts` — raise, lower and level corners in a brush (1, 3 or 5 tiles); keeps the max-1-step rule by propagating to neighbors; refuses to change corners under built tiles; water appears or drains when corners cross sea level.
- `src/sim/tools/tools.test.ts` — tests.
- `src/render/networks.ts` — per-chunk merged meshes for roads (asphalt, lane markings, sidewalks), rail (ballast, ties, rails), power pylons and wires (catenary curves), bridges (deck plus piers), and tunnel portals; slope-aware.
- `src/render/toolPreview.ts` — ghost preview of the path or brush, tinted green for valid and red for invalid, with total cost label.
- `src/main.ts` — input → `command` messages.

## Steps
1. Write `costs.ts` and extend `tiles.ts` with network kinds in the reserved 16–79 range.
2. Write the `tools` modules in the sim. Validation rules: roads and rail allow slopes of 1 step along their direction and 0 across; a tile with a cross slope is **auto-graded** (levelled across the line, cut down to the lower corner, or filled up at the shore) at the terraform price of $20 per corner step, refusing with "Can't grade next to buildings" or "Too close to the water" when grading would touch built tiles or flood/drain a tile; tunnel portals are never graded; power lines allow any slope; nothing builds on water except bridges. *(Changed during implementation: the strict rule rejected ~40% of tiles on default terrain.)* Tunnel interiors need ground above the road (highest corner ≥ portal height + 1) and a hill peak ≥ portal height + 2, since the 1-step smoothing makes "lowest corner ≥ +2" impossible next to a portal.
3. Return a structured result from every tool: `{ ok, cost, reason? }`. The UI uses it for toasts and for preview cost.
4. Write `store.ts` and the UI components. Panels use `pointer-events: auto`; the canvas gets all other input.
5. Write `networks.ts`. Pick the mesh variant from the 4-bit neighbor mask (straight, corner, T, cross, end). Build road and rail geometry once per variant and slope, then merge per chunk.
6. Write `toolPreview.ts`. During a drag, the main thread asks the worker for a dry-run cost via a `command` with `dryRun: true`.
7. Write tests.

## Build gate
```
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e
```

## Test plan
- `tools.test.ts`: road on flat land connects correctly; road refuses a tile with a cross slope; bridge over a 5-wide river succeeds and over a 20-wide lake fails; a `Shift` drag through a hill builds a tunnel, and fails when the end tiles differ in height; bulldozing one tile of a registered 3×3 test footprint clears all 9 tiles; terraform keeps the max-1-step rule; insufficient funds fail with no state change.
- Determinism test extended with a scripted build sequence.
- `e2e/tools.spec.ts`: drag a road, then confirm funds dropped by the expected cost.
- Manual: build roads, rail, power lines, a bridge and a tunnel; bulldoze them; terraform a hill flat; check preview colors and costs.

## Commit
`feat: add HUD, speed controls and road/rail/power/bridge/tunnel/bulldoze/terraform tools`

## Rollback
Revert the commit. Phase-04 rendering and the sim kernel still work. Saved state does not exist yet, so no data migration is needed.
