import { Color, Fog, Raycaster, Scene, Vector2, WebGLRenderer, PCFShadowMap } from 'three';
import { QUALITY, type QualityName, type QualityPreset } from '@/shared/settings';
import { AgentLayer } from './agents';
import { AGENT_SCALE } from './agents/budget';
import { Atmosphere } from './atmosphere';
import type { Agent } from './agents/core';
import { BuildingLayer } from './buildings/instances';
import { FxLayer } from './fx';
import { FX_SCALE } from './fx/tiles';
import { CityCamera } from './camera';
import { TileCursor } from './cursor';
import { Lighting } from './lighting';
import { NetworkLayer } from './networks';
import { OverlayLayer, type OverlayName } from './overlays';
import { Changed, type CityMirror } from './mirror';
import { PALETTE } from './palette';
import { pickTile, type PickResult } from './picking';
import { PostFx } from './post';
import { TerrainLayer } from './terrain';
import { LotGuide } from './lotGuide';
import { ToolPreview } from './toolPreview';
import { TreeLayer } from './trees';
import { WaterLayer } from './water';

/** Chunks rebuilt per frame after the first load (see `frame`). */
const REBUILDS_PER_FRAME = 4;

/** Owns the WebGL context, the scene and the frame loop. */
export class Renderer {
  readonly scene = new Scene();
  readonly cityCamera: CityCamera;
  /** Tile under the mouse, or null. */
  hovered: PickResult | null = null;
  readonly preview: ToolPreview;
  /** Zone lots that would fit beside the road being drawn. */
  readonly lotGuide: LotGuide;

  private readonly webgl: WebGLRenderer;
  private readonly post: PostFx;
  private readonly lighting: Lighting;
  private readonly terrain: TerrainLayer;
  private readonly water: WaterLayer;
  private readonly trees: TreeLayer;
  private readonly networks: NetworkLayer;
  readonly buildings: BuildingLayer;
  readonly overlay: OverlayLayer;
  readonly fx: FxLayer;
  readonly agents: AgentLayer;
  readonly atmosphere: Atmosphere;
  private recentlyFollowed: Agent[] = [];
  private readonly hoverListeners: ((tile: PickResult | null) => void)[] = [];
  private readonly cursor: TileCursor;
  /** Chunk id → what changed there (Changed bits), waiting to be rebuilt. */
  private readonly dirty = new Map<number, number>();
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private pointerInside = false;
  private elapsed = 0;
  private frameCount = 0;
  private shadowEvery = 1;
  private lastTime = 0;
  private terrainShown = false;
  private readonly terrainListeners: (() => void)[] = [];
  private readonly frameListeners: ((dt: number) => void)[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    readonly mirror: CityMirror,
    quality: QualityName = 'high',
  ) {
    // postprocessing renders into its own buffers, so the default ones are off.
    this.webgl = new WebGLRenderer({
      canvas,
      powerPreference: 'high-performance',
      antialias: false,
      stencil: false,
      depth: false,
    });
    const preset = QUALITY[quality];
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, preset.pixelRatio));
    this.webgl.shadowMap.enabled = preset.shadowMap > 0;
    this.webgl.shadowMap.type = PCFShadowMap;

    this.scene.background = new Color(PALETTE.sky);
    this.scene.fog = new Fog(PALETTE.skyHorizon, mirror.size * 1.3, mirror.size * 3);

    this.cityCamera = new CityCamera(canvas, mirror.size, (x, z) => mirror.heightAt(x, z));
    this.lighting = new Lighting(this.scene);
    this.overlay = new OverlayLayer(mirror);
    this.terrain = new TerrainLayer(mirror, this.overlay.drapeMaterial);
    this.water = new WaterLayer(mirror);
    this.trees = new TreeLayer(mirror);
    this.networks = new NetworkLayer(mirror);
    this.buildings = new BuildingLayer(mirror);
    this.fx = new FxLayer(mirror);
    const networks = this.networks;
    this.agents = new AgentLayer(
      mirror,
      (x, z) => networks.surfaceAt(x, z, 'road'),
      (x, z) => networks.surfaceAt(x, z, 'rail'),
    );
    this.atmosphere = new Atmosphere(this.scene, mirror, this.lighting);
    this.cityCamera.nextVehicle = (current) => {
      const next = this.agents.nextAfter(current, this.recentlyFollowed);
      if (next) this.recentlyFollowed = [next, ...this.recentlyFollowed].slice(0, 4);
      return next;
    };
    this.cursor = new TileCursor(mirror);
    this.preview = new ToolPreview(mirror);
    this.lotGuide = new LotGuide(mirror);
    this.scene.add(
      this.terrain.group,
      this.water.group,
      this.trees.group,
      this.networks.group,
      this.buildings.group,
      this.fx.group,
      this.agents.group,
      this.atmosphere.group,
      this.overlay.group,
      this.terrain.drapes,
      this.cursor.line,
      this.preview.mesh,
      this.lotGuide.lines,
    );
    this.post = new PostFx(this.webgl, this.scene, this.cityCamera.camera, preset);
    this.applyScales(preset);
    if (preset.shadowMap > 0) this.lighting.sun.shadow.mapSize.set(preset.shadowMap, preset.shadowMap);

    mirror.onChunkChanged((id, changed) => this.dirty.set(id, (this.dirty.get(id) ?? 0) | changed));
    this.listenPointer();
    this.resize();
    window.addEventListener('resize', () => {
      this.resize();
    });
  }

  /** Show a data overlay (null: none); buildings and trees fade while one is on. */
  setOverlay(name: OverlayName | null): void {
    this.overlay.setActive(name);
    this.terrain.drapes.visible = name !== null;
    this.buildings.setFade(name !== null);
    this.trees.setFade(name !== null);
  }

  /**
   * Where the screen's four corners meet the ground plane at the camera
   * target's height, for the minimap's view outline.
   */
  viewFootprint(): [number, number][] {
    const cam = this.cityCamera.camera;
    const y = this.cityCamera.target.y;
    const out: [number, number][] = [];
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      this.raycaster.setFromCamera(new Vector2(sx, sy), cam);
      const { origin, direction } = this.raycaster.ray;
      // Corners above the horizon fall back to a far point along the ray.
      const t = direction.y < -1e-3 ? (y - origin.y) / direction.y : this.mirror.size * 2;
      out.push([origin.x + direction.x * t, origin.z + direction.z * t]);
    }
    return out;
  }

  /**
   * A small JPEG of the current view, for save thumbnails. Renders a frame
   * and reads the canvas in the same task, before the browser clears it.
   */
  capture(width: number): string {
    this.post.render(0);
    const scaled = document.createElement('canvas');
    scaled.width = width;
    scaled.height = Math.round((width * this.canvas.height) / this.canvas.width);
    scaled.getContext('2d')?.drawImage(this.canvas, 0, 0, scaled.width, scaled.height);
    return scaled.toDataURL('image/jpeg', 0.75);
  }

  /** Switch graphics quality while running. */
  setQuality(quality: QualityName): void {
    const preset = QUALITY[quality];
    const shadows = preset.shadowMap > 0;
    const sun = this.lighting.sun;
    if (shadows !== this.webgl.shadowMap.enabled || (shadows && sun.shadow.mapSize.x !== preset.shadowMap)) {
      this.webgl.shadowMap.enabled = shadows;
      if (shadows) sun.shadow.mapSize.set(preset.shadowMap, preset.shadowMap);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
      // Shadow support is compiled into every lit material.
      this.scene.traverse((o) => {
        const material = (o as { material?: { needsUpdate: boolean } | { needsUpdate: boolean }[] }).material;
        for (const m of Array.isArray(material) ? material : material ? [material] : []) m.needsUpdate = true;
      });
    }
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, preset.pixelRatio));
    this.post.configure(preset);
    this.applyScales(preset);
    this.resize();
  }

  private applyScales(preset: QualityPreset): void {
    this.shadowEvery = preset.shadowEvery;
    this.webgl.shadowMap.autoUpdate = preset.shadowEvery <= 1;
    AGENT_SCALE.value = preset.agents;
    FX_SCALE.value = preset.particles;
  }

  /** The vehicle under the mouse pointer, if any. */
  vehicleAtPointer(): Agent | null {
    if (!this.pointerInside) return null;
    this.raycaster.setFromCamera(this.pointer, this.cityCamera.camera);
    return this.agents.pick(this.raycaster.ray);
  }

  /** Ride with a vehicle (null: stop following). */
  follow(agent: Agent | null): void {
    if (agent) this.recentlyFollowed = [agent, ...this.recentlyFollowed.filter((a) => a !== agent)].slice(0, 4);
    this.cityCamera.follow(agent);
  }

  /** Called whenever the hovered tile changes (null when off the map). */
  onHoverChange(listener: (tile: PickResult | null) => void): void {
    this.hoverListeners.push(listener);
  }

  /** Called after every frame with its duration in seconds. */
  onFrame(listener: (dt: number) => void): void {
    this.frameListeners.push(listener);
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
    // Rebuild at most a few chunks a frame so a busy month never stalls one;
    // the first load builds everything at once.
    let budget = this.terrainShown ? REBUILDS_PER_FRAME : Infinity;
    let flagsChanged = false;
    for (const [id, changed] of this.dirty) {
      if (budget-- <= 0) break;
      this.dirty.delete(id);
      // Each layer rebuilds only for the changes it draws.
      if (changed & (Changed.NATURE | Changed.HEIGHTS)) {
        this.terrain.rebuild(id);
        this.water.rebuild(id);
        this.trees.rebuild(id);
      }
      if (changed & (Changed.NETWORK | Changed.HEIGHTS)) this.atmosphere.lamps.rebuild(id);
      if (changed & (Changed.NETWORK | Changed.HEIGHTS | Changed.POTHOLES)) this.networks.rebuild(id);
      this.buildings.rebuild(id);
      if (changed & (Changed.TILES | Changed.FLAGS | Changed.HEIGHTS)) this.fx.rebuild(id);
      if (changed & (Changed.FLAGS | Changed.PARTS)) flagsChanged = true;
    }
    if (flagsChanged) this.overlay.refreshTiles();
    this.trees.flush();

    const cam = this.cityCamera;
    // Agents move first so a chase camera sees this frame's position.
    this.agents.update(dt, cam.target, cam.following ? 0 : cam.distance, this.atmosphere.night, cam.camera.position);
    cam.update(dt);
    this.atmosphere.update(dt, cam.camera.position, cam.target, cam.distance);
    this.lighting.fit(cam.target, Math.min(this.mirror.size * 0.75, Math.max(20, cam.distance * 0.9)));
    this.water.update(this.elapsed, this.lighting.sunDir, this.lighting.sun.color.clone().multiplyScalar(this.lighting.sun.intensity / 2.6));
    this.buildings.updateLod(dt, cam.camera.position);
    this.buildings.update(dt);
    this.fx.update(dt, cam.target);
    // Earthquake shake: nudge the finished camera; next frame starts clean.
    const [sx, sy, sz] = this.fx.shake.offset(0.45);
    cam.camera.position.x += sx;
    cam.camera.position.y += sy;
    cam.camera.position.z += sz;
    // Street level has no miniature look: the sharp band covers the screen.
    if (cam.following) this.post.setView(0, 1);
    else this.post.setView(cam.zoom, cam.topDown);
    this.updateHover();
    // Medium quality and below redraw shadows every other frame.
    this.frameCount++;
    if (this.shadowEvery > 1 && this.frameCount % this.shadowEvery === 0) this.webgl.shadowMap.needsUpdate = true;
    this.post.render(dt);
    for (const listener of this.frameListeners) listener(dt);

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
