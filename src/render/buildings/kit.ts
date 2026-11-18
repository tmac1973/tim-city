import { BufferAttribute, BufferGeometry, Color, Vector3 } from 'three';

/** Height of one storey in world units (a tile is 1 × 1). */
export const FLOOR = 0.26;

const GLASS = new Color(0x2c3e50);
/** Curtain walls are mostly glass, so they use a lighter, bluer pane. */
const CURTAIN_GLASS = new Color(0x4a6f8f);
const DOOR = new Color(0x3b2f2a);

type ColorLike = Color | number;
const toColor = (c: ColorLike) => (c instanceof Color ? c : new Color(c));

export type WindowStyle = 'punched' | 'band' | 'curtain' | 'shop' | 'high';

/**
 * Builds one building's geometry from simple parts. Every triangle carries a
 * vertex color and a `glow` value: 1 for window glass (lit at night in a
 * later phase), 0 for everything else. Local space: the lot is centred on
 * the origin, ground at y = 0.
 */
export class Kit {
  private readonly pos: number[] = [];
  private readonly col: number[] = [];
  private readonly glow: number[] = [];
  /** Tallest point so far, for placing markers above the building. */
  top = 0;

  private tri(a: Vector3, b: Vector3, c: Vector3, color: Color, glow: number): void {
    this.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let i = 0; i < 3; i++) {
      this.col.push(color.r, color.g, color.b);
      this.glow.push(glow);
    }
    this.top = Math.max(this.top, a.y, b.y, c.y);
  }

  /** Triangle wound so its normal faces `outward`. */
  facet(a: Vector3, b: Vector3, c: Vector3, outward: Vector3, color: ColorLike): void {
    const n = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a));
    if (n.dot(outward) < 0) this.tri(a, c, b, toColor(color), 0);
    else this.tri(a, b, c, toColor(color), 0);
  }

  /** Quad a-b-c-d (around its edge), wound so its normal faces `outward`. */
  quad(a: Vector3, b: Vector3, c: Vector3, d: Vector3, outward: Vector3, color: ColorLike, glow = 0): void {
    const col = toColor(color);
    const n = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a));
    if (n.dot(outward) < 0) {
      this.tri(a, c, b, col, glow);
      this.tri(a, d, c, col, glow);
    } else {
      this.tri(a, b, c, col, glow);
      this.tri(a, c, d, col, glow);
    }
  }

  /** Axis-aligned box from (x0, y0, z0) to (x1, y1, z1); no bottom face. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: ColorLike, roof?: ColorLike): void {
    const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
    this.quad(v(x0, y1, z0), v(x1, y1, z0), v(x1, y1, z1), v(x0, y1, z1), new Vector3(0, 1, 0), roof ?? color);
    this.quad(v(x0, y0, z0), v(x1, y0, z0), v(x1, y1, z0), v(x0, y1, z0), new Vector3(0, 0, -1), color);
    this.quad(v(x0, y0, z1), v(x1, y0, z1), v(x1, y1, z1), v(x0, y1, z1), new Vector3(0, 0, 1), color);
    this.quad(v(x0, y0, z0), v(x0, y0, z1), v(x0, y1, z1), v(x0, y1, z0), new Vector3(-1, 0, 0), color);
    this.quad(v(x1, y0, z0), v(x1, y0, z1), v(x1, y1, z1), v(x1, y1, z0), new Vector3(1, 0, 0), color);
  }

  /** Box centred on (cx, cz) with size (w, d), from y0 up h. */
  block(cx: number, cz: number, w: number, d: number, y0: number, h: number, color: ColorLike, roof?: ColorLike): void {
    this.box(cx - w / 2, y0, cz - d / 2, cx + w / 2, y0 + h, cz + d / 2, color, roof);
  }

  /** Pitched roof over a w × d rectangle at height y, ridge along X or Z. */
  gable(cx: number, cz: number, w: number, d: number, y: number, h: number, color: ColorLike, alongX: boolean, gableColor?: ColorLike): void {
    const o = 0.06;
    const x0 = cx - w / 2 - o, x1 = cx + w / 2 + o, z0 = cz - d / 2 - o, z1 = cz + d / 2 + o;
    const v = (x: number, yy: number, z: number) => new Vector3(x, yy, z);
    const end = gableColor ?? color;
    if (alongX) {
      const r0 = v(x0, y + h, cz), r1 = v(x1, y + h, cz);
      this.quad(v(x0, y, z0), v(x1, y, z0), r1, r0, new Vector3(0, 1, -1), color);
      this.quad(v(x0, y, z1), v(x1, y, z1), r1, r0, new Vector3(0, 1, 1), color);
      this.facet(v(x0 + o, y, z0 + o), v(x0 + o, y, z1 - o), v(x0 + o, y + h, cz), new Vector3(-1, 0, 0), end);
      this.facet(v(x1 - o, y, z1 - o), v(x1 - o, y, z0 + o), v(x1 - o, y + h, cz), new Vector3(1, 0, 0), end);
    } else {
      const r0 = v(cx, y + h, z0), r1 = v(cx, y + h, z1);
      this.quad(v(x0, y, z0), v(x0, y, z1), r1, r0, new Vector3(-1, 1, 0), color);
      this.quad(v(x1, y, z0), v(x1, y, z1), r1, r0, new Vector3(1, 1, 0), color);
      this.facet(v(x1 - o, y, z0 + o), v(x0 + o, y, z0 + o), v(cx, y + h, z0 + o), new Vector3(0, 0, -1), end);
      this.facet(v(x0 + o, y, z1 - o), v(x1 - o, y, z1 - o), v(cx, y + h, z1 - o), new Vector3(0, 0, 1), end);
    }
  }

  /** Four-sided roof rising to a smaller flat top. */
  hip(cx: number, cz: number, w: number, d: number, y: number, h: number, color: ColorLike, inset = 0.35): void {
    const v = (x: number, yy: number, z: number) => new Vector3(x, yy, z);
    const x0 = cx - w / 2 - 0.05, x1 = cx + w / 2 + 0.05, z0 = cz - d / 2 - 0.05, z1 = cz + d / 2 + 0.05;
    const ix = Math.min(inset, w / 2 - 0.01), iz = Math.min(inset, d / 2 - 0.01);
    const t0 = v(x0 + ix, y + h, z0 + iz), t1 = v(x1 - ix, y + h, z0 + iz), t2 = v(x1 - ix, y + h, z1 - iz), t3 = v(x0 + ix, y + h, z1 - iz);
    this.quad(v(x0, y, z0), v(x1, y, z0), t1, t0, new Vector3(0, 1, -1), color);
    this.quad(v(x1, y, z0), v(x1, y, z1), t2, t1, new Vector3(1, 1, 0), color);
    this.quad(v(x1, y, z1), v(x0, y, z1), t3, t2, new Vector3(0, 1, 1), color);
    this.quad(v(x0, y, z1), v(x0, y, z0), t0, t3, new Vector3(-1, 1, 0), color);
    this.quad(t0, t1, t2, t3, new Vector3(0, 1, 0), color);
  }

  /** Low wall around a flat roof. */
  parapet(cx: number, cz: number, w: number, d: number, y: number, color: ColorLike): void {
    const t = 0.05, h = 0.07;
    this.block(cx, cz - d / 2 + t / 2, w, t, y, h, color);
    this.block(cx, cz + d / 2 - t / 2, w, t, y, h, color);
    this.block(cx - w / 2 + t / 2, cz, t, d - 2 * t, y, h, color);
    this.block(cx + w / 2 - t / 2, cz, t, d - 2 * t, y, h, color);
  }

  /** Upright cylinder (stack, tank, silo) with `sides` faces and a flat cap. */
  cylinder(cx: number, cz: number, r: number, y0: number, h: number, color: ColorLike, sides = 8, capColor?: ColorLike, rTop = r): void {
    const ring = (rr: number, y: number) =>
      Array.from({ length: sides }, (_, i) => {
        const a = (i / sides) * Math.PI * 2;
        return new Vector3(cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr);
      });
    const lo = ring(r, y0), hi = ring(rTop, y0 + h);
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      const a = lo[i] ?? new Vector3(), b = lo[j] ?? new Vector3(), c = hi[j] ?? new Vector3(), d = hi[i] ?? new Vector3();
      const out = new Vector3((a.x + b.x) / 2 - cx, 0, (a.z + b.z) / 2 - cz);
      this.quad(a, b, c, d, out, color);
    }
    const centre = new Vector3(cx, y0 + h, cz);
    const up = new Vector3(0, 1, 0);
    for (let i = 0; i < sides; i++) {
      this.facet(centre, hi[i] ?? centre, hi[(i + 1) % sides] ?? centre, up, capColor ?? color);
    }
  }

  /** Cooling-tower style surface of revolution through (radius, height) profile points. */
  lathe(cx: number, cz: number, y0: number, profile: readonly [number, number][], color: ColorLike, sides = 14): void {
    for (let p = 0; p + 1 < profile.length; p++) {
      const [r0, h0] = profile[p] ?? [0, 0];
      const [r1, h1] = profile[p + 1] ?? [0, 0];
      for (let i = 0; i < sides; i++) {
        const a0 = (i / sides) * Math.PI * 2, a1 = ((i + 1) / sides) * Math.PI * 2;
        const pt = (r: number, a: number, h: number) => new Vector3(cx + Math.cos(a) * r, y0 + h, cz + Math.sin(a) * r);
        const mid = (a0 + a1) / 2;
        this.quad(pt(r0, a0, h0), pt(r0, a1, h0), pt(r1, a1, h1), pt(r1, a0, h1), new Vector3(Math.cos(mid), 0, Math.sin(mid)), color);
      }
    }
  }

  /**
   * Windows on all four sides of a box, as slightly proud dark quads.
   * `fromFloor` skips lower storeys (for shopfronts or a lobby).
   */
  windows(cx: number, cz: number, w: number, d: number, y0: number, floors: number, style: WindowStyle, fromFloor = 0): void {
    const bay = style === 'curtain' || style === 'band' ? Math.max(w, d) : 0.34;
    const faces: [Vector3, Vector3, number][] = [
      [new Vector3(cx - w / 2, 0, cz - d / 2), new Vector3(1, 0, 0), w],
      [new Vector3(cx + w / 2, 0, cz + d / 2), new Vector3(-1, 0, 0), w],
      [new Vector3(cx - w / 2, 0, cz + d / 2), new Vector3(0, 0, -1), d],
      [new Vector3(cx + w / 2, 0, cz - d / 2), new Vector3(0, 0, 1), d],
    ];
    const proud = 0.008;
    for (const [origin, along, length] of faces) {
      const normal = new Vector3(along.z, 0, -along.x);
      const bays = Math.max(1, Math.round(length / bay));
      const bw = length / bays;
      const [fw, fh, fy] =
        style === 'punched' ? [0.5, 0.48, 0.3] : style === 'band' ? [0.94, 0.42, 0.32] : style === 'curtain' ? [0.97, 0.86, 0.08] : style === 'shop' ? [0.86, 0.62, 0.12] : [0.7, 0.22, 0.66];
      for (let f = fromFloor; f < floors; f++) {
        const yb = y0 + f * FLOOR + fy * FLOOR;
        const yt = yb + fh * FLOOR;
        for (let b = 0; b < bays; b++) {
          const s0 = b * bw + (bw * (1 - fw)) / 2;
          const s1 = s0 + bw * fw;
          const p = (s: number, y: number) =>
            new Vector3(origin.x + along.x * s + normal.x * proud, y, origin.z + along.z * s + normal.z * proud);
          this.quad(p(s0, yb), p(s1, yb), p(s1, yt), p(s0, yt), normal, style === 'curtain' ? CURTAIN_GLASS : GLASS, 1);
        }
      }
    }
  }

  /** A door on the face of a box at z = cz + d/2 (the "front"). */
  door(cx: number, frontZ: number, y0: number, width = 0.16): void {
    const v = (x: number, y: number) => new Vector3(x, y, frontZ + 0.009);
    this.quad(v(cx - width / 2, y0), v(cx + width / 2, y0), v(cx + width / 2, y0 + 0.2), v(cx - width / 2, y0 + 0.2), new Vector3(0, 0, 1), DOOR);
  }

  /** A small tree: trunk and a cone or a rounded crown. */
  tree(cx: number, cz: number, h: number, crown: ColorLike, pointed: boolean): void {
    this.cylinder(cx, cz, 0.035, 0, h * 0.35, 0x7a5233, 5);
    if (pointed) this.cylinder(cx, cz, h * 0.28, h * 0.3, h * 0.7, crown, 6, undefined, 0.01);
    else this.cylinder(cx, cz, h * 0.26, h * 0.3, h * 0.55, crown, 7, undefined, h * 0.12);
  }

  /** Flat slab lying on the ground (paving, parking, yard). */
  ground(x0: number, z0: number, x1: number, z1: number, color: ColorLike, y = 0.012): void {
    const v = (x: number, z: number) => new Vector3(x, y, z);
    this.quad(v(x0, z0), v(x1, z0), v(x1, z1), v(x0, z1), new Vector3(0, 1, 0), color);
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute('glow', new BufferAttribute(new Float32Array(this.glow), 1));
    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}
