import {
  type BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { CHUNK_SIZE } from '@/shared/constants';
import type { ActiveDisaster } from '@/shared/protocol';
import { TileFlag, TileKind } from '@/shared/tiles';
import { Kit } from './buildings/kit';
import { TriangleBuilder } from './geometry';
import { hash3 } from './hash';
import type { CityMirror } from './mirror';
import { HEIGHT_UNIT } from './units';

const MAX_FLAMES = 4000;
const RUBBLE = [new Color(0x8a8378), new Color(0x6f675d), new Color(0xa39a8c)];
const FLOOD = new Color(0x3d8fb5);
const RADIATION = new Color(0x7dff5a);

/** The Mirebeast: a hulking moss-green amphibian, built from kit parts. Faces +z. */
function mirebeastModel(): Group {
  const k = new Kit();
  const moss = 0x3f5f2f;
  const belly = 0x8a9a5b;
  k.block(0, 0, 1.3, 1.9, 0.55, 0.95, moss, 0x4d7038);
  k.block(0, 0.1, 1.0, 1.4, 0.45, 0.25, belly);
  k.block(0, 1.15, 0.85, 0.75, 1.05, 0.7, moss, 0x4d7038);
  k.block(0, 1.48, 0.7, 0.2, 1.08, 0.18, 0xe8e2c8);
  for (const x of [-0.24, 0.24]) k.block(x, 1.5, 0.14, 0.06, 1.5, 0.12, 0xffd23f);
  for (const [x, z] of [[-0.5, 0.6], [0.5, 0.6], [-0.5, -0.6], [0.5, -0.6]] as const) k.cylinder(x, z, 0.2, 0, 0.6, moss, 6);
  for (let i = 0; i < 5; i++) k.cylinder(0, 0.7 - i * 0.35, 0.12, 1.45, 0.35, 0x2c4422, 5, undefined, 0.01);
  k.block(0, -1.25, 0.5, 0.8, 0.6, 0.35, moss);
  k.block(0, -1.75, 0.3, 0.5, 0.55, 0.22, moss);
  const mesh = new Mesh(k.build(), new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }));
  mesh.castShadow = true;
  mesh.scale.setScalar(1.3);
  const group = new Group();
  group.add(mesh);
  return group;
}

/** A funnel of dust: an inverted, open cone. */
function tornadoModel(): Mesh {
  const geometry = new CylinderGeometry(1.6, 0.25, 5, 16, 6, true).translate(0, 2.5, 0);
  return new Mesh(geometry, new MeshBasicMaterial({ color: 0x8c8a82, transparent: true, opacity: 0.55, side: DoubleSide, depthWrite: false }));
}

/**
 * Functional disaster visuals: flames on burning tiles, water over flooded
 * ones, debris on rubble, a glow on radioactive ground, and models for the
 * tornado and the Mirebeast. Phase 18 replaces these with cinematic ones.
 */
export class DisasterLayer {
  readonly group = new Group();
  private readonly flames: InstancedMesh;
  private readonly flameSpots = new Map<number, Vector3[]>();
  private readonly hazards = new Map<number, { group: Group; geometries: BufferGeometry[] }>();
  private readonly solid = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
  private readonly sheet = new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false });
  private readonly movers = new Map<number, Group | Mesh>();
  private active: ActiveDisaster[] = [];
  private time = 0;

  constructor(private readonly mirror: CityMirror) {
    this.flames = new InstancedMesh(
      new ConeGeometry(0.28, 0.9, 6).translate(0, 0.45, 0),
      new MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.9 }),
      MAX_FLAMES,
    );
    this.flames.count = 0;
    this.flames.frustumCulled = false;
    this.group.add(this.flames);
  }

  rebuild(id: number): void {
    const m = this.mirror;
    const x0 = (id % m.chunksPerSide) * CHUNK_SIZE;
    const y0 = Math.floor(id / m.chunksPerSide) * CHUNK_SIZE;
    const spots: Vector3[] = [];
    const rubble = new TriangleBuilder();
    const sheets = new TriangleBuilder();
    for (let y = y0; y < y0 + CHUNK_SIZE; y++) {
      for (let x = x0; x < x0 + CHUNK_SIZE; x++) {
        const kind = m.tile(x, y);
        const flags = m.flag(x, y);
        const top = Math.max(m.corner(x, y), m.corner(x + 1, y), m.corner(x, y + 1), m.corner(x + 1, y + 1)) * HEIGHT_UNIT;
        if (flags & TileFlag.BURNING) spots.push(new Vector3(x + 0.5, top, y + 0.5));
        if (kind === TileKind.Rubble) {
          for (let k = 0; k < 3; k++) {
            const s = 0.18 + 0.2 * hash3(x, y, 70 + k);
            const px = x + 0.2 + 0.6 * hash3(x, y, 80 + k);
            const pz = y + 0.2 + 0.6 * hash3(x, y, 90 + k);
            rubble.box(px, m.heightAt(px, pz) + s / 3, pz, s, (s * 2) / 3, s, RUBBLE[k] ?? RUBBLE[0] ?? new Color());
          }
        }
        const sheetY = flags & TileFlag.FLOODED ? top + 0.12 : kind === TileKind.Radiation ? top + 0.05 : null;
        if (sheetY !== null) {
          const c = flags & TileFlag.FLOODED ? FLOOD : RADIATION;
          const v = (px: number, pz: number) => new Vector3(px, sheetY, pz);
          sheets.quad(v(x, y), v(x + 1, y), v(x + 1, y + 1), v(x, y + 1), new Vector3(0, 1, 0), c);
        }
      }
    }
    this.flameSpots.set(id, spots);

    const old = this.hazards.get(id);
    if (old) {
      for (const g of old.geometries) g.dispose();
      this.group.remove(old.group);
      this.hazards.delete(id);
    }
    if (rubble.empty && sheets.empty) return;
    const chunk = new Group();
    const geometries: BufferGeometry[] = [];
    if (!rubble.empty) {
      const geometry = rubble.build();
      geometries.push(geometry);
      const mesh = new Mesh(geometry, this.solid);
      mesh.castShadow = mesh.receiveShadow = true;
      chunk.add(mesh);
    }
    if (!sheets.empty) {
      const geometry = sheets.build();
      geometries.push(geometry);
      chunk.add(new Mesh(geometry, this.sheet));
    }
    this.hazards.set(id, { group: chunk, geometries });
    this.group.add(chunk);
  }

  setActive(disasters: ActiveDisaster[]): void {
    this.active = disasters;
    const live = new Set(disasters.map((d) => d.id));
    for (const [id, model] of this.movers) {
      if (!live.has(id)) {
        this.group.remove(model);
        this.movers.delete(id);
      }
    }
    for (const d of disasters) {
      if (this.movers.has(d.id) || (d.type !== 'tornado' && d.type !== 'mirebeast')) continue;
      const model = d.type === 'tornado' ? tornadoModel() : mirebeastModel();
      model.position.set(d.x + 0.5, this.mirror.heightAt(d.x + 0.5, d.y + 0.5), d.y + 0.5);
      this.movers.set(d.id, model);
      this.group.add(model);
    }
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.time;
    // Flames flicker in height and sway.
    let n = 0;
    const matrix = new Matrix4();
    const q = new Quaternion();
    for (const spots of this.flameSpots.values()) {
      for (const p of spots) {
        if (n >= MAX_FLAMES) break;
        const seed = p.x * 12.9898 + p.z * 78.233;
        const s = 0.8 + 0.35 * Math.sin(t * 9 + seed);
        q.setFromAxisAngle(new Vector3(0, 1, 0), seed);
        matrix.compose(p, q, new Vector3(1, s, 1));
        this.flames.setMatrixAt(n++, matrix);
      }
    }
    this.flames.count = n;
    this.flames.instanceMatrix.needsUpdate = true;

    // Movers glide to their sim position, which steps once per tick.
    const k = 1 - Math.exp(-6 * dt);
    for (const d of this.active) {
      const model = this.movers.get(d.id);
      if (!model) continue;
      const tx = d.x + 0.5;
      const tz = d.y + 0.5;
      model.position.x += (tx - model.position.x) * k;
      model.position.z += (tz - model.position.z) * k;
      const ground = this.mirror.heightAt(model.position.x, model.position.z);
      if (d.type === 'tornado') {
        model.position.y = ground;
        model.rotation.y += dt * 6;
      } else {
        model.position.y = Math.max(ground, 0) + Math.abs(Math.sin(t * 6)) * 0.15;
        model.rotation.y = [Math.PI, Math.PI / 2, 0, -Math.PI / 2][d.heading] ?? 0;
      }
    }
  }
}
