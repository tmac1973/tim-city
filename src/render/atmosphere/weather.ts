import type { VisualRng } from '../agents/visualRng';
import { isWinter } from './seasons';

export type WeatherKind = 'clear' | 'overcast' | 'rain' | 'storm' | 'snow' | 'fog';

/** Relative odds of each kind by season. Snow only in winter. */
function odds(month: number): [WeatherKind, number][] {
  if (isWinter(month)) return [['clear', 30], ['overcast', 22], ['snow', 30], ['fog', 13], ['rain', 5]];
  const wet = (month >= 2 && month <= 4) || (month >= 8 && month <= 10);
  if (wet) return [['clear', 30], ['overcast', 20], ['rain', 30], ['storm', 10], ['fog', 10]];
  return [['clear', 50], ['overcast', 15], ['rain', 15], ['storm', 15], ['fog', 5]];
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

  /** Weather held fixed (benchmarks), or null to change normally. */
  private forced: WeatherKind | null = null;

  forceWeather(kind: WeatherKind | null): void {
    this.forced = kind;
    if (kind) {
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
    for (const key of Object.keys(target) as (keyof WeatherMix)[]) this.mix[key] += (target[key] - this.mix[key]) * k;
  }

  change(month: number, kind?: WeatherKind): void {
    this.timer = this.rng.range(120, 360);
    if (kind) {
      this.kind = kind;
      return;
    }
    const table = odds(month);
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
