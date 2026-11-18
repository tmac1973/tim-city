import { describe, expect, it } from 'vitest';
import type { HistorySample, SimEvent, ToolCommand, ToolId } from '@/shared/protocol';
import { setUnlockTableForTest } from '@/shared/unlocks';
import { CityState } from '../state';
import { runTool } from '../tools';
import { takeCensus } from './census';
import { approvalFrom, cityClassFor, evaluate, evaluationSystem } from './evaluation';
import { MONTHLY_SAMPLES, record, sample, YEARLY_SAMPLES } from './history';
import { findHotspot } from './hotspots';
import { headlineFor } from './news';
import { updatePollution } from './pollution';

function flatCity(): CityState {
  const state = new CityState({ name: 'Testville', seed: 'eval', size: 128 });
  state.heights.fill(3);
  state.funds = 1e6;
  return state;
}

const tool = (t: ToolId, x0: number, y0: number, x1 = x0, y1 = y0): ToolCommand => ({
  type: 'tool', tool: t, x0, y0, x1, y1, brush: 1, tunnel: false, dryRun: false, requestId: 0,
});

/** A populated quarter: blocks 10–20 on both axes have people. */
function populated(): CityState {
  const s = flatCity();
  const density = s.field('popDensity');
  const side = s.size >> 1;
  for (let by = 10; by < 20; by++) for (let bx = 10; bx < 20; bx++) density[by * side + bx] = 100;
  s.field('landValue').fill(120);
  s.field('policeCover').fill(200);
  s.field('fireCover').fill(200);
  return s;
}

describe('problems and approval', () => {
  it('ranks crime first in a high-crime city', () => {
    const s = populated();
    s.field('crime').fill(220);
    const e = evaluate(s);
    expect(e.problems[0]?.id).toBe('crime');
    expect(e.problems[0]?.cause).toBe('Crime in a low land value area');
  });

  it('puts taxes among the top problems at 20%', () => {
    const s = populated();
    s.taxRate = 20;
    const top = evaluate(s).problems.slice(0, 3).map((p) => p.id);
    expect(top).toContain('taxes');
    expect(evaluate(s).problems.find((p) => p.id === 'taxes')?.score).toBe(100);
  });

  it('keeps approval within 0–100', () => {
    expect(approvalFrom([0, 0, 0])).toBe(100);
    expect(approvalFrom([100, 100, 100])).toBe(0);
    expect(approvalFrom([60, 40, 20])).toBe(100 - (30 + 12 + 4));
  });

  it('splits the poll among the top four problems', () => {
    const s = populated();
    s.field('crime').fill(200);
    s.field('pollution').fill(100);
    const poll = evaluate(s).problems.slice(0, 4);
    expect(poll.reduce((sum, p) => sum + p.percent, 0)).toBeGreaterThanOrEqual(98);
    expect(poll.reduce((sum, p) => sum + p.percent, 0)).toBeLessThanOrEqual(102);
  });
});

describe('city class', () => {
  it('places populations in classes', () => {
    expect([0, 1999, 2000, 9999, 10_000, 50_000, 100_000, 500_000].map(cityClassFor)).toEqual([0, 0, 1, 1, 2, 3, 4, 5]);
  });

  it('announces each promotion once', () => {
    const s = flatCity();
    const events: SimEvent[] = [];
    const system = evaluationSystem((e) => events.push(e));
    for (const pop of [500, 2500, 2600, 12_000, 11_000, 12_500]) {
      s.census = { ...s.census, resPop: pop };
      system.run(s, 13);
    }
    const milestones = events.flatMap((e) => (e.type === 'milestone' ? [e.cityClass] : []));
    expect(milestones).toEqual(['Town', 'City']);
    const headline = headlineFor(events.find((e) => e.type === 'milestone') ?? { type: 'bankrupt' }, s);
    expect(headline?.headline).toBe('Testville is now a Town! Population passes 2,500. Now available: High-density zones');
  });

  it('lists the tools each passed class unlocks, even when a jump skips a class', () => {
    const restore = setUnlockTableForTest([
      { tool: 'stadium', name: 'Stadium', cityClass: 1 },
      { tool: 'airport', name: 'Airport', cityClass: 2 },
    ]);
    try {
      const s = flatCity();
      const events: SimEvent[] = [];
      const system = evaluationSystem((e) => events.push(e));
      s.census = { ...s.census, resPop: 12_000 };
      system.run(s, 13);
      const milestone = events.find((e) => e.type === 'milestone');
      expect(milestone).toMatchObject({ cityClass: 'City', unlocked: ['stadium', 'airport'] });
      expect(headlineFor(milestone ?? { type: 'bankrupt' }, s)?.headline).toBe(
        'Testville is now a City! Population passes 12,000. Now available: Stadium, Airport',
      );
    } finally {
      restore();
    }
  });
});

describe('hotspots', () => {
  it('points at the coal plant for pollution', () => {
    const s = flatCity();
    runTool(s, tool('coal', 40, 40));
    runTool(s, tool('residential', 46, 41));
    s.field('popDensity').fill(50);
    updatePollution(s);
    const spot = findHotspot(s, 'pollution');
    expect(Math.hypot((spot.x ?? 0) - 40, (spot.y ?? 0) - 40)).toBeLessThan(4);
    expect(spot.cause).toBe('Pollution from a power plant');
  });

  it('finds homes with no fire cover', () => {
    const s = populated();
    s.field('fireCover').fill(0);
    expect(findHotspot(s, 'fires').cause).toBe('No fire coverage here');
  });
});

describe('history', () => {
  it('keeps 120 samples, dropping the oldest', () => {
    const s = flatCity();
    takeCensus(s);
    const buffer: HistorySample[] = [];
    for (let year = 0; year < YEARLY_SAMPLES + 10; year++) {
      s.date.year = 2000 + year;
      record(buffer, sample(s), YEARLY_SAMPLES);
    }
    expect(buffer).toHaveLength(YEARLY_SAMPLES);
    expect(buffer[0]?.year).toBe(2010);
    expect(MONTHLY_SAMPLES).toBe(120);
  });
});
