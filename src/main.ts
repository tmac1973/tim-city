import { h, render } from 'preact';
import type { MapSize, Speed } from './shared/constants';
import { DEFAULT_TERRAIN, type TerrainOptions } from './shared/protocol';
import { CityMirror } from './render/mirror';
import { Renderer } from './render/renderer';
import { SimBridge } from './sim/bridge';
import { App } from './ui/App';
import { cityInfo, date, funds, speed, toast } from './ui/store';
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

const mirror = new CityMirror(size);
const sim = new SimBridge();
sim.onTick((tick) => {
  mirror.apply(tick.chunks);
  date.value = tick.date;
  funds.value = tick.funds;
  speed.value = tick.speed;
});

// Mount the UI even if WebGL fails, so the failure can be reported on screen.
let webglError: string | null = null;
try {
  const renderer = new Renderer(canvas, mirror);
  renderer.onTerrainShown(() => {
    // Tests and tooling wait for this marker.
    document.documentElement.dataset.rendered = 'true';
  });
  new ToolController(canvas, renderer, sim);
  renderer.start();
  if (import.meta.env.DEV) {
    // Debug handle for scripted checks in the dev server only.
    (window as unknown as { __tim: unknown }).__tim = { sim, mirror, renderer };
  }
} catch (err) {
  webglError = err instanceof Error ? err.message : String(err);
  console.error('WebGL renderer failed to start:', webglError);
}
const onSpeed = (next: Speed) => {
  sim.setSpeed(next);
};
render(h(App, { webglError, onSpeed }), appRoot);

sim.onEvent((event) => {
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

void sim.init({ name: 'New City', seed, size }, terrain).then((info) => {
  cityInfo.value = info;
  document.documentElement.dataset.sim = 'ready';
  sim.setSpeed('normal');
});
