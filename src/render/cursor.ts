import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineLoop } from 'three';
import type { CityMirror } from './mirror';
import { PALETTE } from './palette';
import { HEIGHT_UNIT } from './units';

const LIFT = 0.04;

/** Outline of the tile under the mouse, following the terrain's slope. */
export class TileCursor {
  readonly line: LineLoop;
  private readonly positions = new Float32Array(12);

  constructor(private readonly mirror: CityMirror) {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.line = new LineLoop(geometry, new LineBasicMaterial({ color: PALETTE.cursor, transparent: true, opacity: 0.9 }));
    this.line.renderOrder = 2;
    this.line.frustumCulled = false;
    this.line.visible = false;
  }

  show(tile: { x: number; y: number } | null): void {
    if (!tile) {
      this.line.visible = false;
      return;
    }
    const corners: [number, number][] = [
      [tile.x, tile.y],
      [tile.x + 1, tile.y],
      [tile.x + 1, tile.y + 1],
      [tile.x, tile.y + 1],
    ];
    corners.forEach(([x, z], i) => {
      this.positions[i * 3] = x;
      this.positions[i * 3 + 1] = this.mirror.corner(x, z) * HEIGHT_UNIT + LIFT;
      this.positions[i * 3 + 2] = z;
    });
    const attr = this.line.geometry.getAttribute('position');
    attr.needsUpdate = true;
    this.line.visible = true;
  }
}
