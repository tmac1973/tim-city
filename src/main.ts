import { h, render } from 'preact';
import type { MapSize } from './shared/constants';
import { DEFAULT_TERRAIN, type TerrainOptions } from './shared/protocol';
import { Renderer } from './render/renderer';
import { SimBridge } from './sim/bridge';
import { App } from './ui/App';

const canvas = document.querySelector<HTMLCanvasElement>('#scene');
const appRoot = document.querySelector<HTMLDivElement>('#app');
if (!canvas || !appRoot) {
  throw new Error('index.html is missing #scene or #app');
}

// Mount the UI first so a WebGL failure can still be reported on screen.
let webglError: string | null = null;
try {
  new Renderer(canvas).start();
} catch (err) {
  webglError = err instanceof Error ? err.message : String(err);
  console.error('WebGL renderer failed to start:', webglError);
}
render(h(App, { webglError }), appRoot);

const params = new URLSearchParams(location.search);
const seed = params.get('seed') ?? 'tim';
const size: MapSize = params.get('size') === '256' ? 256 : 128;
/** Read a 0–100 slider from the query string, falling back to the default. */
const slider = (key: keyof TerrainOptions): number => {
  const value = Number(params.get(key));
  return params.has(key) && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : DEFAULT_TERRAIN[key];
};
const terrain: TerrainOptions = { water: slider('water'), forest: slider('forest'), hills: slider('hills') };

const sim = new SimBridge();
if (import.meta.env.DEV) {
  sim.onTick(({ date, chunks }) => {
    if (date.tick === 0) {
      console.log(`[sim] ${String(date.year)}-${String(date.month + 1).padStart(2, '0')} · ${String(chunks.length)} dirty chunks`);
    }
  });
  sim.onEvent((event) => {
    console.log('[sim event]', event);
  });
}

void sim.init({ name: 'New City', seed, size }, terrain).then(() => {
  // Tests and tooling wait for this marker before driving the sim.
  document.documentElement.dataset.sim = 'ready';
  sim.setSpeed('normal');
});
