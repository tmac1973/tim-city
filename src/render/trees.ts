import {
  BufferAttribute,
  type BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CHUNK_SIZE } from '@/shared/constants';
import { TileKind } from '@/shared/tiles';
import { hash3 } from './hash';
import type { CityMirror } from './mirror';
import { PALETTE } from './palette';

/** A primitive, moved into place and painted one color. */
function part(geometry: BufferGeometry, y: number, color: number, scaleY = 1): BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  g.scale(1, scaleY, 1);
  g.translate(0, y, 0);
  const c = new Color(color);
  const colors = new Float32Array(g.getAttribute('position').count * 3);
  for (let i = 0; i < colors.length; i += 3) {
    colors[i] = c.r;
    colors[i + 1] = c.g;
    colors[i + 2] = c.b;
  }
  g.setAttribute('color', new BufferAttribute(colors, 3));
  g.deleteAttribute('uv');
  return g;
}

const merge = (parts: BufferGeometry[]): BufferGeometry => mergeGeometries(parts);

/** Three low-poly tree variants: pine, round broadleaf, tall poplar. */
function buildVariants(): BufferGeometry[] {
  const trunk = (h: number) => part(new CylinderGeometry(0.04, 0.06, h, 5), h / 2, PALETTE.trunk);
  return [
    merge([
      trunk(0.25),
      part(new ConeGeometry(0.3, 0.6, 6), 0.5, PALETTE.pine),
      part(new ConeGeometry(0.22, 0.45, 6), 0.8, PALETTE.pine),
    ]),
    merge([trunk(0.3), part(new IcosahedronGeometry(0.3, 0), 0.58, PALETTE.leaf)]),
    merge([trunk(0.2), part(new IcosahedronGeometry(0.18, 0), 0.6, PALETTE.leafLight, 2.4)]),
  ];
}

const FLOATS_PER_MATRIX = 16;

/** Instanced trees on Tree tiles; each chunk keeps its own matrix list. */
export class TreeLayer {
  readonly group = new Group();
  private readonly geometries = buildVariants();
  private readonly material = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
  private readonly meshes: InstancedMesh[] = [];
  /** chunk id → per-variant packed matrices */
  private readonly chunkMatrices = new Map<number, Float32Array[]>();
  private dirty = false;

  constructor(private readonly mirror: CityMirror) {
    this.group.name = 'trees';
    for (const geometry of this.geometries) this.meshes.push(this.makeMesh(geometry, 1024));
  }

  rebuild(id: number): void {
    const m = this.mirror;
    const x0 = (id % m.chunksPerSide) * CHUNK_SIZE;
    const y0 = Math.floor(id / m.chunksPerSide) * CHUNK_SIZE;
    const lists: number[][] = this.geometries.map(() => []);
    const matrix = new Matrix4();
    const position = new Vector3();
    const rotation = new Quaternion();
    const euler = new Euler();
    const scale = new Vector3();

    for (let y = y0; y < y0 + CHUNK_SIZE; y++) {
      for (let x = x0; x < x0 + CHUNK_SIZE; x++) {
        if (m.tile(x, y) !== TileKind.Tree) continue;
        const count = 2 + (hash3(x, y, 2) < 0.4 ? 1 : 0);
        const highland = m.corner(x, y) >= 8;
        for (let k = 0; k < count; k++) {
          const px = x + 0.15 + 0.7 * hash3(x, y, 10 + k);
          const pz = y + 0.15 + 0.7 * hash3(x, y, 20 + k);
          const pick = hash3(x, y, 30 + k);
          const variant = highland ? (pick < 0.75 ? 0 : 1) : pick < 0.3 ? 0 : pick < 0.8 ? 1 : 2;
          const s = 0.8 + 0.45 * hash3(x, y, 40 + k);
          position.set(px, m.heightAt(px, pz) - 0.03, pz);
          rotation.setFromEuler(euler.set(0, hash3(x, y, 50 + k) * Math.PI * 2, 0));
          scale.set(s, s * (0.9 + 0.2 * hash3(x, y, 60 + k)), s);
          matrix.compose(position, rotation, scale);
          lists[variant]?.push(...matrix.elements);
        }
      }
    }
    this.chunkMatrices.set(
      id,
      lists.map((l) => new Float32Array(l)),
    );
    this.dirty = true;
  }

  /** Repack every chunk's matrices into the instanced meshes, if anything changed. */
  flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.geometries.forEach((geometry, variant) => {
      let total = 0;
      for (const lists of this.chunkMatrices.values()) total += (lists[variant]?.length ?? 0) / FLOATS_PER_MATRIX;

      let mesh = this.meshes[variant];
      if (!mesh) return;
      if (total > mesh.instanceMatrix.count) {
        this.group.remove(mesh);
        mesh.dispose();
        let capacity = mesh.instanceMatrix.count;
        while (capacity < total) capacity *= 2;
        mesh = this.makeMesh(geometry, capacity);
        this.meshes[variant] = mesh;
      }
      const target = mesh.instanceMatrix.array as Float32Array;
      let offset = 0;
      for (const lists of this.chunkMatrices.values()) {
        const list = lists[variant];
        if (!list) continue;
        target.set(list, offset);
        offset += list.length;
      }
      mesh.count = total;
      mesh.instanceMatrix.needsUpdate = true;
    });
  }

  private makeMesh(geometry: BufferGeometry, capacity: number): InstancedMesh {
    const mesh = new InstancedMesh(geometry, this.material, capacity);
    mesh.count = 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Instances span the whole map; per-chunk culling arrives in phase 21.
    mesh.frustumCulled = false;
    this.group.add(mesh);
    return mesh;
  }
}
