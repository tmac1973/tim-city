import type { AudioEngine } from './engine';
import { type Point3, panner } from './positional';
import { bell, mtof, noise, tone } from './synth';

export type SfxName = 'click' | 'place' | 'bulldoze' | 'cannotPlace' | 'coin' | 'zoneGrow' | 'milestone' | 'budgetOpen';

/** Short feedback sounds, each built fresh from oscillators and noise. */
export class Sfx {
  private lastGrow = 0;

  constructor(private readonly engine: AudioEngine) {}

  /** Play a sound now; `at` places it in the world (otherwise it is in your head). */
  play(name: SfxName, at?: Point3): void {
    const ctx = this.engine.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + 0.005;
    const out: AudioNode = at ? panner(ctx, this.engine.sfx, at) : this.engine.sfx;
    switch (name) {
      case 'click':
        tone(ctx, out, { freq: 1500, to: 1100, t, dur: 0.025, gain: 0.12, r: 0.03 });
        break;
      case 'place':
        // A soft wooden thunk: a falling sine and a click of noise.
        tone(ctx, out, { freq: 190, to: 85, t, dur: 0.12, gain: 0.5, r: 0.08 });
        noise(ctx, out, { t, dur: 0.03, gain: 0.18, filter: 'bandpass', freq: 2400, q: 1.2, r: 0.04 });
        break;
      case 'bulldoze':
        noise(ctx, out, { t, dur: 0.28, gain: 0.4, filter: 'lowpass', freq: 900, freqTo: 250, r: 0.15 });
        tone(ctx, out, { type: 'triangle', freq: 70, to: 45, t, dur: 0.3, gain: 0.35, r: 0.15 });
        break;
      case 'cannotPlace':
        tone(ctx, out, { type: 'square', freq: 311, t, dur: 0.08, gain: 0.06, r: 0.05 });
        tone(ctx, out, { type: 'square', freq: 233, t: t + 0.09, dur: 0.12, gain: 0.06, r: 0.06 });
        break;
      case 'coin':
        bell(ctx, out, 1318.5, t, 0.5, 0.18, 2);
        bell(ctx, out, 1975.5, t + 0.07, 0.7, 0.16, 2);
        break;
      case 'zoneGrow': {
        // A soft chime, at most a few a second however fast the city grows.
        if (t - this.lastGrow < 0.35) return;
        this.lastGrow = t;
        const notes = [72, 74, 76, 79, 81, 84];
        bell(ctx, out, mtof(notes[Math.floor(Math.random() * notes.length)] ?? 72), t, 0.9, 0.07, 3.01);
        break;
      }
      case 'milestone': {
        // A rising arpeggio over a warm chord.
        [60, 64, 67, 72, 76].forEach((m, i) => {
          bell(ctx, out, mtof(m + 12), t + i * 0.09, 1.4, 0.16, 2);
        });
        for (const m of [48, 55, 64]) tone(ctx, out, { type: 'triangle', freq: mtof(m), t, dur: 1.2, gain: 0.08, a: 0.05, r: 0.6 });
        break;
      }
      case 'budgetOpen':
        noise(ctx, out, { t, dur: 0.18, gain: 0.1, filter: 'bandpass', freq: 3500, freqTo: 1800, q: 0.8, r: 0.08 });
        bell(ctx, out, 880, t + 0.05, 0.6, 0.07, 2);
        break;
    }
  }
}
