import { h, render } from 'preact';
import { Renderer } from './render/renderer';
import { App } from './ui/App';

const canvas = document.querySelector<HTMLCanvasElement>('#scene');
const appRoot = document.querySelector<HTMLDivElement>('#app');
if (!canvas || !appRoot) {
  throw new Error('index.html is missing #scene or #app');
}

const renderer = new Renderer(canvas);
renderer.start();
render(h(App, null), appRoot);
