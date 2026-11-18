import { describe, expect, it } from 'vitest';
import { Rng } from './rng';

describe('Rng', () => {
  it('gives a fixed sequence for a fixed seed', () => {
    const rng = new Rng('tim');
    const values = Array.from({ length: 10 }, () => rng.next());
    expect(values).toMatchInlineSnapshot(`
      [
        537820611,
        3810939679,
        3530807035,
        1607614665,
        3695350426,
        334255759,
        1399546722,
        2810377656,
        2222189451,
        1628863887,
      ]
    `);
  });

  it('gives the same sequence for the same seed and a different one for another seed', () => {
    const a = new Rng('alpha');
    const b = new Rng('alpha');
    const c = new Rng('beta');
    const seqA = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(seqA);
    expect(Array.from({ length: 5 }, () => c.next())).not.toEqual(seqA);
  });

  it('keeps nextInt and nextFloat in range', () => {
    const rng = new Rng('range');
    for (let i = 0; i < 10_000; i++) {
      const f = rng.nextFloat();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = rng.nextInt(7);
      expect(Number.isInteger(n) && n >= 0 && n < 7).toBe(true);
    }
  });

  it('forks independent streams that depend only on seed and label', () => {
    const root = new Rng('tim');
    root.next(); // advancing the parent must not change its forks
    const fork1 = root.fork('terrain');
    const fork2 = new Rng('tim').fork('terrain');
    const other = root.fork('zones');
    const seq1 = Array.from({ length: 5 }, () => fork1.next());
    expect(Array.from({ length: 5 }, () => fork2.next())).toEqual(seq1);
    expect(Array.from({ length: 5 }, () => other.next())).not.toEqual(seq1);
  });

  it('restores from a saved state', () => {
    const rng = new Rng('save');
    rng.next();
    const saved = rng.getState();
    const expected = [rng.next(), rng.next(), rng.next()];
    const restored = new Rng('anything');
    restored.setState(saved);
    expect([restored.next(), restored.next(), restored.next()]).toEqual(expected);
  });
});
