import { Color, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import type { MapSize } from '@/shared/constants';
import { CityMirror } from './mirror';
import { PALETTE } from './palette';
import { TerrainLayer } from './terrain';
import { TreeLayer } from './trees';
import { WaterLayer } from './water';

/**
 * A small turntable view of a would-be map for the New City screen: the
 * game's own terrain, water and tree layers on their own WebGL canvas.
 */
export class PreviewScene {
  private readonly webgl: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(36, 1, 0.5, 2000);
  private layers: { mirror: CityMirror; terrain: TerrainLayer; water: WaterLayer; trees: TreeLayer } | null = null;
  private yaw = Math.PI / 4;
  private frame = 0;
  private last = performance.now();
  private time = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.webgl = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene.add(new HemisphereLight(PALETTE.sky, PALETTE.groundBounce, 1.3));
    const sun = new DirectionalLight(PALETTE.sun, 2.4);
    sun.position.set(-60, 90, -40);
    this.scene.add(sun);
    this.scene.background = new Color(PALETTE.skyHorizon);
    const loop = (now: number) => {
      this.frame = requestAnimationFrame(loop);
      this.draw(now);
    };
    this.frame = requestAnimationFrame(loop);
  }

  /** Show a map's heights and tiles, rebuilding the layers if the size changed. */
  show(size: MapSize, heights: Uint8Array, tiles: Uint16Array): void {
    if (this.layers?.mirror.size !== size) {
      if (this.layers) this.scene.remove(this.layers.terrain.group, this.layers.water.group, this.layers.trees.group);
      const mirror = new CityMirror(size);
      this.layers = { mirror, terrain: new TerrainLayer(mirror), water: new WaterLayer(mirror), trees: new TreeLayer(mirror) };
      this.scene.add(this.layers.terrain.group, this.layers.water.group, this.layers.trees.group);
    }
    const { mirror, terrain, water, trees } = this.layers;
    mirror.heights.set(heights);
    mirror.tiles.set(tiles);
    for (let id = 0; id < mirror.chunksPerSide * mirror.chunksPerSide; id++) {
      terrain.rebuild(id);
      water.rebuild(id);
      trees.rebuild(id);
    }
    trees.flush();
  }

  private draw(now: number): void {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === 0 || h === 0 || !this.layers) return;
    const ratio = this.webgl.getPixelRatio();
    if (this.canvas.width !== Math.round(w * ratio) || this.canvas.height !== Math.round(h * ratio)) {
      this.webgl.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    const size = this.layers.mirror.size;
    this.yaw += dt * 0.12;
    const d = size * 1.25;
    this.camera.position.set(size / 2 + Math.sin(this.yaw) * d * 0.72, d * 0.6, size / 2 + Math.cos(this.yaw) * d * 0.72);
    this.camera.lookAt(size / 2, 0, size / 2);
    this.layers.water.update(this.time, this.scene.children[1]?.position.clone().normalize() ?? this.camera.up);
    this.webgl.render(this.scene, this.camera);
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.webgl.dispose();
  }
}
