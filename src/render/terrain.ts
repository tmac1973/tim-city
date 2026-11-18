import { type BufferGeometry, Color, Group, type Material, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { CHUNK_SIZE, SEA_LEVEL } from '@/shared/constants';
import { TileKind } from '@/shared/tiles';
import { TriangleBuilder } from './geometry';
import { hash3 } from './hash';
import type { CityMirror } from './mirror';
import { PALETTE } from './palette';
import { HEIGHT_UNIT, SKIRT_BOTTOM_Y, splitsNwSe, WATER_Y } from './units';

/** Height of the overlay drape above the ground: clear of roads and rail. */
const DRAPE_LIFT = 0.14;

const C = {
  sandWet: new Color(PALETTE.sandWet),
  sand: new Color(PALETTE.sand),
  grassLight: new Color(PALETTE.grassLight),
  grassDark: new Color(PALETTE.grassDark),
  earth: new Color(PALETTE.earth),
  rock: new Color(PALETTE.rock),
  rockLight: new Color(PALETTE.rockLight),
  skirt: new Color(PALETTE.skirt),
  skirtDark: new Color(PALETTE.skirtDark),
};

/** Chunked, flat-shaded terrain meshes with a soil skirt around the map edge. */
export class TerrainLayer {
  readonly group = new Group();
  private readonly meshes = new Map<number, Mesh>();
  private readonly material = new MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.95,
    metalness: 0,
  });

  /** Overlay drapes: the same chunk surfaces, lifted above roads, drawn with the overlay material. */
  readonly drapes = new Group();
  private readonly drapeMeshes = new Map<number, Mesh>();

  constructor(
    private readonly mirror: CityMirror,
    private readonly drapeMaterial?: Material,
  ) {
    this.group.name = 'terrain';
    this.drapes.name = 'overlay-drape';
    this.drapes.visible = false;
  }

  rebuild(id: number): void {
    const old = this.meshes.get(id);
    if (old) {
      old.geometry.dispose();
      this.group.remove(old);
    }
    const geometry = this.buildChunk(id);
    const mesh = new Mesh(geometry, this.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.meshes.set(id, mesh);
    this.group.add(mesh);

    const oldDrape = this.drapeMeshes.get(id);
    if (oldDrape) this.drapes.remove(oldDrape);
    if (this.drapeMaterial) {
      const drape = new Mesh(geometry, this.drapeMaterial);
      drape.position.y = DRAPE_LIFT;
      drape.renderOrder = 5;
      this.drapeMeshes.set(id, drape);
      this.drapes.add(drape);
    }
  }

  private buildChunk(id: number): BufferGeometry {
    const m = this.mirror;
    const x0 = (id % m.chunksPerSide) * CHUNK_SIZE;
    const y0 = Math.floor(id / m.chunksPerSide) * CHUNK_SIZE;
    const out = new TriangleBuilder();
    const color = new Color();

    for (let y = y0; y < y0 + CHUNK_SIZE; y++) {
      for (let x = x0; x < x0 + CHUNK_SIZE; x++) {
        const hNw = m.corner(x, y);
        const hNe = m.corner(x + 1, y);
        const hSe = m.corner(x + 1, y + 1);
        const hSw = m.corner(x, y + 1);
        const nw = new Vector3(x, hNw * HEIGHT_UNIT, y);
        const ne = new Vector3(x + 1, hNe * HEIGHT_UNIT, y);
        const se = new Vector3(x + 1, hSe * HEIGHT_UNIT, y + 1);
        const sw = new Vector3(x, hSw * HEIGHT_UNIT, y + 1);

        this.tileColor(color, x, y, [hNw, hNe, hSe, hSw]);
        // Counter-clockwise seen from above (+Y), so faces point up.
        if (splitsNwSe(hNw, hNe, hSe, hSw)) {
          out.tri(nw, sw, se, color);
          out.tri(nw, se, ne, color);
        } else {
          out.tri(nw, sw, ne, color);
          out.tri(ne, sw, se, color);
        }
      }
    }
    this.addSkirt(out, x0, y0);
    return out.build();
  }

  private tileColor(out: Color, x: number, y: number, corners: readonly number[]): void {
    const avg = corners.reduce((a, b) => a + b, 0) / 4;
    const delta = Math.max(...corners) - Math.min(...corners);
    if (avg <= SEA_LEVEL - 0.75) out.copy(C.sandWet);
    else if (avg <= SEA_LEVEL + 0.5) out.copy(C.sand);
    else if (avg >= 13) out.copy(C.rockLight);
    else if (avg >= 10.5) out.copy(C.rock);
    else out.lerpColors(C.grassLight, C.grassDark, Math.min(1, (avg - SEA_LEVEL - 1) / 7));

    if (delta >= 2) out.lerp(C.earth, 0.25);
    if (this.mirror.tile(x, y) === TileKind.Tree) out.lerp(C.grassDark, 0.35);
    out.multiplyScalar(0.94 + 0.12 * hash3(x, y, 1));
  }

  /** Vertical soil walls on map-edge chunks so the map reads as a slab. */
  private addSkirt(out: TriangleBuilder, x0: number, y0: number): void {
    const m = this.mirror;
    const last = m.size;
    // Over water the wall rises to the water surface so the sea has a side.
    const topY = (cx: number, cy: number, tx: number, ty: number): number => {
      const tileWater = m.tile(Math.min(tx, last - 1), Math.min(ty, last - 1)) === TileKind.Water;
      return Math.max(m.corner(cx, cy) * HEIGHT_UNIT, tileWater ? WATER_Y : -Infinity);
    };
    const wall = (ax: number, az: number, ay: number, bx: number, bz: number, by: number, outward: Vector3) => {
      out.quad(
        new Vector3(ax, ay, az),
        new Vector3(bx, by, bz),
        new Vector3(bx, SKIRT_BOTTOM_Y, bz),
        new Vector3(ax, SKIRT_BOTTOM_Y, az),
        outward,
        C.skirt,
        C.skirtDark,
      );
    };

    for (let i = 0; i < CHUNK_SIZE; i++) {
      const x = x0 + i;
      const y = y0 + i;
      if (y0 === 0) wall(x, 0, topY(x, 0, x, 0), x + 1, 0, topY(x + 1, 0, x, 0), new Vector3(0, 0, -1));
      if (y0 + CHUNK_SIZE === last) {
        wall(x, last, topY(x, last, x, last - 1), x + 1, last, topY(x + 1, last, x, last - 1), new Vector3(0, 0, 1));
      }
      if (x0 === 0) wall(0, y, topY(0, y, 0, y), 0, y + 1, topY(0, y + 1, 0, y), new Vector3(-1, 0, 0));
      if (x0 + CHUNK_SIZE === last) {
        wall(last, y, topY(last, y, last - 1, y), last, y + 1, topY(last, y + 1, last - 1, y), new Vector3(1, 0, 0));
      }
    }
  }
}
