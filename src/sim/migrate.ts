import { ZoneTier, zoneOf } from '@/shared/tiles';

/** Months an old city gets before water and garbage start to matter. */
export const UTILITY_GRACE_MONTHS = 24;

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
  // 3 → 4: water and garbage. New funding lines at full, and two years before the rules apply.
  3: (save) => {
    const date = save.header.date as { year: number; month: number };
    const funding = save.header.funding as Record<string, number>;
    return {
      ...save,
      header: {
        ...save.header,
        funding: { ...funding, transit: 100, utilities: 100 },
        lastYear: save.header.lastYear ? { transit: 0, utilities: 0, landmarks: 0, tourism: 0, ...(save.header.lastYear) } : null,
        utilityGraceUntil: date.year * 12 + date.month + UTILITY_GRACE_MONTHS,
      },
    };
  },
  // 4 → 5: landmarks. No tourists yet; the new coverage fields start empty.
  4: (save) => ({ ...save, header: { ...save.header, tourism: 0 } }),
  // 5 → 6: subway. No track yet; the empty layer is made on load.
  5: (save) => save,
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
