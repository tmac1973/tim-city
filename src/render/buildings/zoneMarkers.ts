import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  type Vector3,
} from 'three';
import { CHUNK_SIZE } from '@/shared/constants';
import { ZONE_SIZE, zoneOf, ZoneType } from '@/shared/tiles';
import type { CityMirror } from '../mirror';
import { HEIGHT_UNIT, splitsNwSe } from '../units';
import { DAYLIT } from '../atmosphere/uniforms';

export const ZONE_COLORS: Record<ZoneType, number> = {
  [ZoneType.R]: 0x5fd36b,
  [ZoneType.C]: 0x4da3ff,
  [ZoneType.I]: 0xf5c542,
};

const FILL_LIFT = 0.035;
const EDGE_LIFT = 0.05;
const DASH = 0.28;
const GAP = 0.16;

/** Tinted ground and a dashed outline on every zoned lot that has not been built on yet. */
export class LotLayer {
  readonly group = new Group();
  private readonly fill = new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.32, depthWrite: false });
  private readonly edge = new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 });
  private readonly chunks = new Map<number, { fill: Mesh; edge: LineSegments }>();

  constructor(private readonly mirror: CityMirror) {
    DAYLIT.add(this.fill);
    DAYLIT.add(this.edge);
  }

  rebuild(id: number): void {
    const old = this.chunks.get(id);
    if (old) {
      old.fill.geometry.dispose();
      old.edge.geometry.dispose();
      this.group.remove(old.fill, old.edge);
      this.chunks.delete(id);
    }
    const m = this.mirror;
    const x0 = (id % m.chunksPerSide) * CHUNK_SIZE;
    const y0 = Math.floor(id / m.chunksPerSide) * CHUNK_SIZE;
    const tris: number[] = [];
    const triColors: number[] = [];
    const lines: number[] = [];
    const lineColors: number[] = [];
    const color = new Color();
    const y = (cx: number, cz: number, lift: number) => m.corner(cx, cz) * HEIGHT_UNIT + lift;

    for (let ty = y0; ty < y0 + CHUNK_SIZE; ty++) {
      for (let tx = x0; tx < x0 + CHUNK_SIZE; tx++) {
        if (m.parts[ty * m.size + tx] !== 1) continue;
        const zone = zoneOf(m.tile(tx, ty));
        if (!zone || zone.density > 0) continue;
        color.set(ZONE_COLORS[zone.type]);
        for (let dy = 0; dy < ZONE_SIZE; dy++) {
          for (let dx = 0; dx < ZONE_SIZE; dx++) {
            const x = tx + dx, z = ty + dy;
            const nw = [x, y(x, z, FILL_LIFT), z], ne = [x + 1, y(x + 1, z, FILL_LIFT), z];
            const se = [x + 1, y(x + 1, z + 1, FILL_LIFT), z + 1], sw = [x, y(x, z + 1, FILL_LIFT), z + 1];
            const order = splitsNwSe(nw[1] ?? 0, ne[1] ?? 0, se[1] ?? 0, sw[1] ?? 0) ? [nw, sw, se, nw, se, ne] : [nw, sw, ne, ne, sw, se];
            for (const v of order) {
              tris.push(...v);
              triColors.push(color.r, color.g, color.b);
            }
          }
        }
        // Dashed outline along the lot's four edges.
        const corners: [number, number][] = [[tx, ty], [tx + ZONE_SIZE, ty], [tx + ZONE_SIZE, ty + ZONE_SIZE], [tx, ty + ZONE_SIZE]];
        for (let e = 0; e < 4; e++) {
          const [ax, az] = corners[e] ?? [0, 0];
          const [bx, bz] = corners[(e + 1) % 4] ?? [0, 0];
          for (let s = 0; s < ZONE_SIZE; s += DASH + GAP) {
            const t0 = s / ZONE_SIZE, t1 = Math.min(1, (s + DASH) / ZONE_SIZE);
            const px = (t: number) => ax + (bx - ax) * t, pz = (t: number) => az + (bz - az) * t;
            const h = (t: number) => m.heightAt(px(t), pz(t)) + EDGE_LIFT;
            lines.push(px(t0), h(t0), pz(t0), px(t1), h(t1), pz(t1));
            lineColors.push(color.r, color.g, color.b, color.r, color.g, color.b);
          }
        }
      }
    }
    if (tris.length === 0) return;

    const fillGeometry = new BufferGeometry();
    fillGeometry.setAttribute('position', new BufferAttribute(new Float32Array(tris), 3));
    fillGeometry.setAttribute('color', new BufferAttribute(new Float32Array(triColors), 3));
    const edgeGeometry = new BufferGeometry();
    edgeGeometry.setAttribute('position', new BufferAttribute(new Float32Array(lines), 3));
    edgeGeometry.setAttribute('color', new BufferAttribute(new Float32Array(lineColors), 3));
    const fill = new Mesh(fillGeometry, this.fill);
    fill.renderOrder = 2;
    const edge = new LineSegments(edgeGeometry, this.edge);
    this.chunks.set(id, { fill, edge });
    this.group.add(fill, edge);
  }
}

function boltTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d');
  if (g) {
    g.beginPath();
    g.arc(32, 32, 29, 0, Math.PI * 2);
    g.fillStyle = 'rgba(20, 24, 30, 0.85)';
    g.fill();
    g.beginPath();
    g.moveTo(36, 8);
    g.lineTo(18, 36);
    g.lineTo(30, 36);
    g.lineTo(26, 56);
    g.lineTo(46, 26);
    g.lineTo(34, 26);
    g.closePath();
    g.fillStyle = '#ffd23f';
    g.fill();
  }
  return new CanvasTexture(canvas);
}

/** Pulsing lightning icons above zones that have no power. */
export class BoltLayer {
  readonly points: Points;
  private readonly material: PointsMaterial;

  constructor() {
    this.material = new PointsMaterial({
      map: boltTexture(),
      size: 2.4,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    this.points = new Points(new BufferGeometry(), this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  setPositions(positions: readonly Vector3[]): void {
    const data = new Float32Array(positions.length * 3);
    positions.forEach((p, i) => {
      data.set([p.x, p.y, p.z], i * 3);
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(data, 3));
    this.points.geometry.dispose();
    this.points.geometry = geometry;
  }

  update(time: number): void {
    this.material.opacity = 0.65 + 0.35 * Math.sin(time * 5);
  }
}
