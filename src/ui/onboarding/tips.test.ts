import { describe, expect, it } from 'vitest';
import { currentTip, type TipFacts } from './tips';

const empty: TipFacts = { roads: 0, lines: 0, zones: 0, plants: 0, unpowered: 0, pop: 0, budgetOpen: false, problems: 0, disasters: 0 };

describe('onboarding tips', () => {
  it('walk a new player from camera to power to roads to zones', () => {
    const seen: string[] = [];
    const next = (f: TipFacts) => {
      const tip = currentTip(f, seen);
      if (tip) seen.push(tip.id);
      return tip?.id;
    };
    expect(next(empty)).toBe('camera');
    expect(next(empty)).toBe('power');
    expect(next({ ...empty, plants: 1 })).toBe('road');
    expect(next({ ...empty, plants: 1, roads: 10 })).toBe('zones');
    expect(next({ ...empty, plants: 1, roads: 10, zones: 4, unpowered: 4 })).toBe('lines');
    expect(next({ ...empty, plants: 1, roads: 10, zones: 4 })).toBe('speed');
    expect(next({ ...empty, plants: 1, roads: 10, zones: 4, pop: 20 })).toBe('growth');
    expect(next({ ...empty, plants: 1, roads: 10, zones: 4, pop: 20 })).toBeUndefined();
  });

  it('skips tips the player has already seen', () => {
    expect(currentTip({ ...empty, disasters: 1 }, ['camera', 'power'])?.id).toBe('disaster');
  });
});
