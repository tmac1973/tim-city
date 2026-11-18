export const MAP_SIZES = [128, 256] as const;
export type MapSize = (typeof MAP_SIZES)[number];

/** Chunks are 32×32 tiles; the renderer rebuilds and the worker ships data per chunk. */
export const CHUNK_SHIFT = 5;
export const CHUNK_SIZE = 1 << CHUNK_SHIFT;

export const TICKS_PER_MONTH = 16;
export const MONTHS_PER_YEAR = 12;
export const START_YEAR = 2000;

export const MAX_HEIGHT = 15;
/** A tile whose four corners are all at or below this height is water. */
export const SEA_LEVEL = 2;

/** December, January and February (months are 0-based). */
export const isWinter = (month: number): boolean => month === 11 || month === 0 || month === 1;

/** Starting funds until phase 11 adds difficulty levels. */
export const DEFAULT_FUNDS = 10_000;

/** Real milliseconds per game month at each speed; 0 means paused. */
export const SPEED_MS_PER_MONTH = {
  paused: 0,
  slow: 8000,
  normal: 4000,
  fast: 1500,
} as const;
export type Speed = keyof typeof SPEED_MS_PER_MONTH;
