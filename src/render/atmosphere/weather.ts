import type { VisualRng } from '../agents/visualRng';
import { isWinter } from './seasons';

export type WeatherKind = 'clear' | 'overcast' | 'rain' | 'storm' | 'snow' | 'fog';

/**
 * Relative odds of each kind by season. Snow only in winter. In a month the
 * sim calls overcast, clear skies are rare and cloud and storms twice as likely.
 */
export function odds(month: number, overcast = false): [WeatherKind, number][] {
  const base: [WeatherKind, number][] = isWinter(month)
    ? [['clear', 22], ['overcast', 20], ['snow', 45], ['fog', 10], ['rain', 3]]
    : (month >= 2 && month <= 4) || (month >= 8 && month <= 10)
      ? [['clear', 30], ['overcast', 20], ['rain', 30], ['storm', 10], ['fog', 10]]
      : [['clear', 50], ['overcast', 15], ['rain', 15], ['storm', 15], ['fog', 5]];
  if (!overcast) return base;
  return base.map(([k, w]) => [k, k === 'clear' ? w * 0.2 : k === 'overcast' || k === 'storm' ? w * 2 : w]);
}

/** How strongly each effect shows, eased toward the current kind's targets. */
export interface WeatherMix {
  cloud: number;
  rain: number;
  snow: number;
  fog: number;
  storm: number;
}

const TARGETS: Record<WeatherKind, WeatherMix> = {
  clear: { cloud: 0, rain: 0, snow: 0, fog: 0, storm: 0 },
  overcast: { cloud: 0.7, rain: 0, snow: 0, fog: 0.1, storm: 0 },
  rain: { cloud: 0.85, rain: 0.7, snow: 0, fog: 0.2, storm: 0 },
  storm: { cloud: 1, rain: 1, snow: 0, fog: 0.3, storm: 1 },
  snow: { cloud: 0.75, rain: 0, snow: 1, fog: 0.25, storm: 0 },
  fog: { cloud: 0.5, rain: 0, snow: 0, fog: 1, storm: 0 },
};

/**
 * Weather as a seeded state machine: a new kind every 2–6 real minutes,
 * picked by season. Visual only; it never touches the sim.
 */
export class Weather {
  kind: WeatherKind = 'clear';
  /** Seconds until the next change. */
  timer: number;
  readonly mix: WeatherMix = { ...TARGETS.clear };

  constructor(private readonly rng: VisualRng) {
    this.timer = rng.range(120, 360);
  }

  /** The sim says this month is overcast (solar farms give less). */
  overcast = false;
  /**
   * How hard this spell of rain, storm or snow comes down: 0.35 (a drizzle,
   * light flurries) to 1 (a downpour, a blizzard). Picked at each change.
   */
  intensity = 1;

  /** Weather held fixed (benchmarks), or null to change normally. */
  private forced: WeatherKind | null = null;

  forceWeather(kind: WeatherKind | null): void {
    this.forced = kind;
    if (kind) {
      this.intensity = 1;
      this.kind = kind;
      Object.assign(this.mix, TARGETS[kind]);
    }
  }

  step(dt: number, month: number, paused: boolean): void {
    if (this.forced) return;
    if (!paused) this.timer -= dt;
    // Snow stops the moment winter ends.
    if (this.timer <= 0 || (this.kind === 'snow' && !isWinter(month))) this.change(month);
    const target = TARGETS[this.kind];
    const k = Math.min(1, dt / 8);
    for (const key of Object.keys(target) as (keyof WeatherMix)[]) {
      // Rain and snow fall as hard as this spell's intensity; cloud and storm stay as they are.
      const goal = key === 'rain' || key === 'snow' ? target[key] * this.intensity : target[key];
      this.mix[key] += (goal - this.mix[key]) * k;
    }
  }

  change(month: number, kind?: WeatherKind): void {
    this.timer = this.rng.range(120, 360);
    this.intensity = this.rng.range(0.35, 1);
    if (kind) {
      this.kind = kind;
      return;
    }
    const table = odds(month, this.overcast);
    let roll = this.rng.next() * table.reduce((sum, [, w]) => sum + w, 0);
    for (const [k, w] of table) {
      roll -= w;
      if (roll < 0) {
        this.kind = k;
        return;
      }
    }
    this.kind = 'clear';
  }
}
