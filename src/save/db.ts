import { type DBSchema, type IDBPDatabase, openDB } from 'idb';

/** A saved city: the gzipped save plus what the load list shows. */
export interface SaveRecord {
  /** Slot name (key in `slots`). */
  name: string;
  savedAt: number;
  cityName: string;
  date: string;
  population: number;
  /** Small JPEG data URL of the view when saved. */
  thumbnail: string;
  /** gzip-compressed save bytes. */
  data: Uint8Array;
}

interface TimCityDB extends DBSchema {
  slots: { key: string; value: SaveRecord };
  autosaves: { key: number; value: SaveRecord };
}

let db: Promise<IDBPDatabase<TimCityDB>> | null = null;

export function openSaves(): Promise<IDBPDatabase<TimCityDB>> {
  db ??= openDB<TimCityDB>('tim-city', 1, {
    upgrade(database) {
      database.createObjectStore('slots', { keyPath: 'name' });
      database.createObjectStore('autosaves', { keyPath: 'savedAt' });
    },
  });
  return db;
}

/** For tests: close the open connection so the database can be deleted and reopened. */
export async function resetSavesConnection(): Promise<void> {
  const open = db;
  db = null;
  if (open) (await open).close();
}
