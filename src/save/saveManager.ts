import { peekSave } from '@/sim/serialize';
import { gunzip, gzip } from './compress';
import { openSaves, type SaveRecord } from './db';

/** How many autosaves to keep; older ones are deleted. */
export const AUTOSAVES_KEPT = 3;
export const AUTOSAVE_PREFIX = 'Autosave';

export interface SaveDetails {
  cityName: string;
  date: string;
  population: number;
  thumbnail: string;
}

async function record(name: string, bytes: Uint8Array, details: SaveDetails, savedAt: number): Promise<SaveRecord> {
  return { name, savedAt, ...details, data: await gzip(bytes) };
}

export async function saveSlot(name: string, bytes: Uint8Array, details: SaveDetails): Promise<void> {
  const db = await openSaves();
  await db.put('slots', await record(name, bytes, details, Date.now()));
}

/** Store an autosave and drop all but the newest three. */
export async function autosave(bytes: Uint8Array, details: SaveDetails, now = Date.now()): Promise<void> {
  const db = await openSaves();
  await db.put('autosaves', await record(`${AUTOSAVE_PREFIX} ${details.date}`, bytes, details, now));
  const keys = await db.getAllKeys('autosaves');
  const stale = keys.sort((a, b) => b - a).slice(AUTOSAVES_KEPT);
  for (const key of stale) await db.delete('autosaves', key);
}

/** All slots and autosaves, newest first, without their data. */
export async function listSaves(): Promise<(Omit<SaveRecord, 'data'> & { auto: boolean })[]> {
  const db = await openSaves();
  const slots = (await db.getAll('slots')).map((r) => ({ ...r, auto: false }));
  const autos = (await db.getAll('autosaves')).map((r) => ({ ...r, auto: true }));
  // Leave the save data behind: the list only needs the details.
  const withoutData = (r: SaveRecord & { auto: boolean }) => {
    const copy: Partial<SaveRecord> & { auto: boolean } = { ...r };
    delete copy.data;
    return copy as Omit<SaveRecord, 'data'> & { auto: boolean };
  };
  return [...slots, ...autos].sort((a, b) => b.savedAt - a.savedAt).map(withoutData);
}

/** The uncompressed bytes of a slot or autosave, or null if it is gone. */
export async function loadSave(name: string, auto: boolean): Promise<Uint8Array | null> {
  const db = await openSaves();
  const found = auto ? (await db.getAll('autosaves')).find((r) => r.name === name) : await db.get('slots', name);
  return found ? gunzip(found.data) : null;
}

export async function deleteSave(name: string, auto: boolean): Promise<void> {
  const db = await openSaves();
  if (!auto) {
    await db.delete('slots', name);
    return;
  }
  const found = (await db.getAll('autosaves')).find((r) => r.name === name);
  if (found) await db.delete('autosaves', found.savedAt);
}

/** Offer a .timcity file (gzipped save) for download. */
export async function exportFile(bytes: Uint8Array, cityName: string): Promise<void> {
  const data = await gzip(bytes);
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${cityName.replace(/[^\w -]+/g, '').trim() || 'city'}.timcity`;
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

/** Read a .timcity file into a slot named after its city; returns the slot name. */
export async function importFile(file: File): Promise<string> {
  const bytes = await gunzip(new Uint8Array(await file.arrayBuffer()));
  const { name } = peekSave(bytes);
  const slot = `${name} (imported)`;
  await saveSlot(slot, bytes, { cityName: name, date: 'Imported', population: 0, thumbnail: '' });
  return slot;
}
