import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings';

function memory() {
  const store = new Map<string, string>();
  return { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
}

describe('settings', () => {
  it('persist and come back', () => {
    const storage = memory();
    saveSettings({ ...DEFAULT_SETTINGS, quality: 'low', sensitivity: 1.5, seenTips: ['power'] }, storage);
    expect(loadSettings(storage)).toEqual({ ...DEFAULT_SETTINGS, quality: 'low', sensitivity: 1.5, seenTips: ['power'] });
  });

  it('fall back to defaults when storage throws or holds junk', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadSettings(throwing)).toEqual(DEFAULT_SETTINGS);
    expect(() => { saveSettings(DEFAULT_SETTINGS, throwing); }).not.toThrow();
    const junk = memory();
    junk.setItem('timcity.settings', '{"quality":"potato","sensitivity":9}');
    expect(loadSettings(junk)).toMatchObject({ quality: 'high', sensitivity: 2 });
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
});
