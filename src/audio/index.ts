import { isRoad, TileFlag, TileKind } from '@/shared/tiles';
import type { CityMirror } from '@/render/mirror';
import type { Renderer } from '@/render/renderer';
import { Ambience } from './ambience';
import { DisasterAudio, type Siren } from './disasterAudio';
import { AudioEngine, type Volumes } from './engine';
import { type Mood, Music } from './music';
import { type Point3, placeListener } from './positional';
import { Sfx, type SfxName } from './sfx';

/**
 * All of the game's sound, synthesized live. It reads the renderer's state
 * (camera, weather, agents, effects) and never changes anything.
 */
export class CityAudio {
  readonly engine = new AudioEngine();
  readonly sfx = new Sfx(this.engine);
  private readonly ambience = new Ambience(this.engine);
  private readonly disasters = new DisasterAudio(this.engine);
  private readonly music = new Music(this.engine);
  private analyser: AnalyserNode | null = null;
  private sampleClock = 0;
  private scene = { cars: 0, trees: 0, water: 0, built: 0, burning: 0, burningAt: null as Point3 | null };
  private strikes = 0;
  private lastSiren = new Map<object, Point3>();
  /** Supplies the approval rating for the music's mood. */
  approval: () => number = () => 50;

  constructor(
    private readonly renderer: Renderer,
    private readonly mirror: CityMirror,
  ) {
    this.engine.onReady(() => {
      const ctx = this.engine.ctx;
      if (ctx) {
        this.analyser = ctx.createAnalyser();
        this.analyser.fftSize = 1024;
        this.engine.master.connect(this.analyser);
      }
      this.ambience.start();
      this.disasters.start();
      this.music.start();
    });
    renderer.buildings.onRise((at) => {
      this.sfx.play('zoneGrow', at);
    });
  }

  /** Browsers allow audio only after a gesture: start on the first one. */
  listenForGesture(): void {
    const begin = () => {
      this.engine.start();
      window.removeEventListener('pointerdown', begin);
      window.removeEventListener('keydown', begin);
    };
    window.addEventListener('pointerdown', begin);
    window.addEventListener('keydown', begin);
  }

  setVolumes(v: Partial<Volumes>): void {
    this.engine.setVolumes(v);
  }

  play(name: SfxName, at?: Point3): void {
    this.sfx.play(name, at);
  }

  /** Root-mean-square level of the master output, 0–1 (for checks). */
  level(): number {
    const a = this.analyser;
    if (!a) return 0;
    const data = new Float32Array(a.fftSize);
    a.getFloatTimeDomainData(data);
    let sum = 0;
    for (const v of data) sum += v * v;
    return Math.sqrt(sum / data.length);
  }

  update(dt: number): void {
    const ctx = this.engine.ctx;
    if (!ctx) return;
    const r = this.renderer;
    const cam = r.cityCamera;
    const camPos = cam.camera.position;
    const target = cam.target;
    placeListener(ctx, camPos, target);
    const listener = { x: target.x + (camPos.x - target.x) * 0.3, y: target.y + (camPos.y - target.y) * 0.3, z: target.z + (camPos.z - target.z) * 0.3 };

    this.sampleClock -= dt;
    if (this.sampleClock <= 0) {
      this.sampleClock = 0.5;
      this.sample(target);
    }
    const atmo = r.atmosphere;
    const mix = atmo.weather.mix;
    this.ambience.update(dt, {
      zoom: cam.following ? 0 : cam.zoom,
      night: atmo.night,
      rain: mix.rain,
      storm: mix.storm,
      cars: this.scene.cars,
      trees: this.scene.trees,
      water: this.scene.water,
      built: this.scene.built,
    });
    if (atmo.strikes !== this.strikes) {
      this.strikes = atmo.strikes;
      this.ambience.thunder(Math.random());
    }

    // Moving fire trucks wail; their velocity drives the Doppler shift.
    const sirens: Siren[] = [];
    const seen = new Map<object, Point3>();
    for (const u of r.agents.emergency.units) {
      if (u.label !== 'Fire truck' || u.leaving || u.path.length === 0) continue;
      const pos = { x: u.pos.x, y: u.pos.y, z: u.pos.z };
      const before = this.lastSiren.get(u) ?? pos;
      const k = 1 / Math.max(dt, 1e-3);
      sirens.push({ id: u, pos, vel: { x: (pos.x - before.x) * k, y: (pos.y - before.y) * k, z: (pos.z - before.z) * k } });
      seen.set(u, pos);
    }
    this.lastSiren = seen;
    const tornado = r.fx.tornadoPositions()[0] ?? null;
    this.disasters.update(dt, this.scene.burning, this.scene.burningAt, tornado, r.fx.shake.trauma, sirens, listener);
    for (const e of r.fx.events.splice(0)) {
      if (e.type === 'explosion') this.disasters.explosion(e, 1);
      else if (e.type === 'meltdown') this.disasters.explosion(e, 2.2);
      else if (e.type === 'roar') this.disasters.roar(e);
      else if (e.type === 'footfall') this.disasters.thud(e, 0.5);
      else this.disasters.thud(e, 0.3);
    }

    const approval = this.approval();
    const mood: Mood = atmo.night > 0.6 ? 'night' : approval < 35 ? 'tense' : approval > 65 ? 'bright' : 'calm';
    this.music.setMood(mood);
  }

  /** Count what is around the camera target: trees, water, buildings, cars, fires. */
  private sample(target: Point3): void {
    const m = this.mirror;
    const reach = 14;
    let trees = 0;
    let water = 0;
    let built = 0;
    let total = 0;
    let burning = 0;
    let bx = 0;
    let bz = 0;
    const x0 = Math.max(0, Math.floor(target.x - reach));
    const x1 = Math.min(m.size - 1, Math.floor(target.x + reach));
    const y0 = Math.max(0, Math.floor(target.z - reach));
    const y1 = Math.min(m.size - 1, Math.floor(target.z + reach));
    for (let y = y0; y <= y1; y += 2) {
      for (let x = x0; x <= x1; x += 2) {
        const kind = m.tile(x, y);
        total++;
        if (kind === TileKind.Tree) trees++;
        else if (kind === TileKind.Water) water++;
        else if (kind >= 64 || isRoad(kind)) built++;
      }
    }
    // Fires: every tile, wider, since a fire can be heard further off.
    for (let y = Math.max(0, y0 - 6); y <= Math.min(m.size - 1, y1 + 6); y++) {
      for (let x = Math.max(0, x0 - 6); x <= Math.min(m.size - 1, x1 + 6); x++) {
        if (m.flag(x, y) & TileFlag.BURNING) {
          burning++;
          bx += x + 0.5;
          bz += y + 0.5;
        }
      }
    }
    let cars = 0;
    for (const c of this.renderer.agents.cars.cars) {
      if (c.alive && Math.abs(c.pos.x - target.x) < 16 && Math.abs(c.pos.z - target.z) < 16) cars++;
    }
    this.scene = {
      cars,
      trees: total ? trees / total : 0,
      water: total ? water / total : 0,
      built: total ? built / total : 0,
      burning,
      burningAt: burning > 0 ? { x: bx / burning, y: m.heightAt(bx / burning, bz / burning) + 0.3, z: bz / burning } : null,
    };
  }
}
