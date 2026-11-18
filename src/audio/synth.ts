/** Small synthesis building blocks shared by every sound. */

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

/** Two seconds of white noise, made once per context. */
export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buffer = noiseCache.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 1;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 16807) % 2147483647;
      data[i] = (seed / 2147483647) * 2 - 1;
    }
    noiseCache.set(ctx, buffer);
  }
  return buffer;
}

/** Attack–decay–sustain–release on a gain param, from `t` for `dur` seconds, then released. */
export function adsr(param: AudioParam, t: number, dur: number, peak: number, a = 0.005, d = 0.08, s = 0.6, r = 0.15): void {
  param.cancelScheduledValues(t);
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + a);
  param.setTargetAtTime(peak * s, t + a, d / 3);
  param.setTargetAtTime(0, t + Math.max(a, dur), r / 3);
}

export interface ToneOptions {
  type?: OscillatorType;
  freq: number;
  /** Optional glide target, reached at the end of `dur`. */
  to?: number;
  t: number;
  dur: number;
  gain: number;
  a?: number;
  d?: number;
  s?: number;
  r?: number;
  detune?: number;
}

/** One enveloped oscillator note. */
export function tone(ctx: BaseAudioContext, dest: AudioNode, o: ToneOptions): void {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, o.t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, o.t + o.dur);
  if (o.detune) osc.detune.value = o.detune;
  adsr(env.gain, o.t, o.dur, o.gain, o.a, o.d, o.s, o.r);
  osc.connect(env).connect(dest);
  osc.start(o.t);
  osc.stop(o.t + o.dur + (o.r ?? 0.15) * 2 + 0.05);
}

export interface NoiseOptions {
  t: number;
  dur: number;
  gain: number;
  filter?: BiquadFilterType;
  freq?: number;
  /** Optional filter sweep target, reached at the end of `dur`. */
  freqTo?: number;
  q?: number;
  a?: number;
  d?: number;
  s?: number;
  r?: number;
}

/** A burst of filtered noise. */
export function noise(ctx: BaseAudioContext, dest: AudioNode, o: NoiseOptions): void {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = o.filter ?? 'lowpass';
  filter.frequency.setValueAtTime(o.freq ?? 2000, o.t);
  if (o.freqTo) filter.frequency.exponentialRampToValueAtTime(o.freqTo, o.t + o.dur);
  filter.Q.value = o.q ?? 0.7;
  const env = ctx.createGain();
  adsr(env.gain, o.t, o.dur, o.gain, o.a ?? 0.005, o.d ?? 0.08, o.s ?? 0.6, o.r ?? 0.1);
  src.connect(filter).connect(env).connect(dest);
  src.start(o.t, Math.random() * 1.5);
  src.stop(o.t + o.dur + (o.r ?? 0.1) * 2 + 0.05);
}

/** An FM bell: a sine carrier with an inharmonic modulator that dies away. */
export function bell(ctx: BaseAudioContext, dest: AudioNode, freq: number, t: number, dur: number, gain: number, ratio = 3.5): void {
  const carrier = ctx.createOscillator();
  const mod = ctx.createOscillator();
  const modGain = ctx.createGain();
  const env = ctx.createGain();
  carrier.frequency.value = freq;
  mod.frequency.value = freq * ratio;
  modGain.gain.setValueAtTime(freq * 2.2, t);
  modGain.gain.exponentialRampToValueAtTime(freq * 0.05, t + dur);
  mod.connect(modGain).connect(carrier.frequency);
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(gain, t + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  carrier.connect(env).connect(dest);
  for (const o of [carrier, mod]) {
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

/** A convolution reverb from a generated, decaying stereo noise impulse. */
export function reverb(ctx: BaseAudioContext, seconds = 2.4, decay = 3): ConvolverNode {
  const length = Math.floor(ctx.sampleRate * seconds);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  let seed = 7;
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      seed = (seed * 48271) % 2147483647;
      data[i] = ((seed / 2147483647) * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  const convolver = ctx.createConvolver();
  convolver.buffer = impulse;
  return convolver;
}

/** A looping noise source through a filter into a gain, for ambience beds. */
export function noiseBed(ctx: BaseAudioContext, dest: AudioNode, filter: BiquadFilterType, freq: number, q = 0.7): { gain: GainNode; filter: BiquadFilterNode } {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  f.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  src.connect(f).connect(gain).connect(dest);
  src.start(0, Math.random() * 1.5);
  return { gain, filter: f };
}

/** MIDI note number to frequency. */
export const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
