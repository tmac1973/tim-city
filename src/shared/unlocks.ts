import { CITY_CLASSES, CLASS_THRESHOLDS, type UnlockId } from './protocol';

interface Unlock {
  tool: UnlockId;
  /** Display name for toasts and news. */
  name: string;
  /** City class (an index into CITY_CLASSES) the tool unlocks at. */
  cityClass: number;
}

/**
 * Tools that start locked, in the order they are announced. A tool not
 * listed is available from the start. Later phases add their tools here.
 */
let UNLOCKS: readonly Unlock[] = [{ tool: 'zoneHigh', name: 'High-density zones', cityClass: 1 }];

/** Swap the table for a test; returns a function that restores it. */
export function setUnlockTableForTest(table: readonly Unlock[]): () => void {
  const before = UNLOCKS;
  UNLOCKS = table;
  return () => {
    UNLOCKS = before;
  };
}

export function unlockClass(tool: UnlockId): number {
  return UNLOCKS.find((u) => u.tool === tool)?.cityClass ?? 0;
}

export function isUnlocked(tool: UnlockId, classReached: number): boolean {
  return unlockClass(tool) <= classReached;
}

/** Tools that unlock exactly at `cityClass`, in table order. */
export function unlocksAt(cityClass: number): UnlockId[] {
  return UNLOCKS.filter((u) => u.cityClass === cityClass).map((u) => u.tool);
}

export function unlockName(tool: UnlockId): string {
  return UNLOCKS.find((u) => u.tool === tool)?.name ?? tool;
}

/** "Town · 2,000 people" for a locked tool's label. */
export function unlockLabel(tool: UnlockId): string {
  const c = unlockClass(tool);
  return `${CITY_CLASSES[c] ?? ''} · ${(CLASS_THRESHOLDS[c] ?? 0).toLocaleString('en-US')} people`;
}

/** The refusal for using a locked tool. */
export function lockedMessage(tool: UnlockId): string {
  const c = unlockClass(tool);
  return `Unlocks at ${CITY_CLASSES[c] ?? ''} (${(CLASS_THRESHOLDS[c] ?? 0).toLocaleString('en-US')} people)`;
}
