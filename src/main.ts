import { h, render } from 'preact';
import { type MapSize, type Speed, START_YEAR, TICKS_PER_MONTH } from './shared/constants';
import type { DifficultyName } from './shared/difficulty';
import { DEFAULT_TERRAIN, type FieldName, type TerrainOptions } from './shared/protocol';
import type { CityAudio } from './audio';
import { gunzip } from './save/compress';
import { QUALITY, type QualityName } from './shared/settings';
import { isPlant, isPower, isRoad, zoneOf } from './shared/tiles';
import { CityMirror } from './render/mirror';
import { isTileOverlay } from './render/overlays';
import { AutoQuality, lowerQuality } from './render/quality';
import { MinimapPainter } from './render/minimap';
import { Renderer } from './render/renderer';
import { autosave, deleteSave, exportFile, importFile, loadSave, saveSlot, type SaveDetails } from './save/saveManager';
import { SimBridge } from './sim/bridge';
import { peekSave } from './sim/serialize';
import { unlockName } from './shared/unlocks';
import { App } from './ui/App';
import {
  activeDisasters,
  activeTool,
  cityFacts,
  addHeadline,
  autoBudget,
  budget,
  budgetOpen,
  census,
  cityInfo,
  currentSlot,
  date,
  classReached,
  undergroundView,
  evaluation,
  following,
  formatDate,
  formatMoney,
  funds,
  gameOver,
  graphsOpen,
  history,
  overlay,
  pauseOpen,
  screen,
  settings,
  skyState,
  speed,
  toast,
  valves,
  volumes,
  watchNext,
  savesChanged,
} from './ui/store';
import { onDisasterStarted } from './ui/cameraEvents';
import { ToolController } from './ui/toolController';

const canvas = document.querySelector<HTMLCanvasElement>('#scene');
const appRoot = document.querySelector<HTMLDivElement>('#app');
if (!canvas || !appRoot) {
  throw new Error('index.html is missing #scene or #app');
}

const params = new URLSearchParams(location.search);
/** Read a 0–100 slider from the query string, falling back to the default. */
const slider = (key: keyof TerrainOptions): number => {
  const value = Number(params.get(key));
  return params.has(key) && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : DEFAULT_TERRAIN[key];
};

/** Navigate to the game with these parameters, keeping the debug and quality flags. */
function navigate(next: URLSearchParams): void {
  if (params.has('debug')) next.set('debug', '');
  const quality = params.get('quality');
  if (quality) next.set('quality', quality);
  location.search = next.toString();
}

/** Reload into a saved city (`?load=`). */
function reloadInto(slot: string, auto: boolean): void {
  const next = new URLSearchParams();
  next.set('load', slot);
  if (auto) next.set('auto', '1');
  navigate(next);
}

/**
 * With no city in the address (no load, seed, size or new), the game opens
 * on the title screen. Seeds and saves in the address start a city straight
 * away: shared seed links and the end-to-end tests rely on it.
 */
const titleMode = !['load', 'seed', 'size', 'new', 'bench'].some((key) => params.has(key));

/** A bundled city (the title's sample, or a benchmark), or null if it cannot be fetched. */
async function bundledCity(path: string): Promise<Uint8Array | null> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}${path}`);
    if (!response.ok) return null;
    return await gunzip(new Uint8Array(await response.arrayBuffer()));
  } catch {
    return null;
  }
}

async function start(): Promise<void> {
  if (!canvas || !appRoot) return;

  // A saved city decides the map size, so read it before building anything.
  const loadName = params.get('load');
  const loadAuto = params.get('auto') === '1';
  let saveBytes: Uint8Array | null = null;
  screen.value = titleMode ? 'title' : 'game';
  if (titleMode) saveBytes = await bundledCity('sample-city.timcity');
  // ?bench=bench-128 loads a benchmark city (see `pnpm bench`).
  const benchName = params.get('bench');
  if (benchName && /^[\w-]+$/.test(benchName)) saveBytes = await bundledCity(`bench/${benchName}.timcity`);
  if (loadName) {
    try {
      saveBytes = await loadSave(loadName, loadAuto);
      if (!saveBytes) toast(`No save called "${loadName}"; starting a new city`);
    } catch (err) {
      toast(`Could not load "${loadName}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const size: MapSize = saveBytes ? peekSave(saveBytes).size : params.get('size') === '256' ? 256 : 128;
  const seed = params.get('seed') ?? 'tim';
  const terrain: TerrainOptions = { water: slider('water'), forest: slider('forest'), hills: slider('hills') };
  const difficultyParam = params.get('difficulty');
  const difficulty: DifficultyName = difficultyParam === 'easy' || difficultyParam === 'hard' ? difficultyParam : 'medium';

  const mirror = new CityMirror(size);
  const sim = new SimBridge();
  let fieldListener: ((name: FieldName, data: Uint8Array) => void) | null = null;
  sim.onTick((tick) => {
    mirror.apply(tick.chunks);
    date.value = tick.date;
    // The title screen keeps its summer evening whatever the sample city's date.
    if (!titleMode) renderer?.atmosphere.setDate(tick.date.month, tick.date.tick / TICKS_PER_MONTH, tick.date.year === START_YEAR);
    funds.value = tick.funds;
    speed.value = tick.speed;
    census.value = tick.census;
    valves.value = tick.valves;
    budget.value = tick.budget;
    evaluation.value = tick.evaluation;
    classReached.value = tick.classReached;
    if (renderer) renderer.atmosphere.weather.overcast = tick.overcast;
    activeDisasters.value = tick.disasters;
    if (tick.field) fieldListener?.(tick.field.name, tick.field.data);
    if (tick.traffic) renderer?.agents.setTraffic(tick.traffic);
  });

  // Mount the UI even if WebGL fails, so the failure can be reported on screen.
  let webglError: string | null = null;
  let renderer: Renderer | null = null;
  let audio: CityAudio | null = null;
  try {
    // ?quality= in the address (tests, slow machines) wins over the saved setting.
    const urlQuality = params.get('quality');
    const forcedQuality = urlQuality && urlQuality in QUALITY ? (urlQuality as QualityName) : null;
    const r = new Renderer(canvas, mirror, forcedQuality ?? settings.value.quality);
    renderer = r;
    let appliedQuality = forcedQuality ?? settings.value.quality;
    settings.subscribe((s) => {
      r.cityCamera.edgeScroll = s.edgeScroll && !titleMode;
      r.cityCamera.sensitivity = s.sensitivity;
      if (!forcedQuality && s.quality !== appliedQuality) {
        appliedQuality = s.quality;
        r.setQuality(s.quality);
      }
    });
    const minimap = new MinimapPainter(mirror, r);
    bindMinimap = (c) => {
      minimap.attach(c);
    };
    fieldListener = (name, data) => {
      r.overlay.setField(name, data);
    };
    r.cityCamera.onFollowChange((agent) => {
      following.value = agent?.label ?? null;
    });
    // Agents, the clock and the weather hold still while the game is paused.
    speed.subscribe((s) => {
      r.agents.paused = s === 'paused' && !titleMode;
      r.buildings.paused = s === 'paused' && !titleMode;
      r.atmosphere.paused = s === 'paused' || titleMode;
    });
    if (titleMode) {
      // A slow turn around the sample city on a clear summer evening.
      r.atmosphere.clock.timeOfDay = 0.735;
      r.atmosphere.weather.change(6, 'clear');
      r.atmosphere.setDate(6, 0.5);
      r.cityCamera.autoOrbit = 0.035;
      r.cityCamera.setPitch(0.5);
      r.onTerrainShown(() => {
        // Centre on the built-up area.
        let sx = 0;
        let sz = 0;
        let n = 0;
        for (let i = 0; i < mirror.tiles.length; i++) {
          if ((mirror.tiles[i] ?? 0) < 64) continue;
          sx += i % size;
          sz += Math.floor(i / size);
          n++;
        }
        r.cityCamera.focus(n ? sx / n : size / 2, n ? sz / n : size / 2, 46);
      });
    }
    // ?time=0.9 starts at that time of day; ?weather=rain starts in that weather.
    const startTime = Number(params.get('time'));
    if (params.has('time') && Number.isFinite(startTime)) r.atmosphere.clock.timeOfDay = startTime % 1;
    const startWeather = params.get('weather');
    if (startWeather && ['clear', 'overcast', 'rain', 'storm', 'snow', 'fog'].includes(startWeather)) {
      r.atmosphere.weather.change(0, startWeather as 'clear');
    }
    setInterval(() => {
      const a = r.atmosphere;
      skyState.value = { time: a.clock.hhmm, night: a.night > 0.5, weather: a.weather.kind };
    }, 1000);
    activeDisasters.subscribe((list) => {
      r.fx.setActive(list);
    });
    // The underground view shows while V has it on or a subway tool is picked.
    const showUnderground = () => {
      r.setUnderground(undergroundView.value || activeTool.value === 'subway' || activeTool.value === 'subwayStation');
    };
    undergroundView.subscribe(showUnderground);
    activeTool.subscribe(showUnderground);
    overlay.subscribe((name) => {
      r.setOverlay(name);
      // Power and zoning come from the tile mirror; every other overlay needs its field streamed.
      sim.subscribeField(name && !isTileOverlay(name) ? (name as FieldName) : null);
    });
    r.onTerrainShown(() => {
      // Tests and tooling wait for this marker.
      document.documentElement.dataset.rendered = 'true';
    });
    new ToolController(canvas, r, sim);
    r.start();
    // Too slow for the chosen quality: drop one tier, once, and say so.
    if (!forcedQuality && !titleMode) {
      const auto = new AutoQuality();
      r.onFrame((dt) => {
        if (document.hidden || !auto.sample(dt * 1000)) return;
        const lower = lowerQuality(settings.value.quality);
        if (!lower) return;
        settings.value = { ...settings.value, quality: lower };
        toast(`Graphics lowered to ${lower[0]?.toUpperCase() ?? ''}${lower.slice(1)} to keep things smooth (Settings to change)`, 'info', 6000);
      });
    }
    const debug: Record<string, unknown> = { sim, mirror, renderer: r };
    if (import.meta.env.DEV || params.has('debug')) {
      // Debug handle for scripted checks: the dev server, or any build with ?debug.
      (window as unknown as { __tim: unknown }).__tim = debug;
    }
    // Sound: synthesized live, loaded after the first frame and started by
    // the first click or key press.
    r.onTerrainShown(() => {
      void import('./audio').then(({ CityAudio }) => {
        const a = new CityAudio(r, mirror);
        audio = a;
        debug.audio = a;
        a.listenForGesture();
        a.approval = () => evaluation.value?.approval ?? 50;
        speed.subscribe((s) => {
          a.setPaused(s === 'paused' && !titleMode);
        });
        volumes.subscribe((v) => {
          a.setVolumes(v);
        });
        setInterval(() => {
          a.update(0.05);
        }, 50);
      });
    });
  } catch (err) {
    webglError = err instanceof Error ? err.message : String(err);
    console.error('WebGL renderer failed to start:', webglError);
  }

  // The pause menu stops the game while it is open and restores the speed after.
  let pauseResume: Speed | null = null;
  pauseOpen.subscribe((open) => {
    if (open && speed.value !== 'paused') {
      pauseResume = speed.value;
      sim.setSpeed('paused');
    } else if (!open && pauseResume) {
      sim.setSpeed(pauseResume);
      pauseResume = null;
    }
  });
  // What the onboarding tips watch.
  setInterval(() => {
    let roads = 0;
    let lines = 0;
    let zones = 0;
    let plants = 0;
    for (let i = 0; i < mirror.tiles.length; i++) {
      const k = mirror.tiles[i] ?? 0;
      if (isRoad(k)) roads++;
      if (isPower(k)) lines++;
      if (mirror.parts[i] === 1) {
        if (zoneOf(k)) zones++;
        else if (isPlant(k)) plants++;
      }
    }
    const c = census.value;
    cityFacts.value = { roads, lines, zones, plants, unpowered: c?.unpoweredZones ?? 0, pop: c?.resPop ?? 0 };
  }, 2000);

  // The budget window pauses the game while it is open and restores the speed after.
  let resumeSpeed: Speed | null = null;
  const openBudget = () => {
    if (speed.value !== 'paused') {
      resumeSpeed = speed.value;
      sim.setSpeed('paused');
    }
    budgetOpen.value = true;
  };
  budgetOpen.subscribe((open) => {
    if (open && speed.value !== 'paused' && resumeSpeed === null) openBudget();
  });
  const onBudgetClose = () => {
    budgetOpen.value = false;
    if (resumeSpeed) sim.setSpeed(resumeSpeed);
    resumeSpeed = null;
  };

  const details = (): SaveDetails => ({
    cityName: cityInfo.value?.name ?? 'City',
    date: formatDate(date.value),
    population: census.value?.resPop ?? 0,
    thumbnail: renderer?.capture(256) ?? '',
  });
  const saveAs = async (slot: string) => {
    const thumbnail = details();
    await saveSlot(slot, await sim.snapshot(), thumbnail);
    savesChanged.value++;
    currentSlot.value = slot;
    toast(`Saved "${slot}"`, 'info');
  };

  render(
    h(App, {
      webglError,
      onSpeed: (next: Speed) => {
        sim.setSpeed(next);
      },
      send: (command) => {
        sim.command(command);
      },
      onBudgetClose,
      onShowMe: (x, y) => {
        renderer?.cityCamera.flyTo(x, y);
      },
      bindMinimap: (c) => {
        bindMinimap(c);
      },
      requestHistory: () => {
        sim.requestHistory();
      },
      follow: {
        next: () => {
          const cam = renderer?.cityCamera;
          if (cam) renderer?.follow(cam.nextVehicle(cam.following));
        },
        stop: () => {
          renderer?.follow(null);
        },
      },
      title: {
        preview: (seed, size, terrain) => sim.preview(seed, size, terrain),
        start: (o) => {
          const next = new URLSearchParams();
          next.set('new', '1');
          next.set('name', o.name);
          next.set('seed', o.seed);
          next.set('size', String(o.size));
          next.set('difficulty', o.difficulty);
          for (const key of ['water', 'forest', 'hills'] as const) next.set(key, String(o.terrain[key]));
          navigate(next);
        },
        resume: () => {
          pauseOpen.value = false;
        },
        quit: () => {
          navigate(new URLSearchParams());
        },
      },
      saves: {
        save: saveAs,
        load: (slot, auto) => {
          reloadInto(slot, auto);
        },
        remove: async (slot, auto) => {
          await deleteSave(slot, auto);
          savesChanged.value++;
        },
        exportCity: async () => {
          await exportFile(await sim.snapshot(), cityInfo.value?.name ?? 'city');
        },
        importCity: async (file) => {
          reloadInto(await importFile(file), false);
        },
      },
    }),
    appRoot,
  );

  // M mutes and unmutes.
  window.addEventListener('keydown', (e) => {
    const el = e.target as HTMLElement | null;
    if (e.code !== 'KeyM' || e.ctrlKey || e.metaKey || e.altKey || el?.closest('input, textarea, select')) return;
    const muted = !volumes.value.muted;
    volumes.value = { ...volumes.value, muted };
    toast(muted ? 'Sound off (M)' : 'Sound on (M)', 'info', 1500);
  });
  // A soft click for every button in the interface.
  appRoot.addEventListener('click', (e) => {
    if ((e.target as HTMLElement | null)?.closest('button')) audio?.play('click');
  });
  budgetOpen.subscribe((open) => {
    if (open) audio?.play('budgetOpen');
  });

  // Ctrl+S saves to the current slot, or one named after the city.
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') {
      e.preventDefault();
      void saveAs(currentSlot.value ?? cityInfo.value?.name ?? 'City');
    }
  });

  sim.onHistory((h) => {
    history.value = h;
  });
  sim.onEvent((event) => {
    // Keep open graphs current, a month at a time.
    if (event.type === 'monthEnd' && graphsOpen.value) sim.requestHistory();
    if (event.type === 'news') addHeadline(event.headline, formatDate(date.value), event.x, event.y);
    if (event.type === 'toolResult' && !event.dryRun) {
      if (!event.ok) audio?.play('cannotPlace');
      else audio?.play(activeTool.value === 'bulldoze' ? 'bulldoze' : 'place');
    }
    if (event.type === 'milestone') audio?.play('milestone');
    if (event.type === 'milestone') {
      const unlocked = event.unlocked.length > 0 ? `. Unlocked: ${event.unlocked.map(unlockName).join(', ')}` : '';
      toast(`${event.cityClass}! Population ${event.population.toLocaleString('en-US')}${unlocked}`, 'info', 6000);
    }
    if (event.type === 'yearBudget' && !titleMode) {
      audio?.play('coin');
      void sim.snapshot().then((bytes) => autosave(bytes, details())).then(() => {
        savesChanged.value++;
      });
      if (autoBudget.value) openBudget();
      else toast(`${String(event.year)} closed: ${event.net >= 0 ? 'surplus' : 'deficit'} of ${formatMoney(Math.abs(event.net))}`, 'info', 5000);
    }
    if (event.type === 'bankrupt') gameOver.value = true;
    if (event.type === 'disaster') {
      onDisasterStarted(event.disaster, () => {
        renderer?.cityCamera.flyTo(event.x, event.y);
      });
    }
    if (event.type === 'disasterRefused') {
      watchNext.value = false;
      toast(event.reason);
    }
    if (event.type === 'demandCap') {
      const what = { r: 'Homes', c: 'Commerce', i: 'Industry' }[event.zone];
      toast(`${what} have stopped growing. The city needs a powered ${event.needs}.`, 'error', 7000);
    }
    if (event.type === 'brownout') {
      toast(`Brownout: ${String(event.unpowered)} zones have no power. Build another power plant.`, 'error', 6000);
    }
  });

  if (import.meta.env.DEV) {
    sim.onTick(({ date: d, census: c, valves: v }) => {
      if (d.tick !== 0) return;
      console.log(
        `[sim] ${String(d.year)}-${String(d.month + 1).padStart(2, '0')} pop ${String(c.resPop)} jobs C${String(c.comJobs)}/I${String(c.indJobs)}` +
          ` power ${String(c.powerDemand)}/${String(c.powerSupply)} valves R${String(v.r)} C${String(v.c)} I${String(v.i)}`,
      );
    });
  }

  const cityName = (params.get('name') ?? '').trim().slice(0, 32) || 'New City';
  const info = await (saveBytes ? sim.load(saveBytes) : sim.init({ name: cityName, seed, size }, terrain, difficulty));
  cityInfo.value = info;
  document.documentElement.dataset.sim = 'ready';
  if (titleMode) {
    // The sample city stays paused behind the menu; no autosaves, no pop-ups.
  } else if (benchName) {
    // Benchmarks render the heaviest scene: night, rain, every agent moving,
    // and the sim at fast speed sending changes every tick.
    renderer?.atmosphere.clock.forceTimeOfDay(0.9);
    renderer?.atmosphere.weather.forceWeather('rain');
    sim.setSpeed('fast');
  } else if (saveBytes) {
    // A loaded city waits, paused, until the player is ready.
    currentSlot.value = loadName;
    toast(`Loaded "${loadName ?? ''}"`, 'info');
  } else {
    // So does a new one: an empty city's clock would only run down the funds.
    toast('Paused. Press Play (or 2) when you’re ready to start the clock.', 'info', 6000);
  }
}

/** Set once the renderer exists; the minimap canvas may mount first. */
let bindMinimap: (canvas: HTMLCanvasElement) => void = () => undefined;

void start();
