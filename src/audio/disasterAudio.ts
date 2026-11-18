import type { AudioEngine } from './engine';
import { type Point3, panner, place } from './positional';
import { noise, noiseBed, tone } from './synth';

/** A moving source with a velocity, for Doppler. */
export interface Siren {
  id: object;
  pos: Point3;
  vel: Point3;
}

const SPEED_OF_SOUND = 60; // world units per second, slowed so Doppler is audible at toy scale

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
  panner: PannerNode;
  last: number;
}

/**
 * Disaster sound: wailing sirens that move (and shift pitch) with the fire
 * trucks, fire crackle near burning tiles, a tornado's roar, an earthquake's
 * rumble, explosions and the Mirebeast's roar.
 */
export class DisasterAudio {
  private readonly sirens = new Map<object, Voice>();
  private fire: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private wind: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private rumble: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private tornadoPanner: PannerNode | null = null;
  private crackleClock = 0;
  private time = 0;

  constructor(private readonly engine: AudioEngine) {}

  start(): void {
    const ctx = this.engine.ctx;
    if (!ctx || this.fire) return;
    this.fire = noiseBed(ctx, this.engine.sfx, 'lowpass', 600, 0.4);
    this.tornadoPanner = panner(ctx, this.engine.sfx, { x: 0, y: 0, z: 0 });
    this.wind = noiseBed(ctx, this.tornadoPanner, 'bandpass', 300, 1.2);
    this.rumble = noiseBed(ctx, this.engine.sfx, 'lowpass', 70, 0.8);
  }

  /**
   * burning: tiles on fire near the camera; tornado: nearest funnel or
   * null; quake: shake trauma 0–1; listener: where the ears are.
   */
  update(dt: number, burning: number, burningAt: Point3 | null, tornado: Point3 | null, quake: number, sirens: Siren[], listener: Point3): void {
    const ctx = this.engine.ctx;
    if (!ctx || !this.fire || !this.wind || !this.rumble || !this.tornadoPanner) return;
    this.time += dt;
    const t = ctx.currentTime;
    const fireLevel = Math.min(1, burning / 12);
    this.fire.gain.gain.setTargetAtTime(fireLevel * 0.28, t, 0.5);
    this.crackleClock -= dt;
    if (fireLevel > 0.02 && this.crackleClock <= 0 && burningAt) {
      this.crackleClock = 0.03 + Math.random() * (0.25 / (0.2 + fireLevel));
      noise(ctx, panner(ctx, this.engine.sfx, burningAt), { t, dur: 0.012, gain: 0.25 + Math.random() * 0.3, filter: 'highpass', freq: 1800 + Math.random() * 2500, r: 0.02 });
    }
    if (tornado) {
      place(this.tornadoPanner, tornado);
      this.wind.gain.gain.setTargetAtTime(0.9, t, 0.6);
      this.wind.filter.frequency.setTargetAtTime(220 + 160 * Math.sin(this.time * 1.7) + 90 * Math.sin(this.time * 4.1), t, 0.1);
    } else {
      this.wind.gain.gain.setTargetAtTime(0, t, 0.8);
    }
    this.rumble.gain.gain.setTargetAtTime(quake * 1.1, t, 0.15);

    // Sirens: a two-tone wail per moving fire truck, nearest three only.
    const near = [...sirens].sort((a, b) => dist(a.pos, listener) - dist(b.pos, listener)).slice(0, 3);
    const keep = new Set(near.map((s) => s.id));
    for (const [id, voice] of this.sirens) {
      if (keep.has(id)) continue;
      voice.gain.gain.setTargetAtTime(0, t, 0.2);
      voice.osc.stop(t + 1);
      this.sirens.delete(id);
    }
    for (const s of near) {
      let voice = this.sirens.get(s.id);
      if (!voice) {
        const osc = ctx.createOscillator();
        osc.type = 'square';
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1600;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        const p = panner(ctx, this.engine.sfx, s.pos);
        osc.connect(filter).connect(gain).connect(p);
        osc.start();
        voice = { osc, gain, panner: p, last: 0 };
        this.sirens.set(s.id, voice);
      }
      place(voice.panner, s.pos);
      // Doppler: pitch up when approaching, down when leaving.
      const toListener = { x: listener.x - s.pos.x, y: listener.y - s.pos.y, z: listener.z - s.pos.z };
      const d = Math.hypot(toListener.x, toListener.y, toListener.z) || 1;
      const closing = (s.vel.x * toListener.x + s.vel.y * toListener.y + s.vel.z * toListener.z) / d;
      const doppler = SPEED_OF_SOUND / Math.max(10, SPEED_OF_SOUND - closing);
      const high = Math.floor(this.time * 1.6) % 2 === 0;
      voice.osc.frequency.setTargetAtTime((high ? 960 : 720) * doppler, t, 0.02);
      voice.gain.gain.setTargetAtTime(0.07, t, 0.1);
    }
  }

  explosion(at: Point3, size = 1): void {
    const ctx = this.engine.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const out = panner(ctx, this.engine.sfx, at);
    noise(ctx, out, { t, dur: 0.9 * size, gain: 0.9, filter: 'lowpass', freq: 3000, freqTo: 120, a: 0.002, d: 0.3, s: 0.4, r: 0.8 * size });
    tone(ctx, out, { freq: 90, to: 30, t, dur: 0.5 * size, gain: 0.9, r: 0.4 });
  }

  /** A deep, formant-swept growl. */
  roar(at: Point3): void {
    const ctx = this.engine.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const out = panner(ctx, this.engine.sfx, at);
    const saw = ctx.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.setValueAtTime(95, t);
    saw.frequency.linearRampToValueAtTime(70, t + 1.4);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.5, t + 0.25);
    env.gain.setTargetAtTime(0, t + 1.2, 0.25);
    for (const [from, to] of [[450, 850], [1100, 1700]] as const) {
      const formant = ctx.createBiquadFilter();
      formant.type = 'bandpass';
      formant.Q.value = 6;
      formant.frequency.setValueAtTime(from, t);
      formant.frequency.linearRampToValueAtTime(to, t + 0.5);
      formant.frequency.linearRampToValueAtTime(from * 0.8, t + 1.4);
      saw.connect(formant).connect(env);
    }
    env.connect(out);
    saw.start(t);
    saw.stop(t + 2.2);
    noise(ctx, out, { t, dur: 1.3, gain: 0.25, filter: 'bandpass', freq: 600, freqTo: 300, q: 2, a: 0.2, r: 0.4 });
  }

  /** A heavy step or a building coming down. */
  thud(at: Point3, gain = 0.4): void {
    const ctx = this.engine.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const out = panner(ctx, this.engine.sfx, at);
    tone(ctx, out, { freq: 70, to: 38, t, dur: 0.18, gain, r: 0.12 });
    noise(ctx, out, { t, dur: 0.35, gain: gain * 0.5, filter: 'lowpass', freq: 500, freqTo: 150, r: 0.25 });
  }
}

const dist = (a: Point3, b: Point3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
