import { h, render } from 'preact';
import type { MapSize, Speed } from './shared/constants';
import type { DifficultyName } from './shared/difficulty';
import { DEFAULT_TERRAIN, type FieldName, type TerrainOptions } from './shared/protocol';
import { CityMirror } from './render/mirror';
import { MinimapPainter } from './render/minimap';
import { Renderer } from './render/renderer';
import { autosave, deleteSave, exportFile, importFile, loadSave, saveSlot, type SaveDetails } from './save/saveManager';
import { SimBridge } from './sim/bridge';
import { peekSave } from './sim/serialize';
import { App } from './ui/App';
import {
  activeDisasters,
  addHeadline,
  autoBudget,
  budget,
  budgetOpen,
  census,
  cityInfo,
  currentSlot,
  date,
  evaluation,
  formatDate,
  formatMoney,
  funds,
  gameOver,
  graphsOpen,
  history,
  overlay,
  speed,
  toast,
  valves,
} from './ui/store';
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

/** Reload into a saved city (`?load=`), keeping the debug flag if present. */
function reloadInto(slot: string, auto: boolean): void {
  const next = new URLSearchParams();
  next.set('load', slot);
  if (auto) next.set('auto', '1');
  if (params.has('debug')) next.set('debug', '');
  location.search = next.toString();
}

async function start(): Promise<void> {
  if (!canvas || !appRoot) return;

  // A saved city decides the map size, so read it before building anything.
  const loadName = params.get('load');
  const loadAuto = params.get('auto') === '1';
  let saveBytes: Uint8Array | null = null;
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
    funds.value = tick.funds;
    speed.value = tick.speed;
    census.value = tick.census;
    valves.value = tick.valves;
    budget.value = tick.budget;
    evaluation.value = tick.evaluation;
    activeDisasters.value = tick.disasters;
    if (tick.field) fieldListener?.(tick.field.name, tick.field.data);
  });

  // Mount the UI even if WebGL fails, so the failure can be reported on screen.
  let webglError: string | null = null;
  let renderer: Renderer | null = null;
  try {
    const r = new Renderer(canvas, mirror);
    renderer = r;
    const minimap = new MinimapPainter(mirror, r);
    bindMinimap = (c) => {
      minimap.attach(c);
    };
    fieldListener = (name, data) => {
      r.overlay.setField(name, data);
    };
    activeDisasters.subscribe((list) => {
      r.disasters.setActive(list);
    });
    overlay.subscribe((name) => {
      r.setOverlay(name);
      // Power comes from tile flags; every other overlay needs its field streamed.
      sim.subscribeField(name && name !== 'power' ? name : null);
    });
    r.onTerrainShown(() => {
      // Tests and tooling wait for this marker.
      document.documentElement.dataset.rendered = 'true';
    });
    new ToolController(canvas, r, sim);
    r.start();
    if (import.meta.env.DEV || params.has('debug')) {
      // Debug handle for scripted checks: the dev server, or any build with ?debug.
      (window as unknown as { __tim: unknown }).__tim = { sim, mirror, renderer: r };
    }
  } catch (err) {
    webglError = err instanceof Error ? err.message : String(err);
    console.error('WebGL renderer failed to start:', webglError);
  }

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
      saves: {
        save: saveAs,
        load: (slot, auto) => {
          reloadInto(slot, auto);
        },
        remove: deleteSave,
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
    if (event.type === 'milestone') toast(`${event.cityClass}! Population ${event.population.toLocaleString('en-US')}`, 'info', 6000);
    if (event.type === 'yearBudget') {
      void sim.snapshot().then((bytes) => autosave(bytes, details()));
      if (autoBudget.value) openBudget();
      else toast(`${String(event.year)} closed: ${event.net >= 0 ? 'surplus' : 'deficit'} of ${formatMoney(Math.abs(event.net))}`, 'info', 5000);
    }
    if (event.type === 'bankrupt') gameOver.value = true;
    if (event.type === 'disaster') renderer?.cityCamera.flyTo(event.x, event.y);
    if (event.type === 'disasterRefused') toast(event.reason);
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

  const info = await (saveBytes ? sim.load(saveBytes) : sim.init({ name: 'New City', seed, size }, terrain, difficulty));
  cityInfo.value = info;
  document.documentElement.dataset.sim = 'ready';
  if (saveBytes) {
    // A loaded city waits, paused, until the player is ready.
    currentSlot.value = loadName;
    toast(`Loaded "${loadName ?? ''}"`, 'info');
  } else {
    sim.setSpeed('normal');
  }
}

/** Set once the renderer exists; the minimap canvas may mount first. */
let bindMinimap: (canvas: HTMLCanvasElement) => void = () => undefined;

void start();
