import { h, render } from 'preact';
import type { MapSize, Speed } from './shared/constants';
import type { DifficultyName } from './shared/difficulty';
import { DEFAULT_TERRAIN, type TerrainOptions } from './shared/protocol';
import { CityMirror } from './render/mirror';
import { Renderer } from './render/renderer';
import { SimBridge } from './sim/bridge';
import { App } from './ui/App';
import {
  addHeadline,
  autoBudget,
  budget,
  budgetOpen,
  census,
  cityInfo,
  date,
  evaluation,
  formatDate,
  formatMoney,
  funds,
  gameOver,
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
const seed = params.get('seed') ?? 'tim';
const size: MapSize = params.get('size') === '256' ? 256 : 128;
/** Read a 0–100 slider from the query string, falling back to the default. */
const slider = (key: keyof TerrainOptions): number => {
  const value = Number(params.get(key));
  return params.has(key) && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : DEFAULT_TERRAIN[key];
};
const terrain: TerrainOptions = { water: slider('water'), forest: slider('forest'), hills: slider('hills') };
const difficultyParam = params.get('difficulty');
const difficulty: DifficultyName = difficultyParam === 'easy' || difficultyParam === 'hard' ? difficultyParam : 'medium';

const mirror = new CityMirror(size);
const sim = new SimBridge();
sim.onTick((tick) => {
  mirror.apply(tick.chunks);
  date.value = tick.date;
  funds.value = tick.funds;
  speed.value = tick.speed;
  census.value = tick.census;
  valves.value = tick.valves;
  budget.value = tick.budget;
  evaluation.value = tick.evaluation;
});

// Mount the UI even if WebGL fails, so the failure can be reported on screen.
let webglError: string | null = null;
/** Points the camera at a tile; a no-op until the renderer exists. */
let flyTo: (x: number, y: number) => void = () => undefined;
try {
  const renderer = new Renderer(canvas, mirror);
  flyTo = (x, y) => {
    renderer.cityCamera.flyTo(x, y);
  };
  renderer.onTerrainShown(() => {
    // Tests and tooling wait for this marker.
    document.documentElement.dataset.rendered = 'true';
  });
  new ToolController(canvas, renderer, sim);
  renderer.start();
  if (import.meta.env.DEV || params.has('debug')) {
    // Debug handle for scripted checks: the dev server, or any build with ?debug.
    (window as unknown as { __tim: unknown }).__tim = { sim, mirror, renderer };
  }
} catch (err) {
  webglError = err instanceof Error ? err.message : String(err);
  console.error('WebGL renderer failed to start:', webglError);
}
const onSpeed = (next: Speed) => {
  sim.setSpeed(next);
};
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
render(
  h(App, {
    webglError,
    onSpeed,
    send: (command) => {
      sim.command(command);
    },
    onBudgetClose,
    onShowMe: (x, y) => {
      flyTo(x, y);
    },
  }),
  appRoot,
);

sim.onEvent((event) => {
  if (event.type === 'news') addHeadline(event.headline, formatDate(date.value), event.x, event.y);
  if (event.type === 'milestone') toast(`${event.cityClass}! Population ${event.population.toLocaleString('en-US')}`, 'info', 6000);
  if (event.type === 'yearBudget') {
    if (autoBudget.value) openBudget();
    else toast(`${String(event.year)} closed: ${event.net >= 0 ? 'surplus' : 'deficit'} of ${formatMoney(Math.abs(event.net))}`, 'info', 5000);
  }
  if (event.type === 'bankrupt') gameOver.value = true;
  if (event.type === 'demandCap') {
    const what = { r: 'Homes', c: 'Commerce', i: 'Industry' }[event.zone];
    toast(`${what} have stopped growing. The city needs a powered ${event.needs}.`, 'error', 7000);
  }
  if (event.type === 'brownout') {
    toast(`Brownout: ${String(event.unpowered)} zones have no power. Build another power plant.`, 'error', 6000);
  }
});

if (import.meta.env.DEV) {
  sim.onTick(({ date: d, census, valves }) => {
    if (d.tick !== 0) return;
    const { resPop, comJobs, indJobs, powerDemand, powerSupply } = census;
    console.log(
      `[sim] ${String(d.year)}-${String(d.month + 1).padStart(2, '0')} pop ${String(resPop)} jobs C${String(comJobs)}/I${String(indJobs)}` +
        ` power ${String(powerDemand)}/${String(powerSupply)} valves R${String(valves.r)} C${String(valves.c)} I${String(valves.i)}`,
    );
  });
}

void sim.init({ name: 'New City', seed, size }, terrain, difficulty).then((info) => {
  cityInfo.value = info;
  document.documentElement.dataset.sim = 'ready';
  sim.setSpeed('normal');
});
