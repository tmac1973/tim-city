/** Hash a string into four 32-bit words (cyrb128) to seed sfc32. */
function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

export type RngState = [number, number, number, number];

/** Seeded sfc32 generator. Never use Math.random in the sim. */
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(readonly seed: string) {
    [this.a, this.b, this.c, this.d] = cyrb128(seed);
    // Discard early output, which is weakly mixed for similar seeds.
    for (let i = 0; i < 15; i++) this.next();
  }

  /** Next unsigned 32-bit integer. */
  next(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Float in [0, 1). */
  nextFloat(): number {
    return this.next() / 4294967296;
  }

  /** Integer in [0, n). */
  nextInt(n: number): number {
    return Math.floor(this.nextFloat() * n);
  }

  /**
   * Independent child stream. Derived from the seed and label only, so adding
   * a new system never shifts the random streams of existing systems.
   */
  fork(label: string): Rng {
    return new Rng(`${this.seed}/${label}`);
  }

  getState(): RngState {
    return [this.a, this.b, this.c, this.d];
  }

  setState([a, b, c, d]: RngState): void {
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
  }
}
