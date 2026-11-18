import { describe, expect, it } from 'vitest';
import { AudioEngine } from './engine';

class FakeParam {
  constructor(public value = 1) {}
  setTargetAtTime(v: number): this {
    this.value = v;
    return this;
  }
}

class FakeNode {
  readonly outputs: FakeNode[] = [];
  constructor(readonly kind: string) {}
  connect<T extends FakeNode>(node: T): T {
    this.outputs.push(node);
    return node;
  }
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam();
  constructor() {
    super('gain');
  }
}

class FakeCompressor extends FakeNode {
  readonly threshold = new FakeParam();
  readonly knee = new FakeParam();
  readonly ratio = new FakeParam();
  constructor() {
    super('compressor');
  }
}

class FakeContext {
  currentTime = 0;
  state = 'running';
  readonly destination = new FakeNode('destination');
  createGain() {
    return new FakeGain();
  }
  createDynamicsCompressor() {
    return new FakeCompressor();
  }
}

function engine() {
  const ctx = new FakeContext();
  const e = new AudioEngine(() => ctx as unknown as BaseAudioContext);
  e.start();
  return { e, ctx };
}

describe('audio engine', () => {
  it('routes music, sfx and ambience through the master and a compressor to the speakers', () => {
    const { e, ctx } = engine();
    const master = e.master as unknown as FakeGain;
    for (const bus of [e.music, e.sfx, e.ambience] as unknown as FakeGain[]) expect(bus.outputs).toEqual([master]);
    const compressor = master.outputs[0];
    expect(compressor?.kind).toBe('compressor');
    expect(compressor?.outputs).toEqual([ctx.destination]);
  });

  it('mutes by setting the master gain to 0, and restores it', () => {
    const { e } = engine();
    e.setVolumes({ master: 0.7 });
    const gain = (e.master as unknown as FakeGain).gain;
    expect(gain.value).toBe(0.7);
    e.setVolumes({ muted: true });
    expect(gain.value).toBe(0);
    e.setVolumes({ muted: false });
    expect(gain.value).toBe(0.7);
  });

  it('silences the music bus at zero, and the ambience while paused', () => {
    const { e } = engine();
    e.setVolumes({ music: 0, ambience: 0.6 });
    expect((e.music as unknown as FakeGain).gain.value).toBe(0);
    const ambience = (e.ambience as unknown as FakeGain).gain;
    e.setPaused(true);
    expect(ambience.value).toBe(0);
    e.setPaused(false);
    expect(ambience.value).toBe(0.6);
  });

  it('waits for a gesture before making a context', () => {
    let made = 0;
    const e = new AudioEngine(() => {
      made++;
      return new FakeContext() as unknown as BaseAudioContext;
    });
    let ready = false;
    e.onReady(() => (ready = true));
    expect([made, ready]).toEqual([0, false]);
    e.start();
    e.start();
    expect([made, ready]).toEqual([1, true]);
  });
});
