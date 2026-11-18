import { Color, Fog, Raycaster, Scene, Vector2, WebGLRenderer, PCFShadowMap } from 'three';
import { CityCamera } from './camera';
import { TileCursor } from './cursor';
import { Lighting } from './lighting';
import { NetworkLayer } from './networks';
import type { CityMirror } from './mirror';
import { PALETTE } from './palette';
import { pickTile, type PickResult } from './picking';
import { PostFx } from './post';
import { TerrainLayer } from './terrain';
import { ToolPreview } from './toolPreview';
import { TreeLayer } from './trees';
import { WaterLayer } from './water';

/** Owns the WebGL context, the scene and the frame loop. */
export class Renderer {
  readonly scene = new Scene();
  readonly cityCamera: CityCamera;
  /** Tile under the mouse, or null. */
  hovered: PickResult | null = null;
  readonly preview: ToolPreview;

  private readonly webgl: WebGLRenderer;
  private readonly post: PostFx;
  private readonly lighting: Lighting;
  private readonly terrain: TerrainLayer;
  private readonly water: WaterLayer;
  private readonly trees: TreeLayer;
  private readonly networks: NetworkLayer;
  private readonly hoverListeners: ((tile: PickResult | null) => void)[] = [];
  private readonly cursor: TileCursor;
  private readonly dirty = new Set<number>();
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private pointerInside = false;
  private elapsed = 0;
  private lastTime = 0;
  private terrainShown = false;
  private readonly terrainListeners: (() => void)[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly mirror: CityMirror,
  ) {
    // postprocessing renders into its own buffers, so the default ones are off.
    this.webgl = new WebGLRenderer({
      canvas,
      powerPreference: 'high-performance',
      antialias: false,
      stencil: false,
      depth: false,
    });
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.webgl.shadowMap.enabled = true;
    this.webgl.shadowMap.type = PCFShadowMap;

    this.scene.background = new Color(PALETTE.sky);
    this.scene.fog = new Fog(PALETTE.skyHorizon, mirror.size * 1.3, mirror.size * 3);

    this.cityCamera = new CityCamera(canvas, mirror.size, (x, z) => mirror.heightAt(x, z));
    this.lighting = new Lighting(this.scene);
    this.terrain = new TerrainLayer(mirror);
    this.water = new WaterLayer(mirror);
    this.trees = new TreeLayer(mirror);
    this.networks = new NetworkLayer(mirror);
    this.cursor = new TileCursor(mirror);
    this.preview = new ToolPreview(mirror);
    this.scene.add(
      this.terrain.group,
      this.water.group,
      this.trees.group,
      this.networks.group,
      this.cursor.line,
      this.preview.mesh,
    );
    this.post = new PostFx(this.webgl, this.scene, this.cityCamera.camera);

    mirror.onChunkChanged((id) => this.dirty.add(id));
    this.listenPointer();
    this.resize();
    window.addEventListener('resize', () => {
      this.resize();
    });
  }

  /** Called whenever the hovered tile changes (null when off the map). */
  onHoverChange(listener: (tile: PickResult | null) => void): void {
    this.hoverListeners.push(listener);
  }

  /** Called once, after the first frame that shows terrain. */
  onTerrainShown(listener: () => void): void {
    this.terrainListeners.push(listener);
  }

  start(): void {
    this.lastTime = performance.now();
    this.webgl.setAnimationLoop((time: number) => {
      const dt = Math.min(0.1, (time - this.lastTime) / 1000);
      this.lastTime = time;
      this.frame(dt);
    });
  }

  private frame(dt: number): void {
    this.elapsed += dt;
    const hadDirty = this.dirty.size > 0;
    for (const id of this.dirty) {
      this.terrain.rebuild(id);
      this.water.rebuild(id);
      this.trees.rebuild(id);
      this.networks.rebuild(id);
    }
    this.dirty.clear();
    this.trees.flush();

    const cam = this.cityCamera;
    cam.update(dt);
    this.lighting.fit(cam.target, Math.min(this.mirror.size * 0.75, Math.max(20, cam.distance * 0.9)));
    this.water.update(this.elapsed, this.lighting.sunDir);
    this.post.setView(cam.zoom, cam.topDown);
    this.updateHover();
    this.post.render(dt);

    if (hadDirty && !this.terrainShown) {
      this.terrainShown = true;
      for (const listener of this.terrainListeners) listener();
    }
  }

  private updateHover(): void {
    const before = this.hovered;
    if (!this.pointerInside) {
      this.hovered = null;
    } else {
      this.raycaster.setFromCamera(this.pointer, this.cityCamera.camera);
      const { origin, direction } = this.raycaster.ray;
      this.hovered = pickTile((x, y) => this.mirror.corner(x, y), this.mirror.size, origin, direction);
    }
    this.cursor.show(this.hovered);
    const after = this.hovered;
    if (before?.x !== after?.x || before?.y !== after?.y) {
      for (const listener of this.hoverListeners) listener(after);
    }
  }

  private listenPointer(): void {
    this.canvas.addEventListener('pointermove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      this.pointerInside = true;
    });
    this.canvas.addEventListener('pointerleave', () => {
      this.pointerInside = false;
    });
  }

  private resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.webgl.setSize(width, height, false);
    this.post.setSize(width, height);
    this.cityCamera.setAspect(width / height);
  }
}
