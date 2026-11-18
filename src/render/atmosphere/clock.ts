/** Real seconds in one visual day. */
export const DAY_SECONDS = 360;

/**
 * The visual time of day: one day per 6 real minutes, frozen while the game
 * is paused. Visual only; the sim has no time of day.
 */
export class VisualClock {
  /** 0 midnight … 0.5 noon … 1 midnight again. */
  timeOfDay: number;

  constructor(start = 0.3) {
    this.timeOfDay = start;
  }

  /** A fixed time of day (benchmarks), or null to run normally. */
  private forced: number | null = null;

  forceTimeOfDay(t: number | null): void {
    this.forced = t;
    if (t !== null) this.timeOfDay = t;
  }

  advance(dt: number, paused: boolean): void {
    if (paused || this.forced !== null) return;
    this.timeOfDay = (this.timeOfDay + dt / DAY_SECONDS) % 1;
  }

  /** Hours and minutes, for the top bar. */
  get hhmm(): string {
    const minutes = Math.round(this.timeOfDay * 24 * 60) % (24 * 60);
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }
}

/**
 * Sun position for a time of day: rises in the east at 06:00, highest at
 * noon (about 60°), sets in the west at 18:00. Returns a unit vector toward
 * the sun (y up; it is below the horizon at night) and its elevation sine.
 */
export function sunDirection(timeOfDay: number): { x: number; y: number; z: number; elevation: number } {
  const angle = (timeOfDay - 0.25) * Math.PI * 2;
  const elevation = Math.sin(angle) * 0.87;
  const across = Math.cos(angle);
  // A slight southern tilt keeps noon shadows from pointing straight down.
  const x = across;
  const y = elevation;
  const z = -0.35;
  const len = Math.hypot(x, y, z);
  return { x: x / len, y: y / len, z: z / len, elevation: y / len };
}
