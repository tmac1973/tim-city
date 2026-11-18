import type { AudioEngine } from './engine';
import { noise, noiseBed, tone } from './synth';

/** What the ambience listens to, sampled a few times a second. */
export interface AmbienceInput {
  /** 0 zoomed right in … 1 fully out. */
  zoom: number;
  night: number;
  rain: number;
  storm: number;
  /** Cars within earshot of the camera target. */
  cars: number;
  /** Share of nearby tiles that are trees, water, and buildings or roads. */
  trees: number;
  water: number;
  built: number;
}

/**
 * The city's background: traffic hum, birds by day and crickets at night,
 * wind higher up, surf near the shore, and rain. Each layer is a running
 * source whose gain eases toward a target set from the scene.
 */
export class Ambience {
  private beds: Record<'traffic' | 'wind' | 'surf' | 'rain', { gain: GainNode; filter: BiquadFilterNode }> | null = null;
  private birdClock = 0;
  private cricketClock = 0;
  private time = 0;

  constructor(private readonly engine: AudioEngine) {}

  start(): void {
    const ctx = this.engine.ctx;
    if (!ctx || this.beds) return;
    const out = this.engine.ambience;
    this.beds = {
      traffic: noiseBed(ctx, out, 'lowpass', 380, 0.5),
      wind: noiseBed(ctx, out, 'bandpass', 500, 0.6),
      surf: noiseBed(ctx, out, 'lowpass', 700, 0.4),
      rain: noiseBed(ctx, out, 'highpass', 2500, 0.3),
    };
  }

  update(dt: number, s: AmbienceInput): void {
    const ctx = this.engine.ctx;
    const beds = this.beds;
    if (!ctx || !beds) return;
    this.time += dt;
    const t = ctx.currentTime;
    const near = 1 - s.zoom;
    const set = (bed: { gain: GainNode }, value: number) => {
      bed.gain.gain.setTargetAtTime(Math.max(0, value), t, 0.4);
    };
    set(beds.traffic, Math.min(1, s.cars / 40) * 0.5 * (0.35 + 0.65 * near));
    // Wind rises with height and weather; its pitch wanders.
    set(beds.wind, (0.03 + 0.12 * s.zoom + 0.25 * s.storm) * (1 - 0.5 * s.rain));
    beds.wind.filter.frequency.setTargetAtTime(380 + 260 * Math.sin(this.time * 0.21) + 140 * Math.sin(this.time * 0.53), t, 0.5);
    // Surf swells slowly.
    set(beds.surf, s.water * 0.35 * (0.6 + 0.4 * Math.sin(this.time * 0.75)) * (0.4 + 0.6 * near));
    set(beds.rain, s.rain * 0.3);

    const out = this.engine.ambience;
    // Birds: little chirp phrases by day, near trees, when the camera is close.
    const birds = (1 - s.night) * Math.min(1, s.trees * 2) * near * (1 - s.rain);
    this.birdClock -= dt;
    if (birds > 0.05 && this.birdClock <= 0) {
      this.birdClock = 0.6 + Math.random() * 2.5;
      const base = 2400 + Math.random() * 1800;
      const n = 2 + Math.floor(Math.random() * 4);
      for (let k = 0; k < n; k++) {
        tone(ctx, out, { freq: base * (1 + Math.random() * 0.3), to: base * (0.7 + Math.random() * 0.6), t: t + k * 0.09, dur: 0.06, gain: 0.05 * birds, a: 0.004, r: 0.03 });
      }
    }
    // Crickets: pulsed high chirps at night over green ground.
    const crickets = s.night * Math.min(1, (s.trees + (1 - s.built - s.water)) * 0.8) * (0.4 + 0.6 * near) * (1 - s.rain);
    this.cricketClock -= dt;
    if (crickets > 0.05 && this.cricketClock <= 0) {
      this.cricketClock = 0.35 + Math.random() * 0.5;
      const f = 4300 + Math.random() * 500;
      for (let k = 0; k < 3; k++) tone(ctx, out, { freq: f, t: t + k * 0.045, dur: 0.025, gain: 0.025 * crickets, a: 0.003, r: 0.015 });
    }
  }

  /** A roll of thunder a moment after a lightning flash. */
  thunder(distance: number): void {
    const ctx = this.engine.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + 0.4 + distance * 1.5;
    noise(ctx, this.engine.ambience, { t, dur: 2.6, gain: 0.5, filter: 'lowpass', freq: 260, freqTo: 70, a: 0.05, d: 0.6, s: 0.5, r: 1.2 });
    noise(ctx, this.engine.ambience, { t, dur: 0.25, gain: 0.25, filter: 'bandpass', freq: 900, q: 0.6, r: 0.2 });
  }
}
