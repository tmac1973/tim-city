import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetSavesConnection } from './db';
import { autosave, AUTOSAVES_KEPT, deleteSave, listSaves, loadSave, saveSlot } from './saveManager';

const details = (date: string) => ({ cityName: 'Testville', date, population: 10, thumbnail: '' });

describe('save manager', () => {
  beforeEach(async () => {
    await resetSavesConnection();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('tim-city');
      request.onsuccess = () => {
        resolve();
      };
      request.onerror = () => {
        reject(new Error('Could not reset the test database'));
      };
    });
  });

  it('saves, lists, loads and deletes a slot', async () => {
    const bytes = new Uint8Array([84, 73, 77, 67, 1, 2, 3]);
    await saveSlot('My city', bytes, details('Jan 2001'));
    const list = await listSaves();
    expect(list.map((s) => s.name)).toEqual(['My city']);
    expect(list[0]).not.toHaveProperty('data');
    expect(await loadSave('My city', false)).toEqual(bytes);
    await deleteSave('My city', false);
    expect(await listSaves()).toEqual([]);
  });

  it('keeps only the newest three autosaves', async () => {
    for (let year = 1; year <= 5; year++) await autosave(new Uint8Array([year]), details(`Dec ${String(2000 + year)}`), year * 1000);
    const autos = (await listSaves()).filter((s) => s.auto);
    expect(autos).toHaveLength(AUTOSAVES_KEPT);
    expect(autos.map((s) => s.date)).toEqual(['Dec 2005', 'Dec 2004', 'Dec 2003']);
    expect(await loadSave('Autosave Dec 2005', true)).toEqual(new Uint8Array([5]));
  });
});
