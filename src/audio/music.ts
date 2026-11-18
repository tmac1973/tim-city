import { VisualRng } from '@/render/agents/visualRng';
import type { AudioEngine } from './engine';
import { mtof, reverb } from './synth';

export type Mood = 'bright' | 'calm' | 'night' | 'tense';

/** Scale degrees (semitones above the root) and root note per mood. */
const SCALES: Record<Mood, { root: number; steps: number[] }> = {
  bright: { root: 60, steps: [0, 2, 4, 7, 9] }, // major pentatonic
  calm: { root: 57, steps: [0, 2, 4, 7, 9] },
  night: { root: 57, steps: [0, 3, 5, 7, 10] }, // minor pentatonic
  tense: { root: 55, steps: [0, 3, 5, 7, 10] },
};

/** Chord roots as scale-degree indices, one per bar. */
const PROGRESSIONS = [
  [0, 3, 4, 2],
  [0, 4, 3, 3],
  [0, 2, 3, 4],
  [0, 0, 3, 4],
  [4, 3, 0, 0],
];

export interface NoteEvent {
  time: number;
  midi: number;
  dur: number;
  voice: 'pad' | 'pluck' | 'kick' | 'hat';
  gain: number;
}

/** All notes a scale allows over the audible range. */
export function scaleNotes(mood: Mood): number[] {
  const { root, steps } = SCALES[mood];
  const out: number[] = [];
  for (let octave = -2; octave <= 2; octave++) for (const s of steps) out.push(root + octave * 12 + s);
  return out;
}

/**
 * Writes the music one bar at a time: a pad chord, a plucked melody that
 * wanders the scale, and light percussion. Pure: it only returns events,
 * so it can be tested without audio.
 */
export class Composer {
  mood: Mood = 'calm';
  bpm = 80;
  private bar = 0;
  private progression: number[] = PROGRESSIONS[0] ?? [0];
  private melody = 0;

  constructor(private readonly rng: VisualRng) {}

  get secondsPerBar(): number {
    return (60 / this.bpm) * 4;
  }

  /** Notes for the bar starting at `start` (seconds on the audio clock). */
  nextBar(start: number): NoteEvent[] {
    // Every 8 bars: a new progression and tempo.
    if (this.bar % 8 === 0) {
      this.progression = this.rng.pick(PROGRESSIONS) ?? this.progression;
      this.bpm = Math.round(this.rng.range(70, 90));
    }
    const { root, steps } = SCALES[this.mood];
    const beat = 60 / this.bpm;
    const degree = this.progression[this.bar % this.progression.length] ?? 0;
    const at = (index: number, octave: number) => {
      const n = steps.length;
      const i = ((index % n) + n) % n;
      return root + octave * 12 + (steps[i] ?? 0) + Math.floor(index / n) * 12;
    };
    const events: NoteEvent[] = [];
    // Pad: root, third-ish and fifth-ish of the chord, low and long.
    for (const k of [0, 1, 2]) events.push({ time: start, midi: at(degree + k * 2, -1), dur: beat * 4, voice: 'pad', gain: 0.05 });
    // Melody on an eighth-note grid, sparser at night and when things are tense.
    const density = this.mood === 'bright' ? 0.5 : this.mood === 'calm' ? 0.38 : 0.26;
    for (let step = 0; step < 8; step++) {
      if (this.rng.next() > density) continue;
      this.melody += this.rng.pick([-2, -1, -1, 0, 1, 1, 2]) ?? 0;
      this.melody = Math.max(-2, Math.min(5, this.melody));
      events.push({ time: start + step * beat * 0.5, midi: at(degree + this.melody, 0), dur: beat * 0.9, voice: 'pluck', gain: 0.07 });
    }
    // Percussion: a soft kick on 1 and 3, a few hats.
    if (this.mood !== 'night') {
      for (const b of [0, 2]) events.push({ time: start + b * beat, midi: 36, dur: 0.25, voice: 'kick', gain: 0.18 });
      for (let step = 0; step < 8; step++) {
        if (this.rng.next() < 0.55) events.push({ time: start + step * beat * 0.5, midi: 0, dur: 0.04, voice: 'hat', gain: step % 2 === 1 ? 0.03 : 0.018 });
      }
    }
    this.bar++;
    return events;
  }
}

/**
 * Plays the composer's notes through the music bus, scheduled about two
 * bars ahead of the audio clock so timing never depends on the frame rate.
 */
export class Music {
  readonly composer: Composer;
  private nextBarAt = 0;
  private out: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly engine: AudioEngine) {
    this.composer = new Composer(new VisualRng(0x6d75));
  }

  start(): void {
    const ctx = this.engine.ctx;
    if (!ctx || this.timer) return;
    // A shared reverb gives the voices one room.
    this.out = ctx.createGain();
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    const room = reverb(ctx);
    this.out.connect(this.engine.music);
    this.out.connect(room).connect(wet).connect(this.engine.music);
    this.nextBarAt = ctx.currentTime + 0.5;
    this.timer = setInterval(() => {
      this.schedule();
    }, 250);
    this.schedule();
  }

  setMood(mood: Mood): void {
    this.composer.mood = mood;
  }

  private schedule(): void {
    const ctx = this.engine.ctx;
    const out = this.out;
    if (!ctx || !out) return;
    // Never schedule in the past (the tab may have been asleep).
    if (this.nextBarAt < ctx.currentTime + 0.05) this.nextBarAt = ctx.currentTime + 0.1;
    while (this.nextBarAt < ctx.currentTime + this.composer.secondsPerBar * 2) {
      for (const note of this.composer.nextBar(this.nextBarAt)) this.play(ctx, out, note);
      this.nextBarAt += this.composer.secondsPerBar;
    }
  }

  private play(ctx: BaseAudioContext, out: AudioNode, n: NoteEvent): void {
    const t = n.time;
    if (n.voice === 'hat') {
      const src = ctx.createBufferSource();
      const len = Math.floor(ctx.sampleRate * 0.05);
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
      src.buffer = buffer;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 7000;
      const g = ctx.createGain();
      g.gain.value = n.gain;
      src.connect(hp).connect(g).connect(out);
      src.start(t);
      return;
    }
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const f = mtof(n.midi);
    if (n.voice === 'kick') {
      osc.frequency.setValueAtTime(110, t);
      osc.frequency.exponentialRampToValueAtTime(42, t + 0.18);
      filter.frequency.value = 400;
      env.gain.setValueAtTime(n.gain, t);
      env.gain.exponentialRampToValueAtTime(0.0001, t + n.dur);
    } else if (n.voice === 'pad') {
      osc.type = 'triangle';
      osc.frequency.value = f;
      osc.detune.value = (Math.random() - 0.5) * 8;
      filter.frequency.value = 900;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(n.gain, t + n.dur * 0.3);
      env.gain.linearRampToValueAtTime(n.gain * 0.8, t + n.dur * 0.8);
      env.gain.linearRampToValueAtTime(0, t + n.dur * 1.05);
    } else {
      osc.type = 'triangle';
      osc.frequency.value = f;
      filter.frequency.setValueAtTime(f * 6, t);
      filter.frequency.exponentialRampToValueAtTime(f * 1.2, t + 0.25);
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(n.gain, t + 0.006);
      env.gain.exponentialRampToValueAtTime(0.0001, t + n.dur);
    }
    osc.connect(filter).connect(env).connect(out);
    osc.start(t);
    osc.stop(t + n.dur * 1.1 + 0.05);
  }
}
