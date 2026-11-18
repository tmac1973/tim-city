import { describe, expect, it } from 'vitest';
import { DAY_SECONDS, sunDirection, VisualClock } from './clock';
import { seasonBlend } from './seasons';

describe('visual clock', () => {
  it('runs one day in 360 s of unpaused time', () => {
    const clock = new VisualClock(0.25);
    for (let i = 0; i < DAY_SECONDS * 60; i++) clock.advance(1 / 60, false);
    expect(clock.timeOfDay).toBeCloseTo(0.25, 6);
    expect(clock.hhmm).toBe('06:00');
  });

  it('stands still while paused', () => {
    const clock = new VisualClock(0.4);
    clock.advance(100, true);
    expect(clock.timeOfDay).toBe(0.4);
  });

  it('puts the sun up at noon and down at midnight', () => {
    expect(sunDirection(0.5).elevation).toBeGreaterThan(0.8);
    expect(sunDirection(0).elevation).toBeLessThan(-0.8);
    expect(Math.abs(sunDirection(0.25).elevation)).toBeLessThan(0.01);
  });
});

describe('seasons', () => {
  it('snow lies in winter, melts in March and is gone by spring', () => {
    expect(seasonBlend(0, 0.5).snow).toBe(1);
    expect(seasonBlend(2, 0.5).snow).toBe(0.5);
    expect(seasonBlend(4, 0.5)).toEqual({ snow: 0, autumn: 0 });
  });

  it('leaves turn in autumn', () => {
    expect(seasonBlend(9, 0).autumn).toBe(1);
    expect(seasonBlend(6, 0.9).autumn).toBe(0);
  });
});
