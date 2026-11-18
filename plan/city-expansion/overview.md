# Tim City 2.0: Modern City Expansion — Project Overview

## Problem
Tim City v1.0 plays like a classic 1989 city builder. It has one kind of R/C/I
zone, two power plants (coal and nuclear), and trips that go only by car on roads
or by rail. It has three special buildings (stadium, seaport and airport).
Players who know newer city builders miss the tools those games give for shaping
a city. They can't keep a quiet suburb low, mix in clean energy, move commuters
off congested roads or build civic landmarks.

The expansion adds four feature groups from newer city builders, with two light
utility systems: zone density tiers, more power plants, public transit, and new
landmarks (with water and garbage coverage). It keeps the current sim model:
3×3 lots, a tile grid, a monthly tick and a deterministic worker.

## Goals
- **Zone density tiers.** The player paints R, C or I zones as low, medium or
  high density. The tier caps how far a lot grows:
  - Low tops out at level 3 (houses and small shops).
  - Medium tops out at level 6.
  - High can reach level 8, but levels 7–8 need land-value class 2 or higher.
  Lots stay 3×3. Higher levels already make more trips and pollution and draw
  more power. High density adds no new upkeep and no zoning surcharge.
- **Four new power plants:** solar farm, wind turbine, gas plant and oil plant.
  Each has its own cost, output, pollution and siting rule.
  - Solar and wind output is set once per month. Wind gets a bonus on high
    ground. Solar loses output in overcast months, which the sim rolls
    each month.
  - The power advisor explains each plant's output.
- **Public transit.**
  - Buses: the player places bus stops beside roads. A trip may walk to a stop,
    ride the road network by bus, and walk from a stop near its goal. Bus legs
    add less car traffic than driving.
  - Subways: the player drags underground subway track in an underground view
    and places 1×1 stations that link it to the surface. Trips use subway track
    like rail, at a lower step cost.
  - Buses are visible agents that drive between stops and can be followed with
    the follow-cam. Subway trains are moving markers in the underground view.
- **New landmarks and utilities.**
  - Civic: City Hall raises approval. The Hospital gives health coverage that
    raises residential growth. The University cuts industrial pollution by 50%
    in a wide radius and raises the tax that industry there pays.
  - Leisure: the zoo, museum and amusement park raise land value over a wide
    radius. Each adds to a monthly "Tourism" budget line. A landmark earns only
    when a road route reaches it from the map edge, and its income drops
    with nearby crime and pollution.
  - Monuments: a statue, a clock tower and a giant "TIM" sign. They are cheap
    prestige buildings that raise approval and nearby land value.
  - Utilities: water towers and landfills cover a radius and have a capacity,
    like police stations. Without water a lot can't grow past level 4.
    Uncollected garbage lowers land value. There are no pipes.
- **Unlocks at population milestones.** The existing city classes set the
  steps. A toast and a news item announce each unlock:

  | Class (population) | Unlocks |
  |---|---|
  | Village (0) | Low and medium density, bus stop, solar farm, wind turbine, gas plant, water tower, landfill |
  | Town (2,000) | High density, Hospital, City Hall, statue |
  | City (10,000) | Subway, oil plant, museum, zoo, clock tower |
  | Capital (50,000) | University, amusement park, "TIM" sign |

  The tools that v1 already has (stadium, seaport, airport, coal, nuclear and
  the rest) stay available from the start.
- **A grouped toolbar.** One button per category: Zones, Power, Transit,
  Services, Utilities and Landmarks, plus the existing network and edit tools.
  A button opens a flyout of that category's tools and remembers the last tool
  chosen. The density tier is picked inside the Zones flyout.
- **Old saves keep working.** A v1 save loads, and its existing zones become
  "high" tier so nothing shrinks. Water and garbage needs start after a 2-year
  in-game grace period, and an advisor warns the player before it ends.
- **Each phase ships.** Each phase merges to main and deploys to GitHub Pages
  when it is done. The game stays playable after every phase. The last phase
  tags v2.0.0.

## Non-goals
- No lot merging and no lot sizes other than 3×3 for zones.
- No drawn bus lines, named routes or per-line vehicle counts.
- No new zone type such as office or high-tech. The University changes existing
  industry only.
- No live day/night or per-tick wind output. No batteries or storage buildings.
- No water pipes, sewage network or pump placement.
- No 3D subway trains in tunnels. Subway trains appear only as markers in the
  underground view.
- No year-based unlocks and no start-year setting.
- No "classic rules" flag for old saves. All cities use the new rules after
  migration.
- No change to map sizes, terrain generation, disasters or the audio system,
  except where a new building needs a sound or a new building must burn,
  flood or fall like the others.

## Users & primary flow
The player is someone who already plays Tim City in a desktop browser.

1. The player starts a new city. It starts paused, as now. The Zones flyout
   offers low and medium density. The Power flyout offers coal, nuclear,
   solar, wind and gas. The Transit flyout offers bus stops. The Utilities
   flyout offers water towers and landfills.
2. The player lays roads, paints low-density residential and medium-density
   commercial, places a wind turbine or solar farm, a water tower and a
   landfill, and presses Play.
3. Lots grow up to their tier caps. The query tool and the zone overlays show
   each lot's tier and cap, and they say why a lot stopped growing: tier cap,
   land value, no water or no power.
4. At 2,000 people a toast says high density, the Hospital, City Hall and the
   statue are unlocked. The player rezones a downtown block as high density.
5. Traffic builds. The player places bus stops along a busy road, and buses
   appear and carry trips. The traffic overlay shows lower congestion.
6. At 10,000 people the subway unlocks. The player opens the underground view,
   drags track between two districts and places stations. The underground view
   shows trains moving.
7. The player builds leisure landmarks. A Tourism line appears in the budget
   window.
8. The player saves and later reloads. Everything, including tiers, transit,
   unlocks and coverage, comes back the same.

## Constraints
- **Stack:** TypeScript, Vite, Preact with signals, Three.js, a Web Worker sim,
  Vitest unit tests and Playwright e2e in Chromium, Firefox and WebKit. There
  is no new runtime dependency.
- **Determinism:** the sim stays deterministic. A replay of the same commands
  gives the same state, and `determinism.test.ts` keeps passing.
- **Tile kinds:** new kinds use free numbers inside the existing ranges in
  `src/shared/tiles.ts`. Power uses 64–79, transport 16–63, and specials
  256–319. Existing kind numbers do not change.
- **Saves:** `src/sim/migrate.ts` migrates v1 saves forward. The
  `src/sim/fixtures/city-v1.timcity` fixture must still load and run.
- **Performance:** a 256×256 city at Megalopolis size must keep the current
  frame rate and a monthly tick under the current budget. The new trip modes
  must not grow the trip search past its existing expansion cap
  (`MAX_EXPANSIONS` in `src/sim/systems/traffic.ts`).
- **CI:** lint, typecheck, unit and e2e tests must pass on each push before
  Pages deploys.
- **Look:** new buildings use the existing procedural low-poly style in
  `src/render/buildings`, the palette in `src/render/palette.ts`, and the
  day/night lighting.

## Success criteria
- A low-density lot never grows past level 3, and a medium lot never past 6.
  A high lot reaches 7–8 only on land-value class 2 or higher. Unit tests check
  each cap.
- Each new plant powers a grid with its stated output. Wind on high ground and
  solar in an overcast month show the stated change. The power advisor and query
  tool show each plant's output.
- In a test city, adding bus stops along a congested road lowers that road's
  traffic value. A subway link between two districts lets trips reach goals
  that were beyond `MAX_TRIP_COST` by road alone.
- Buses appear as agents and can be followed. The underground view shows
  subway track, stations and moving trains.
- Every landmark has a visible effect that a unit test checks: approval, land
  value, growth, pollution cut, tax or tourism income.
- Lots without water stop at level 4, and uncollected garbage lowers land
  value. A migrated v1 save shows the grace period and the advisor warning.
- Each unlock appears at its population step with a toast. Locked tools show
  in the flyouts as locked, with the population they need.
- The `city-v1.timcity` fixture loads, keeps its zone levels and runs for 5
  years with no errors.
- All CI checks pass on each phase, and the live site works after each deploy.
  The last phase tags v2.0.0.

## Decisions
- **Scope** → All four groups: zone density tiers, more power plants, public
  transit and more landmarks.
- **How density tiers work** → The tier caps growth (low 3, medium 6, high 8).
  Lots stay 3×3.
- **Extra cost of high density** → No new upkeep. Higher levels already bring
  more traffic, pollution and power draw. Levels 7–8 need land-value class 2
  or higher.
- **New power plants** → Solar farm, wind turbine, oil plant and gas plant.
- **Solar and wind variability** → A monthly average. Wind gets a bonus on high
  ground, and solar loses output in overcast months.
- **Transit types** → Buses and subways.
- **Bus model** → The player places stops only, as in SimCity 4. Trips may walk
  to a stop, ride, and walk from the far stop.
- **Subway construction** → Drag underground track in an underground view and
  place 1×1 stations.
- **Transit visuals** → Buses are visible, followable agents. Subway trains are
  markers in the underground view.
- **Landmarks** → The civic set, leisure set, monuments and infrastructure.
- **Water and garbage depth** → Coverage buildings with a radius and capacity.
  No water means a cap at level 4, and garbage lowers land value. No pipes.
- **Old saves** → Migrate. Existing zones become high tier. Water and garbage
  rules start after a 2-year grace period with an advisor warning.
- **Unlocks** → At population milestones, as in the table under Goals.
- **Toolbar** → Grouped category flyouts that remember the last tool.
- **University effect** → 50% less industrial pollution and higher industrial
  tax in a wide radius. No new zone type.
- **Tourism** → A monthly budget line. A landmark earns only when a road
  reaches it from the map edge, and nearby crime and pollution lower it.
- **Release** → Each phase merges to main and deploys. Tag v2.0.0 at the end.
