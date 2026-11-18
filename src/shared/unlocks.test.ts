import { afterEach, describe, expect, it } from 'vitest';
import { isUnlocked, lockedMessage, setUnlockTableForTest, unlockLabel, unlocksAt } from './unlocks';

let restore: (() => void) | null = null;
afterEach(() => {
  restore?.();
  restore = null;
});

describe('unlocks', () => {
  it('leaves a tool missing from the table available from the start', () => {
    expect(isUnlocked('road', 0)).toBe(true);
    expect(unlocksAt(1)).toEqual([]);
  });

  it('locks a tool until its class and lists unlocks in table order', () => {
    restore = setUnlockTableForTest([
      { tool: 'nuclear', name: 'Nuclear plant', cityClass: 2 },
      { tool: 'stadium', name: 'Stadium', cityClass: 1 },
      { tool: 'airport', name: 'Airport', cityClass: 2 },
    ]);
    expect(isUnlocked('nuclear', 1)).toBe(false);
    expect(isUnlocked('nuclear', 2)).toBe(true);
    expect(unlocksAt(2)).toEqual(['nuclear', 'airport']);
    expect(lockedMessage('nuclear')).toBe('Unlocks at City (10,000 people)');
    expect(unlockLabel('stadium')).toBe('Town · 2,000 people');
  });
});
