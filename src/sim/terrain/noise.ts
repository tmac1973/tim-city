import type { Rng } from '../rng';

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const GRAD = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
] as const;

/** Seeded 2D simplex noise (Gustavson's formulation). */
export class Simplex2D {
  private readonly perm = new Uint8Array(512);

  constructor(rng: Rng) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = rng.nextInt(i + 1);
      const tmp = p[i] ?? 0;
      p[i] = p[j] ?? 0;
      p[j] = tmp;
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255] ?? 0;
  }

  /** Noise value in roughly [-1, 1]. */
  noise(x: number, y: number): number {
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    return (
      70 *
      (this.corner(ii + this.p(jj), x0, y0) +
        this.corner(ii + i1 + this.p(jj + j1), x1, y1) +
        this.corner(ii + 1 + this.p(jj + 1), x2, y2))
    );
  }

  /** Fractal sum of octaves, normalized to [0, 1]. */
  fbm(x: number, y: number, octaves: number): number {
    let sum = 0;
    let amp = 1;
    let freq = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.noise(x * freq, y * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return Math.min(1, Math.max(0, (sum / norm + 1) / 2));
  }

  private p(i: number): number {
    return this.perm[i] ?? 0;
  }

  private corner(hashIndex: number, x: number, y: number): number {
    const t = 0.5 - x * x - y * y;
    if (t < 0) return 0;
    const g = GRAD[this.p(hashIndex) & 7] ?? GRAD[0];
    const t2 = t * t;
    return t2 * t2 * (g[0] * x + g[1] * y);
  }
}
