import { ZoneTier, zoneOf } from '@/shared/tiles';

/** A save as read from disk, before it becomes a CityState. */
export interface RawSave {
  version: number;
  header: Record<string, unknown>;
  arrays: Map<string, Uint8Array>;
}

/**
 * migrations[v] turns a version-v save into version v + 1. Each phase that
 * changes the save format adds one entry here.
 */
export const migrations: Record<number, (save: RawSave) => RawSave> = {
  // 1 → 2: disasters. Nothing was burning or contaminated in version 1.
  1: (save) => ({
    ...save,
    header: {
      ...save.header,
      disasters: [],
      nextDisasterId: 1,
      radiation: [],
      pollutionSpills: [],
      census: { landmarks: { airport: 0, seaport: 0 }, water: 0, ...(save.header.census as object) },
    },
  }),
  // 2 → 3: density tiers. Every existing zone becomes high density, so nothing shrinks.
  2: (save) => {
    const bytes = save.arrays.get('tiles') ?? new Uint8Array(0);
    const tiles = new Uint16Array(bytes.slice().buffer, 0, bytes.length >> 1);
    const tier = new Uint8Array(tiles.length);
    for (let i = 0; i < tiles.length; i++) if (zoneOf(tiles[i] ?? 0)) tier[i] = ZoneTier.High;
    const arrays = new Map(save.arrays);
    arrays.set('zoneTier', tier);
    return { ...save, arrays };
  },
};

export function migrate(save: RawSave, target: number): RawSave {
  let current = save;
  while (current.version < target) {
    const step = migrations[current.version];
    if (!step) throw new Error(`No migration from save version ${String(current.version)}`);
    current = { ...step(current), version: current.version + 1 };
  }
  return current;
}
