import { Color, type Fog, Group, type Scene, Vector3 } from 'three';
import { VisualRng } from '../agents/visualRng';
import type { Lighting } from '../lighting';
import type { CityMirror } from '../mirror';
import { PALETTE } from '../palette';
import { sunDirection, VisualClock } from './clock';
import { Precipitation } from './precipitation';
import { seasonBlend } from './seasons';
import { Sky } from './sky';
import { StreetLights } from './streetLights';
import { ATMOSPHERE, DAYLIT } from './uniforms';
import { Weather } from './weather';

const SKY = {
  dayZenith: new Color(0x4f9bd9),
  dayHorizon: new Color(PALETTE.skyHorizon),
  duskZenith: new Color(0x3d4f8f),
  duskHorizon: new Color(0xf2a65a),
  nightZenith: new Color(0x050914),
  nightHorizon: new Color(0x16213a),
  sun: new Color(PALETTE.sun),
  sunLow: new Color(0xffa860),
  moon: new Color(0x9fb4ff),
  grey: new Color(0x8f969c),
};

const WINDOW_LIGHT = new Color(1, 0.78, 0.45);

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Time of day, weather and seasons: drives the sky, the sun and moon, the
 * fog, rain and snow, lit windows and street lights. Visual only.
 */
export class Atmosphere {
  readonly group = new Group();
  readonly clock = new VisualClock(0.32);
  readonly weather: Weather;
  readonly sky = new Sky();
  readonly lamps: StreetLights;
  private readonly precipitation: Precipitation;
  /** Game month (0 = January) and how far through it. */
  private month = 0;
  private through = 0;
  private firstYear = false;
  paused = false;
  /** 0 by day … 1 at night. */
  night = 0;
  /** 0 … 1, how bright daylight is (for unlit shaders). */
  light = 1;
  private readonly rng = new VisualRng(0x11647);
  private flash = 0;
  /** Lightning strikes so far (audio plays thunder on each new one). */
  strikes = 0;
  private flashTimer = 5;
  private secondFlash = -1;
  private time = 0;
  private readonly zenith = new Color();
  private readonly horizon = new Color();
  private readonly keyColor = new Color();
  private readonly fogBase: { near: number; far: number };

  constructor(
    private readonly scene: Scene,
    mirror: CityMirror,
    private readonly lighting: Lighting,
  ) {
    const rng = new VisualRng(0xa7305);
    this.weather = new Weather(rng);
    this.precipitation = new Precipitation(rng);
    this.lamps = new StreetLights(mirror);
    this.group.add(this.sky.mesh, this.precipitation.group, this.lamps.group);
    this.group.name = 'atmosphere';
    const fog = scene.fog as Fog;
    this.fogBase = { near: fog.near, far: fog.far };
    scene.background = null;
  }

  setDate(month: number, through: number, firstYear = false): void {
    this.month = month;
    this.through = through;
    this.firstYear = firstYear;
  }

  update(dt: number, camera: Vector3, target: Vector3, distance: number): void {
    this.time += dt;
    this.clock.advance(dt, this.paused);
    this.weather.step(dt, this.month, this.paused);
    const mix = this.weather.mix;
    const sun = sunDirection(this.clock.timeOfDay);
    const e = sun.elevation;

    // Sky colours: day, dusk and night, then greyed by cloud.
    const day = smooth(0.05, 0.35, e);
    const dusk = (1 - day) * smooth(-0.22, 0.02, e);
    const nightW = 1 - day - dusk;
    this.zenith.setRGB(0, 0, 0).add(SKY.dayZenith.clone().multiplyScalar(day)).add(SKY.duskZenith.clone().multiplyScalar(dusk)).add(SKY.nightZenith.clone().multiplyScalar(nightW));
    this.horizon.setRGB(0, 0, 0).add(SKY.dayHorizon.clone().multiplyScalar(day)).add(SKY.duskHorizon.clone().multiplyScalar(dusk)).add(SKY.nightHorizon.clone().multiplyScalar(nightW));
    const cloudGrey = SKY.grey.clone().multiplyScalar(0.25 + 0.75 * (day + dusk * 0.6));
    this.zenith.lerp(cloudGrey, mix.cloud * 0.75);
    this.horizon.lerp(cloudGrey, mix.cloud * 0.6);

    // Lightning: a double flash every few seconds in a storm.
    this.flash = Math.max(0, this.flash - dt * 7);
    if (mix.storm > 0.5 && !this.paused) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) {
        this.flash = 1;
        this.strikes++;
        this.secondFlash = 0.12;
        this.flashTimer = this.rng.range(4, 12);
      }
    }
    if (this.secondFlash > 0) {
      this.secondFlash -= dt;
      if (this.secondFlash <= 0) this.flash = 0.8;
    }

    // Sun by day, a dim blue moon by night; one shadow-casting light. The
    // light never drops below 0.45 high: a grazing sun throws shadows past
    // the shadow map's edge, which then shows as a hard rectangle.
    const sunUp = e > -0.02;
    const keyDir = sunUp ? new Vector3(sun.x, sun.y, sun.z) : new Vector3(-sun.x * 0.6, -sun.y, -sun.z * 0.6);
    const flat = Math.hypot(keyDir.x, keyDir.z) || 1;
    if (keyDir.y < 0.45) keyDir.set((keyDir.x / flat) * 0.89, 0.45, (keyDir.z / flat) * 0.89);
    this.lighting.sunDir.copy(keyDir.normalize());
    const sunStrength = smooth(-0.02, 0.25, e);
    if (sunUp) this.keyColor.copy(SKY.sunLow).lerp(SKY.sun, smooth(0.05, 0.4, e));
    else this.keyColor.copy(SKY.moon);
    const intensity = sunUp ? 2.6 * sunStrength : 0.39 * smooth(-0.02, -0.2, e);
    this.lighting.sun.color.copy(this.keyColor);
    this.lighting.sun.intensity = intensity * (1 - 0.65 * mix.cloud);
    this.lighting.hemisphere.color.copy(this.zenith).lerp(new Color(0xffffff), 0.35);
    this.lighting.hemisphere.intensity = (0.22 + 0.88 * smooth(-0.15, 0.3, e)) * (1 - 0.25 * mix.cloud) + this.flash * 2.5;

    this.night = Math.max(1 - smooth(-0.02, 0.18, e), mix.cloud * mix.rain * 0.3);
    this.light = Math.min(1, 0.16 + 0.84 * smooth(-0.15, 0.3, e) * (1 - 0.4 * mix.cloud) + this.flash);

    const u = this.sky.uniforms;
    u.uZenith.value.copy(this.zenith);
    u.uHorizon.value.copy(this.horizon);
    u.uSunDir.value.set(sun.x, sun.y, sun.z);
    u.uSunColor.value.copy(this.keyColor);
    u.uNight.value = nightW;
    u.uCloud.value = mix.cloud;
    u.uFlash.value = this.flash * 0.6;
    u.uTime.value = this.time;
    this.sky.follow(camera);

    // Fog: the horizon colour, pulled in close by fog and heavy weather.
    const fog = this.scene.fog as Fog;
    const thick = Math.max(mix.fog, mix.rain * 0.35, mix.snow * 0.45);
    fog.color.copy(this.horizon);
    fog.near = this.fogBase.near + (3 - this.fogBase.near) * thick;
    fog.far = this.fogBase.far + (70 - this.fogBase.far) * thick;

    const season = seasonBlend(this.month, this.through, this.firstYear);
    ATMOSPHERE.uNight.value = this.night;
    // Zoomed far out, thousands of lit windows add up under bloom: dim them.
    ATMOSPHERE.uWindowColor.value.copy(WINDOW_LIGHT).multiplyScalar(1 - 0.55 * smooth(40, 170, distance));
    ATMOSPHERE.uSnow.value = season.snow;
    ATMOSPHERE.uAutumn.value = season.autumn;
    ATMOSPHERE.uClock.value = this.time;
    ATMOSPHERE.uLight.value = this.light;
    for (const material of DAYLIT) material.color.setScalar(0.3 + 0.7 * this.light);

    this.precipitation.update(this.paused ? 0 : dt, target, distance, mix.rain, mix.snow, this.night);
    this.lamps.update(this.night);
  }
}
