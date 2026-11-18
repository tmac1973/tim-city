import { h, render } from 'preact';
import { Renderer } from './render/renderer';
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
