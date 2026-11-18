# Tim City — Project Overview

## Problem
The classic late-1980s city builders defined a genre: zone land, run power and roads, balance a budget, and watch a city grow or fail. Their core loop still holds up. Their presentation does not. They are flat 2D tile grids with tiny sprites. They hide the cause of most problems behind a few small maps. They need emulators or old executables to run today.

Tim City is an original 3D city builder that runs in a web browser. It keeps the complete classic mechanic set and adds modern depth: a living 3D diorama, visible traffic and transit, weather, cinematic disasters and clear data overlays. It has its own name, art, sound and UI. It does not copy any existing game's name, art, look, scenarios or characters.

## Goals
- Deliver every classic city-builder mechanic as a playable system:
  - **Zoning:** residential, commercial and industrial zones that grow and decay by demand, land value, pollution, crime, traffic and power.
  - **Demand:** an RCI demand indicator driven by population, jobs, taxes and external markets.
  - **Transport:** roads, rail, bridges over water, and tunnels through hills. Traffic density affects growth and pollution.
  - **Power:** coal and nuclear power plants, power lines, and a grid connectivity model. Unpowered zones do not grow.
  - **Services:** police stations, fire stations, and a funding level for each service. Coverage radius scales with funding.
  - **Special buildings:** parks, stadium, seaport and airport. Each unlocks or caps growth like the classic rules.
  - **Budget:** yearly budget with a tax rate, road/police/fire funding, municipal bonds, and bankruptcy.
  - **Evaluation:** mayor approval rating, opinion polls, top city problems, city score, and city class (Village → Town → City → Capital → Metropolis → Megalopolis).
  - **Disasters:** fire spread, flood, tornado, earthquake, plane crash, shipwreck, nuclear meltdown, and an original giant-creature attack.
  - **Information:** overlay maps (power, traffic, pollution, crime, land value, population density, police and fire coverage, growth), history graphs, query tool, newspaper/news ticker, and advisor messages.
  - **Tools:** bulldozer, and pause plus three game speeds.
- Add modern depth on top of the classic core:
  - Visible agents: cars, buses, trains, planes, ships and pedestrians. Their numbers reflect simulated traffic and activity.
  - Day/night cycle with lit windows at night. Dynamic weather: rain, snow and fog.
  - Cinematic disasters: particle fire that spreads, a tornado funnel, rising flood water, quake camera shake, and an animated creature.
  - 3D heatmap overlays, history charts, and an advisor panel that names the cause of each problem.
- Stylized low-poly diorama look: procedural buildings, soft lighting, tilt-shift depth of field.
- Seeded procedural terrain with rivers, lakes, coast and hills. Players can share a seed. Sliders set water and forest amount.
- In-game terraforming (raise, lower, level) that costs money.
- Free camera (pan, zoom, rotate, tilt) and a street-level follow mode that rides with a car or train.
- Procedural audio: synthesized UI and construction sounds, traffic and weather ambience, sirens, and generative music. No licensed audio files.
- Saving: autosave every game year, named save slots in IndexedDB, and export/import of a compressed `.timcity` file.
- Difficulty: Easy, Medium and Hard set starting funds, tax sensitivity and disaster rate. A toggle turns random disasters off. A menu triggers any disaster by hand.
- Map sizes: 128×128 by default, with 256×256 as an option.

## Non-goals
- No scenarios or timed challenge maps. Free play is the only mode.
- No scenario editor and no separate map-editor mode. Terraforming during play is the only terrain editing.
- No accounts, backend, cloud saves, leaderboards or multiplayer.
- No modern-builder systems outside the classic core: no water supply, garbage, education, health care, districts or policies.
- No phone or tablet support and no touch controls.
- No licensed or copied assets, names, scenarios, characters or visual style from any existing game.
- No modding API.
- No localization. The UI is English only.

## Users & primary flow
The player is a desktop browser user who enjoys city builders. They open a public URL. Nothing installs.

1. The player opens the site and sees the title screen over a slowly orbiting sample city.
2. They choose **New City**, enter a city name, choose a difficulty and map size, and set terrain sliders (water, forest, hilliness). They can type or randomize a seed. A live 3D preview shows the terrain.
3. The game starts in the paused state. The player places a power plant, power lines, roads and the first R, C and I zones. Construction costs are deducted from city funds.
4. The player unpauses. Time runs at the chosen speed. Zones grow into 3D buildings. Cars and pedestrians appear on the streets. The RCI demand indicator updates.
5. The player reacts to the city. They read overlays and the advisor panel. They add police, fire, parks, rail, stadium, seaport and airport. They terraform hills and bridge rivers.
6. At each year end, the budget window opens. The player sets the tax rate and service funding. The opinion poll and city evaluation update.
7. Disasters happen at random (unless switched off) or on demand. The player sends emergency services and rebuilds.
8. The city grows through city classes. The news ticker and milestones mark progress.
9. The game autosaves each year. The player saves to a named slot or exports a `.timcity` file. Later they load it and continue.

## Constraints
- **Platform:** modern desktop browsers with WebGL2: current Chrome, Edge, Firefox and Safari. Mouse and keyboard only.
- **Hosting:** a static site on a free static host. No server code. All state stays in the browser.
- **Performance:** 60 fps with a full 128×128 city on a mid-range laptop with an integrated GPU (Intel Iris Xe or Apple M1 class). 30 fps or better at 256×256 on the same hardware. The simulation must not stall the render loop.
- **Assets:** all 3D models, textures, sound and music are procedural or made for this project. No third-party game assets.
- **Load time:** the first playable screen appears in under 5 seconds on a typical broadband link.
- **Saves:** IndexedDB for slots and autosave. Exported files must load in later versions of the game, so the save format carries a version number.
- **Determinism:** the same seed and the same player actions produce the same city. This makes testing and bug reports reproducible.

## Success criteria
- Every mechanic in the Goals list is playable in one free-play session and can be demonstrated on request.
- A 128×128 city with 100,000+ population holds 60 fps on the reference laptop at 3× speed with agents, weather and night lighting on.
- A 256×256 city holds 30 fps or better on the same hardware.
- Each overlay map shows the same values that the simulation uses, checked by automated tests on the sim data.
- Each disaster can be triggered from the menu, plays its effect, damages the city through the simulation, and leaves rubble the player can clear.
- A city saved, exported, re-imported and loaded continues with identical state, checked by a round-trip test.
- The same seed with the same scripted actions gives the same population after 50 game years, checked by a determinism test.
- The advisor panel names at least one concrete cause, with a map location, for each of the top city problems.
- A first-time player can build a powered, growing city in under 10 minutes without reading external help, using in-game tooltips only.
- The site loads to the title screen in under 5 seconds on broadband and works without errors in current Chrome, Firefox, Edge and Safari.

## Decisions
- **Simulation fidelity** → Classic core feature set, with modern depth (data overlays, smooth growth, agent traffic).
- **3D visual style** → Stylized low-poly diorama, procedural, with soft lighting, tilt-shift and day/night.
- **Audience and distribution** → Personal project on a public static URL. No accounts or server. Saves in the browser plus file export.
- **Map size** → 128×128 by default, with 256×256 as an option.
- **Modern showpiece features** → All four: visible agents, dynamic weather and day/night, cinematic disasters, data overlays and charts.
- **Scenarios** → Free play only. No scenarios.
- **Map creation** → Seeded procedural generator with sliders, plus in-game terraform tools that cost money.
- **Devices** → Desktop only, mouse and keyboard.
- **Performance target** → 60 fps on a mid-range integrated-GPU laptop at 128×128. 30 fps or better at 256×256.
- **Audio** → Procedural SFX, ambience and generative music via Web Audio. No licensed files.
- **Name** → Tim City.
- **Saving** → Autosave each game year, named IndexedDB slots, and `.timcity` file export/import.
- **Difficulty and disasters** → Easy/Medium/Hard, a toggle for random disasters, and a menu to trigger any disaster by hand.
- **Camera** → Free orbit (pan, zoom, rotate, tilt) plus a street-level follow mode.
- **Originality** → Original name, art, sound, UI and creature. Classic genre mechanics only, no copied content.
- **Buildings on slopes** (decided in phase 07, following the roads decision) → Lots are not levelled; buildings stand on stone plinths on lots sloping up to 2 steps.
- **Roads on slopes** (decided in phase 05) → Auto-grade: road and rail tools level each tile across the line and charge the terraform price, instead of refusing sloped tiles.
