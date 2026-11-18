import { CITY_CLASSES, CLASS_THRESHOLDS, type ToolId } from './protocol';

interface Unlock {
  tool: ToolId;
  /** Display name for toasts and news. */
  name: string;
  /** City class (an index into CITY_CLASSES) the tool unlocks at. */
  cityClass: number;
}

/**
 * Tools that start locked, in the order they are announced. A tool not
 * listed is available from the start. Later phases add their tools here.
 */
let UNLOCKS: readonly Unlock[] = [];

/** Swap the table for a test; returns a function that restores it. */
export function setUnlockTableForTest(table: readonly Unlock[]): () => void {
  const before = UNLOCKS;
  UNLOCKS = table;
  return () => {
    UNLOCKS = before;
  };
}

export function unlockClass(tool: ToolId): number {
  return UNLOCKS.find((u) => u.tool === tool)?.cityClass ?? 0;
}

export function isUnlocked(tool: ToolId, classReached: number): boolean {
  return unlockClass(tool) <= classReached;
}

/** Tools that unlock exactly at `cityClass`, in table order. */
export function unlocksAt(cityClass: number): ToolId[] {
  return UNLOCKS.filter((u) => u.cityClass === cityClass).map((u) => u.tool);
}

export function unlockName(tool: ToolId): string {
  return UNLOCKS.find((u) => u.tool === tool)?.name ?? tool;
}

/** "Town · 2,000 people" for a locked tool's label. */
export function unlockLabel(tool: ToolId): string {
  const c = unlockClass(tool);
  return `${CITY_CLASSES[c] ?? ''} · ${(CLASS_THRESHOLDS[c] ?? 0).toLocaleString('en-US')} people`;
}

/** The refusal for using a locked tool. */
export function lockedMessage(tool: ToolId): string {
  const c = unlockClass(tool);
  return `Unlocks at ${CITY_CLASSES[c] ?? ''} (${(CLASS_THRESHOLDS[c] ?? 0).toLocaleString('en-US')} people)`;
}
