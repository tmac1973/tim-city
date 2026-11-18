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
export const migrations: Record<number, (save: RawSave) => RawSave> = {};

export function migrate(save: RawSave, target: number): RawSave {
  let current = save;
  while (current.version < target) {
    const step = migrations[current.version];
    if (!step) throw new Error(`No migration from save version ${String(current.version)}`);
    current = { ...step(current), version: current.version + 1 };
  }
  return current;
}
