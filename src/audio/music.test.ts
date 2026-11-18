import { describe, expect, it } from 'vitest';
import { VisualRng } from '@/render/agents/visualRng';
import { Composer, type Mood, scaleNotes } from './music';

describe('generative music', () => {
  it('keeps every pitched note inside the current scale', () => {
    for (const mood of ['bright', 'calm', 'night', 'tense'] as Mood[]) {
      const c = new Composer(new VisualRng(9));
      c.mood = mood;
      const scale = new Set(scaleNotes(mood));
      let t = 0;
      for (let bar = 0; bar < 64; bar++) {
        for (const n of c.nextBar(t)) if (n.voice === 'pad' || n.voice === 'pluck') expect(scale.has(n.midi)).toBe(true);
        t += c.secondsPerBar;
      }
    }
  });

  it('never schedules a note before the bar it was asked for', () => {
    const c = new Composer(new VisualRng(10));
    let t = 12.5;
    for (let bar = 0; bar < 100; bar++) {
      for (const n of c.nextBar(t)) {
        expect(n.time).toBeGreaterThanOrEqual(t);
        expect(n.time).toBeLessThan(t + c.secondsPerBar);
      }
      t += c.secondsPerBar;
    }
  });

  it('keeps the tempo between 70 and 90 BPM', () => {
    const c = new Composer(new VisualRng(11));
    for (let bar = 0; bar < 80; bar++) {
      c.nextBar(bar * 3);
      expect(c.bpm).toBeGreaterThanOrEqual(70);
      expect(c.bpm).toBeLessThanOrEqual(90);
    }
  });
});
