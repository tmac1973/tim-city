import { BufferAttribute, BufferGeometry, type Color, type Matrix4, Vector3 } from 'three';

const tmp = new Vector3();

/** Collects flat-shaded triangles with one color per vertex. */
export class TriangleBuilder {
  readonly positions: number[] = [];
  readonly colors: number[] = [];

  get empty(): boolean {
    return this.positions.length === 0;
  }

  tri(a: Vector3, b: Vector3, c: Vector3, ca: Color, cb: Color = ca, cc: Color = ca): void {
    this.positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    this.colors.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b);
  }

  /** Quad a-b-c-d (in order around its edge), wound so its normal faces `outward`. */
  quad(a: Vector3, b: Vector3, c: Vector3, d: Vector3, outward: Vector3, top: Color, bottom: Color = top): void {
    const normal = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a));
    if (normal.dot(outward) < 0) {
      this.tri(a, c, b, top, bottom, top);
      this.tri(a, d, c, top, bottom, bottom);
    } else {
      this.tri(a, b, c, top, top, bottom);
      this.tri(a, c, d, top, bottom, bottom);
    }
  }

  /** Axis-aligned box from its center and full size. */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: Color): void {
    const x0 = cx - sx / 2, x1 = cx + sx / 2;
    const y0 = cy - sy / 2, y1 = cy + sy / 2;
    const z0 = cz - sz / 2, z1 = cz + sz / 2;
    const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
    this.quad(v(x0, y1, z0), v(x1, y1, z0), v(x1, y1, z1), v(x0, y1, z1), new Vector3(0, 1, 0), color);
    this.quad(v(x0, y0, z0), v(x1, y0, z0), v(x1, y1, z0), v(x0, y1, z0), new Vector3(0, 0, -1), color);
    this.quad(v(x0, y0, z1), v(x1, y0, z1), v(x1, y1, z1), v(x0, y1, z1), new Vector3(0, 0, 1), color);
    this.quad(v(x0, y0, z0), v(x0, y0, z1), v(x0, y1, z1), v(x0, y1, z0), new Vector3(-1, 0, 0), color);
    this.quad(v(x1, y0, z0), v(x1, y0, z1), v(x1, y1, z1), v(x1, y1, z0), new Vector3(1, 0, 0), color);
  }

  /** Append a non-indexed geometry, transformed, in one color. */
  geometry(source: BufferGeometry, matrix: Matrix4, color: Color): void {
    const pos = source.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      tmp.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      this.positions.push(tmp.x, tmp.y, tmp.z);
      this.colors.push(color.r, color.g, color.b);
    }
  }

  build(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(this.positions), 3));
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(this.colors), 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }
}
