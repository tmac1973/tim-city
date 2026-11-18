import { describe, expect, it } from 'vitest';
import { AutoQuality, lowerQuality } from './quality';

describe('auto quality', () => {
  it('drops a tier once when frames stay slow', () => {
    const q = new AutoQuality();
    let drops = 0;
    for (let i = 0; i < 2000; i++) if (q.sample(25)) drops++;
    expect(drops).toBe(1);
  });

  it('leaves a smooth game alone, and ignores stalls', () => {
    const q = new AutoQuality();
    let drops = 0;
    for (let i = 0; i < 2000; i++) if (q.sample(i % 100 === 0 ? 2000 : 16.7)) drops++;
    expect(drops).toBe(0);
  });

  it('steps down one tier at a time and stops at Low', () => {
    expect([lowerQuality('ultra'), lowerQuality('high'), lowerQuality('medium'), lowerQuality('low')]).toEqual(['high', 'medium', 'low', null]);
  });
});
