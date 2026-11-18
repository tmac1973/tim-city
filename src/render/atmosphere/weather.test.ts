import { describe, expect, it } from 'vitest';
import { VisualRng } from '../agents/visualRng';
import { Weather, type WeatherKind } from './weather';

describe('weather', () => {
  it('never starts snow outside December to February', () => {
    const w = new Weather(new VisualRng(3));
    for (let month = 2; month <= 10; month++) {
      for (let i = 0; i < 500; i++) {
        w.change(month);
        expect(w.kind).not.toBe('snow');
      }
    }
  });

  it('does snow in winter sometimes', () => {
    const w = new Weather(new VisualRng(4));
    let snow = 0;
    for (let i = 0; i < 200; i++) {
      w.change(0);
      if (w.kind === 'snow') snow++;
    }
    expect(snow).toBeGreaterThan(20);
  });

  it('ends snow as soon as winter does', () => {
    const w = new Weather(new VisualRng(5));
    w.change(0, 'snow');
    w.step(0.1, 3, false);
    expect(w.kind).not.toBe('snow');
  });

  it('changes the same way for the same seed', () => {
    const run = () => {
      const w = new Weather(new VisualRng(42));
      const kinds: WeatherKind[] = [];
      for (let t = 0; t < 3600; t++) {
        w.step(1, Math.floor(t / 300) % 12, false);
        kinds.push(w.kind);
      }
      return kinds;
    };
    expect(run()).toEqual(run());
  });
});
