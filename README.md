# Tim City

Tim City is an original 3D city builder that runs in your browser. You zone land, lay roads and rail, string power lines from plants to neighbourhoods, set taxes and service budgets, and watch a low-poly diorama city grow around you, house by house and tower by tower. Then a tornado tears through the suburbs, or something large and mossy climbs out of the river.

**Play it:** https://tmac1973.github.io/tim-city/

There is nothing to install and no account to make. Cities save in your browser, and you can export them as `.timcity` files to keep or share.

## What's new in 2.0

- **Density you choose.** Paint zones as low, medium or high density, and each tier caps how tall the lots can grow. High density costs more, unlocks once you're a Town, and needs good land value to reach its tallest towers. To change a neighbourhood's density, paint over it and the buildings stay put.
- **Cleaner power, and dirtier.** Wind turbines (stronger on hills), solar farms (weaker in cloudy months), gas plants and oil plants join coal and nuclear.
- **Water and garbage.** Water towers and landfills cover the lots around them. Without water a lot stops at level 4, and uncollected garbage drags land value down. Old cities get two in-game years to catch up.
- **Buses and subways.** Put bus stops beside busy roads and the stops link into routes that take cars off the street; the buses drive them and you can ride along. Once you're a City, dig subway track under anything and connect districts no road reaches. Press V to see it all underground.
- **Landmarks.** City Hall, a hospital, a university, a museum, a zoo, an amusement park with a Ferris wheel that turns, and three monuments, each with its own effect. The leisure ones bring in tourists if a road reaches them from the edge of the map.
- **Tools that unlock as you grow.** The toolbar is now a set of category flyouts, and new tools arrive at Town, City and Capital, announced when they do.
- **Better road building.** Roads now grade around buildings instead of refusing to. Faint outlines show which 3×3 lots will fit beside the road you're drawing, parallel roads snap to lot-sized gaps (hold Alt to stop them), and the Block tool lays a whole ring of road sized to fit lots, zoned inside if you like.

See [CHANGELOG.md](CHANGELOG.md) for the details.

## What's in it

- **A living simulation.** Residential, commercial and industrial demand; power grids; traffic that follows real trips between homes, shops and factories; pollution, crime, land value and population density; police, fire and park coverage; a yearly budget with taxes, service funding and bonds; city evaluation, opinion polls and a city class that climbs from Village to Megalopolis.
- **Terrain you can shape.** Generated islands, coasts, rivers and hills with sliders for water, forest and hills. Raise, lower and level the ground. Roads and rail grade themselves up slopes, bridge rivers and tunnel through hills.
- **A city that moves.** Cars and buses in the numbers the traffic model says, trains on the rails, planes in and out of the airport, cargo ships to the seaport, people on busy sidewalks, fire trucks racing to fires and police on patrol. Pick any vehicle with the query tool and ride along at street level.
- **Day, night, weather and seasons.** A six-minute day with lit windows, street lights and headlights; rain, storms, snow and fog; autumn colours and winter snow.
- **Eight disasters.** Fire, flood, tornado, earthquake, plane crash, shipwreck, nuclear meltdown, and the Mirebeast. Each one damages the city through the simulation and leaves rubble to clear. Random disasters can be turned off.
- **Data overlays and graphs.** Traffic, pollution, crime, land value, density, police and fire coverage, power and growth, a minimap, and history graphs.
- **Sound with no sound files.** Every effect, the city's ambience and the generative soundtrack are synthesized live with the Web Audio API.
- **A gentle start.** A title screen, a New City screen with a live 3D preview of the map you'll get, and tips that walk a new player from the first power plant to the first residents.

## Controls

| Input | Does |
| --- | --- |
| W A S D or the arrow keys | Pan the camera |
| Right-drag | Rotate |
| Middle-drag | Tilt |
| Mouse wheel | Zoom |
| Space, 1, 2, 3 | Pause, slow, normal, fast |
| Z, X, C | Residential, commercial, industrial zones (press again to cycle the density) |
| R, H, T | Road, Block, rail |
| P, G, N, E | Power line, coal plant, nuclear plant, wind turbine |
| Y | Bus stop |
| V | Underground view |
| Alt while dragging a road | Don't snap to a lot-sized gap |
| Esc | Drop the tool, close a window, or open the pause menu |
| `[` and `]` | Terraform brush size |
| Shift while dragging a road or rail | Tunnel through a hill |
| Tab | Next vehicle while following one |
| M | Mute |
| Ctrl+S | Quick save |

Each toolbar button opens a flyout listing its tools with their costs, shortcuts and what they do. Tools you haven't unlocked yet show the population they need.

## Running it yourself

You need Node 24 and pnpm 10.

```bash
pnpm install
pnpm dev        # dev server at http://localhost:5173/tim-city/
pnpm build      # production build into dist/
pnpm preview    # serve the build
```

Checks:

```bash
pnpm lint       # ESLint
pnpm typecheck  # TypeScript
pnpm test       # Vitest: the sim, saves, determinism, audio, effects
pnpm e2e        # Playwright in Chromium, Firefox and WebKit
```

Run `pnpm exec playwright install --with-deps` once before the first `pnpm e2e`. WebKit always runs in CI; locally it runs only with `PW_WEBKIT=1`, because Playwright's WebKit build needs Ubuntu system libraries.

A few addresses are handy for testing: `?seed=anything` starts a new city on that seed straight away, `?quality=low` turns off shadows and the blur passes, `?time=0.9&weather=rain` sets the scene, and `?debug` exposes a `window.__tim` handle for scripts.

### Benchmarks

`pnpm bench:cities` writes two benchmark cities to `public/bench/` (about 120,000 people on a 128 map and 520,000 on a 256 map). `pnpm bench` builds the game and runs each for 60 seconds at fast speed, at night, in the rain, with every agent on, then writes `bench-results.json`. It fails if the 128 city's median frame is over 16.7 ms or the 256 city's is over 33.3 ms. It runs a headed Chromium, so it uses your GPU. On Linux, where headless Chromium can reach the GPU through Vulkan, you can run it headless instead:

```bash
BENCH_HEADLESS=1 BENCH_CHROME_ARGS="--enable-gpu --use-angle=vulkan --enable-features=Vulkan" pnpm bench
```

`pnpm sample` rebuilds the city the title screen shows, and `pnpm fixture` writes a save fixture in the current format (the tests use `city-v1` for migrations and `city-v6` for the 2.0 features).

## How it's built

TypeScript throughout. The simulation runs in a Web Worker on typed arrays, ticks deterministically from a seed, and sends the main thread only the 32×32 chunks that changed. The main thread renders with [Three.js](https://threejs.org/) and [postprocessing](https://github.com/pmndrs/postprocessing), and the interface is [Preact](https://preactjs.com/) with [Signals](https://github.com/preactjs/signals). Saves use [idb](https://github.com/jakearchibald/idb) over IndexedDB and the browser's own gzip streams. Tests use [Vitest](https://vitest.dev/) and [Playwright](https://playwright.dev/), and the build is [Vite](https://vite.dev/).

The full design and the phase-by-phase plan it was built from live in [`plan/tim-city/`](plan/tim-city/overview.md); each phase file ends with notes on what changed during the build. The 2.0 expansion has its own plan in [`plan/city-expansion/`](plan/city-expansion/overview.md).

## Credits

Tim City stands on the open-source work of the Three.js, postprocessing, Preact, idb, Vite, Vitest, Playwright, TypeScript and ESLint projects. Every model, texture, sound and line of game code in this repository was made for this project. It is an original game: it borrows the genre and its classic mechanics, not any existing game's name, art, sound or content.
