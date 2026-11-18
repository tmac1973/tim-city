/**
 * Camera shake from "trauma" (0–1): the offset grows with trauma squared
 * and trauma decays steadily, so a quake jolts hard and settles smoothly.
 */
export class Shake {
  trauma = 0;
  private time = 0;

  constructor(private readonly decay = 0.7) {}

  add(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Keep trauma at least this high (while a quake is still going). */
  hold(level: number): void {
    this.trauma = Math.max(this.trauma, Math.min(1, level));
  }

  update(dt: number): void {
    this.time += dt;
    this.trauma = Math.max(0, this.trauma - this.decay * dt);
  }

  /** Offset in world units for this frame (x, y, z). */
  offset(scale: number): [number, number, number] {
    const s = this.trauma * this.trauma * scale;
    const t = this.time;
    // Unrelated sine mixes stand in for noise.
    return [
      s * (Math.sin(t * 37.1) * 0.6 + Math.sin(t * 61.7 + 1.3) * 0.4),
      s * 0.6 * (Math.sin(t * 43.3 + 2.1) * 0.6 + Math.sin(t * 71.9) * 0.4),
      s * (Math.sin(t * 29.3 + 4.2) * 0.6 + Math.sin(t * 53.1 + 0.7) * 0.4),
    ];
  }
}
