import type { CityMirror } from '../mirror';
import { HEIGHT_UNIT } from '../units';

export type Rgba = readonly [number, number, number, number];

/** Highest corner of a tile, in world units: where flames and water sit. */
export function tileTop(m: CityMirror, x: number, y: number): number {
  return Math.max(m.corner(x, y), m.corner(x + 1, y), m.corner(x, y + 1), m.corner(x + 1, y + 1)) * HEIGHT_UNIT;
}

/** Emit `rate` per second smoothly: returns how many to emit this frame. */
export class Rate {
  private carry = 0;
  take(rate: number, dt: number): number {
    this.carry += rate * dt;
    const n = Math.floor(this.carry);
    this.carry -= n;
    return n;
  }
}
