import { describe, expect, it } from 'vitest';
import { GAME_VERSION } from './version';

describe('GAME_VERSION', () => {
  it('is a semver string', () => {
    expect(GAME_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
