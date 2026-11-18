import type { QualityName } from '@/shared/settings';

const TIERS: QualityName[] = ['low', 'medium', 'high', 'ultra'];

/** The tier below, or null at the bottom. */
export const lowerQuality = (q: QualityName): QualityName | null => TIERS[TIERS.indexOf(q) - 1] ?? null;

/**
 * Watches frame times and asks for a lower graphics tier, once, when the
 * median over the last 5 seconds stays above 20 ms (under 50 fps). Long
 * stalls (a hidden tab, a debugger) are ignored, and nothing is judged in
 * the first seconds while shaders compile.
 */
export class AutoQuality {
  private readonly frames: number[] = [];
  private elapsed = 0;
  private done = false;

  constructor(
    private readonly windowSeconds = 5,
    private readonly limitMs = 20,
    private readonly warmupSeconds = 6,
  ) {}

  /** Feed one frame's duration; true exactly once, when quality should drop. */
  sample(ms: number): boolean {
    if (this.done || ms > 250) return false;
    this.elapsed += ms / 1000;
    if (this.elapsed < this.warmupSeconds) return false;
    this.frames.push(ms);
    let total = this.frames.reduce((a, b) => a + b, 0);
    while (total > this.windowSeconds * 1000 && this.frames.length > 1) total -= this.frames.shift() ?? 0;
    if (total < this.windowSeconds * 1000 * 0.95) return false;
    const sorted = [...this.frames].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    if (median <= this.limitMs) return false;
    this.done = true;
    return true;
  }
}
