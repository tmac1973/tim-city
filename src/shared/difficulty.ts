export type DifficultyName = 'easy' | 'medium' | 'hard';

export interface Difficulty {
  /** Starting treasury. */
  funds: number;
  /** How strongly taxes above 7% hold back demand. */
  taxSensitivity: number;
  /** Multiplier on the chance of a random disaster (phase 15). */
  disasterRate: number;
}

export const DIFFICULTY: Record<DifficultyName, Difficulty> = {
  easy: { funds: 20_000, taxSensitivity: 0.7, disasterRate: 0.5 },
  medium: { funds: 10_000, taxSensitivity: 1.0, disasterRate: 1.0 },
  hard: { funds: 5_000, taxSensitivity: 1.3, disasterRate: 1.5 },
};
