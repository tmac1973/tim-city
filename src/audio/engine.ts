export interface Volumes {
  master: number;
  music: number;
  sfx: number;
  ambience: number;
  muted: boolean;
}

/**
 * The one AudioContext and its buses: music, sfx and ambience each have a
 * gain, all feed the master gain, which runs through a compressor to the
 * speakers. Browsers only start audio after a user gesture, so the context
 * is created (or resumed) on the first one.
 */
export class AudioEngine {
  ctx: BaseAudioContext | null = null;
  master!: GainNode;
  music!: GainNode;
  sfx!: GainNode;
  ambience!: GainNode;
  private volumes: Volumes = { master: 0.8, music: 0.45, sfx: 0.8, ambience: 0.6, muted: false };
  private paused = false;
  private readonly readyListeners: (() => void)[] = [];

  constructor(private readonly factory: () => BaseAudioContext = () => new AudioContext()) {}

  /** Create the context now (call from a user gesture). Safe to call again. */
  start(): void {
    if (!this.ctx) {
      const ctx = this.factory();
      this.ctx = ctx;
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.knee.value = 12;
      compressor.ratio.value = 4;
      this.master = ctx.createGain();
      this.music = ctx.createGain();
      this.sfx = ctx.createGain();
      this.ambience = ctx.createGain();
      for (const bus of [this.music, this.sfx, this.ambience]) bus.connect(this.master);
      this.master.connect(compressor);
      compressor.connect(ctx.destination);
      this.apply();
      for (const listener of this.readyListeners) listener();
    }
    const ctx = this.ctx;
    if ('resume' in ctx && ctx.state === 'suspended') void (ctx as AudioContext).resume();
  }

  /** Run once the context exists (at once if it already does). */
  onReady(listener: () => void): void {
    if (this.ctx) listener();
    else this.readyListeners.push(listener);
  }

  get now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  setVolumes(volumes: Partial<Volumes>): void {
    this.volumes = { ...this.volumes, ...volumes };
    this.apply();
  }

  /** While the game is paused the city's ambience fades out; music and the interface play on. */
  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    this.apply();
  }

  get muted(): boolean {
    return this.volumes.muted;
  }

  private apply(): void {
    if (!this.ctx) return;
    const v = this.volumes;
    const t = this.ctx.currentTime;
    // Short ramps avoid clicks when a slider moves.
    this.master.gain.setTargetAtTime(v.muted ? 0 : v.master, t, 0.03);
    this.music.gain.setTargetAtTime(v.music, t, 0.03);
    this.sfx.gain.setTargetAtTime(v.sfx, t, 0.03);
    this.ambience.gain.setTargetAtTime(this.paused ? 0 : v.ambience, t, this.paused ? 0.25 : 0.03);
  }
}
