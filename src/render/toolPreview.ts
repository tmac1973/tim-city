import { BufferAttribute, BufferGeometry, Color, Mesh, MeshBasicMaterial } from 'three';
import type { CityMirror } from './mirror';
import { PALETTE } from './palette';
import { HEIGHT_UNIT, splitsNwSe } from './units';

const LIFT = 0.09;
const OK = new Color(PALETTE.previewOk);
const BAD = new Color(PALETTE.previewBad);
const BLOCKED = new Color(PALETTE.previewBlocked);

/**
 * Translucent ghost over the tiles a tool would touch: green when it can be
 * built, red on the tiles that block it, amber when the whole action fails
 * for another reason (such as funds).
 */
export class ToolPreview {
  readonly mesh: Mesh;

  constructor(private readonly mirror: CityMirror) {
    this.mesh = new Mesh(
      new BufferGeometry(),
      new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.45, depthWrite: false }),
    );
    this.mesh.renderOrder = 3;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  show(affected: readonly number[], bad: readonly number[], ok: boolean): void {
    const m = this.mirror;
    const badSet = new Set(bad);
    // Blocking tiles can lie outside the drag (a building next to a cut), so draw both.
    const tiles = [...new Set([...affected, ...bad])];
    const positions = new Float32Array(tiles.length * 18);
    const colors = new Float32Array(tiles.length * 18);
    tiles.forEach((index, n) => {
      const x = index % m.size;
      const y = (index - x) / m.size;
      const color = ok ? OK : badSet.has(index) ? BAD : BLOCKED;
      const h = (cx: number, cy: number) => m.corner(cx, cy) * HEIGHT_UNIT + LIFT;
      const nw = [x, h(x, y), y];
      const ne = [x + 1, h(x + 1, y), y];
      const se = [x + 1, h(x + 1, y + 1), y + 1];
      const sw = [x, h(x, y + 1), y + 1];
      const verts = splitsNwSe(nw[1] ?? 0, ne[1] ?? 0, se[1] ?? 0, sw[1] ?? 0)
        ? [nw, sw, se, nw, se, ne]
        : [nw, sw, ne, ne, sw, se];
      verts.forEach((v, k) => {
        positions.set(v, n * 18 + k * 3);
        colors.set([color.r, color.g, color.b], n * 18 + k * 3);
      });
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    this.mesh.geometry.dispose();
    this.mesh.geometry = geometry;
    this.mesh.visible = tiles.length > 0;
  }

  clear(): void {
    this.mesh.visible = false;
  }
}
