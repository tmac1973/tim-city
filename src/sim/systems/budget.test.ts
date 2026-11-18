import { describe, expect, it } from 'vitest';
import { DIFFICULTY } from '@/shared/difficulty';
import type { SimEvent, ToolCommand, ToolId } from '@/shared/protocol';
import { zoneKind, ZoneType } from '@/shared/tiles';
import { CityState } from '../state';
import { placeFootprint } from '../tools/footprint';
import { runTool } from '../tools';
import { budgetSystem, computeLedger, issueBond, MAX_BONDS, repayBond } from './budget';

function flatCity(): CityState {
  const state = new CityState({ name: 'T', seed: 'budget', size: 128 });
  state.heights.fill(3);
  state.funds = 1e6;
  return state;
}

const tool = (t: ToolId, x0: number, y0: number, x1 = x0, y1 = y0): ToolCommand => ({
  type: 'tool', tool: t, x0, y0, x1, y1, brush: 1, tunnel: false, dryRun: false, requestId: 0,
});

/** Close one year's books; returns the events. */
function closeYear(s: CityState): SimEvent[] {
  const events: SimEvent[] = [];
  s.date.month = 11;
  budgetSystem((e) => events.push(e)).run(s, 15);
  return events;
}

/** One residential zone of density 5 (100 residents) on land value 100. */
function taxedCity(): CityState {
  const s = flatCity();
  runTool(s, tool('residential', 20, 20));
  placeFootprint(s, 19, 19, zoneKind(ZoneType.R, 5));
  s.field('landValue').fill(100);
  return s;
}

describe('taxes and running costs', () => {
  it('collects people × land value × rate × 0.002', () => {
    const s = taxedCity();
    expect(computeLedger(s).residentialTax).toBe(140);
    s.taxRate = 14;
    expect(computeLedger(s).residentialTax).toBe(280);
  });

  it('scales station costs with funding', () => {
    const s = flatCity();
    runTool(s, tool('police', 20, 20));
    runTool(s, tool('police', 40, 20));
    expect(computeLedger(s).police).toBe(200);
    s.funding.police = 50;
    expect(computeLedger(s).police).toBe(100);
  });

  it('charges water towers and landfills a year of upkeep, scaled by utilities funding', () => {
    const s = flatCity();
    runTool(s, tool('waterTower', 20, 20));
    runTool(s, tool('landfill', 40, 40));
    expect(computeLedger(s).utilities).toBe((20 + 30) * 12);
    s.funding.utilities = 50;
    expect(computeLedger(s).utilities).toBe(300);
  });

  it('charges $1 per road tile and $2 per rail tile at full funding', () => {
    const s = flatCity();
    runTool(s, tool('road', 10, 10, 19, 10));
    runTool(s, tool('rail', 10, 12, 14, 12));
    expect(computeLedger(s).roads).toBe(10 + 2 * 5);
  });

  it('pays the net into the treasury at year end and records the books', () => {
    const s = taxedCity();
    s.funds = 1000;
    s.constructionThisYear = 300;
    const events = closeYear(s);
    expect(s.funds).toBe(1000 + 140);
    expect(s.lastYear).toMatchObject({ residentialTax: 140, construction: 300 });
    expect(s.constructionThisYear).toBe(0);
    expect(events).toContainEqual(expect.objectContaining({ type: 'yearBudget', net: 140 }));
  });
});

describe('bonds', () => {
  it('repays $10,000 at 5% with $12,750 over ten years', () => {
    const s = flatCity();
    const start = s.funds;
    expect(issueBond(s)).toBe(true);
    expect(s.funds).toBe(start + 10_000);
    for (let year = 0; year < 10; year++) closeYear(s);
    expect(s.bonds).toHaveLength(0);
    expect(start + 10_000 - s.funds).toBe(12_750);
  });

  it('charges 1% more for each bond already out, up to five', () => {
    const s = flatCity();
    for (let i = 0; i < MAX_BONDS; i++) expect(issueBond(s)).toBe(true);
    expect(s.bonds.map((b) => b.rate)).toEqual([0.05, 0.06, 0.07, 0.08, 0.09]);
    expect(issueBond(s)).toBe(false);
  });

  it('can be repaid early when the treasury covers it', () => {
    const s = flatCity();
    issueBond(s);
    s.funds = 5000;
    expect(repayBond(s, 0)).toBe(false);
    s.funds = 20_000;
    expect(repayBond(s, 0)).toBe(true);
    expect(s.funds).toBe(10_000);
    expect(s.bonds).toHaveLength(0);
  });
});

describe('bankruptcy', () => {
  it('borrows automatically when the year ends in the red', () => {
    const s = flatCity();
    s.funds = -500;
    closeYear(s);
    expect(s.bonds).toHaveLength(1);
    expect(s.funds).toBe(9500);
    expect(s.bankrupt).toBe(false);
  });

  it('goes bankrupt in the red with five bonds out, and stops building', () => {
    const s = flatCity();
    for (let i = 0; i < MAX_BONDS; i++) issueBond(s);
    s.funds = -100_000;
    const events = closeYear(s);
    expect(events).toContainEqual({ type: 'bankrupt' });
    expect(s.bankrupt).toBe(true);
    s.funds = 1e6;
    expect(runTool(s, tool('road', 5, 5, 8, 5))).toMatchObject({ ok: false, reason: 'The city is bankrupt' });
  });
});

describe('difficulty', () => {
  it('starts with $20,000, $10,000 and $5,000', () => {
    expect([DIFFICULTY.easy.funds, DIFFICULTY.medium.funds, DIFFICULTY.hard.funds]).toEqual([20_000, 10_000, 5_000]);
  });

  it('makes demand more sensitive to taxes on hard', () => {
    const s = flatCity();
    s.taxRate = 12;
    s.difficulty = 'easy';
    const easy = s.taxSensitivity;
    s.difficulty = 'hard';
    expect(s.taxSensitivity).toBeGreaterThan(easy);
  });
});
