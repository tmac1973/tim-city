import {
  Bone,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  MeshStandardMaterial,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  Vector3,
} from 'three';
import type { CityMirror } from '../mirror';
import type { Particles } from './particles';

/** Bone ids. Rigid skinning: every box follows exactly one bone. */
const B = {
  root: 0,
  chest: 1,
  head: 2,
  jaw: 3,
  tail1: 4,
  tail2: 5,
  tail3: 6,
  flUpper: 7,
  flLower: 8,
  frUpper: 9,
  frLower: 10,
  blUpper: 11,
  blLower: 12,
  brUpper: 13,
  brLower: 14,
} as const;

/** Each bone's parent and its bind position relative to that parent (model faces +z). */
const BONES: [number, number, number, number][] = [
  [-1, 0, 1.25, 0],
  [B.root, 0, 0.15, 0.8],
  [B.chest, 0, 0.55, 0.75],
  [B.head, 0, -0.18, 0.3],
  [B.root, 0, 0, -0.85],
  [B.tail1, 0, -0.05, -0.75],
  [B.tail2, 0, -0.05, -0.65],
  [B.chest, -0.6, -0.2, 0.1],
  [B.flUpper, 0, -0.55, 0.05],
  [B.chest, 0.6, -0.2, 0.1],
  [B.frUpper, 0, -0.55, 0.05],
  [B.root, -0.6, -0.15, -0.35],
  [B.blUpper, 0, -0.55, -0.05],
  [B.root, 0.6, -0.15, -0.35],
  [B.brUpper, 0, -0.55, -0.05],
];

const MOSS = new Color(0x3f5f2f);
const MOSS_LIGHT = new Color(0x557a3c);
const BELLY = new Color(0x8a9a5b);
const SPINE = new Color(0x2c4422);
const TEETH = new Color(0xe8e2c8);
const EYE = new Color(4, 3, 0.6);

/** Build the skinned mesh: boxes in model space, each bound to one bone. */
function build(): { mesh: SkinnedMesh; bones: Bone[] } {
  const bones = BONES.map(() => new Bone());
  const world: Vector3[] = [];
  BONES.forEach(([parent, x, y, z], i) => {
    const bone = bones[i];
    if (!bone) return;
    bone.position.set(x, y, z);
    const p = new Vector3(x, y, z);
    if (parent >= 0) {
      bones[parent]?.add(bone);
      p.add(world[parent] ?? new Vector3());
    }
    world.push(p);
  });

  const pos: number[] = [];
  const col: number[] = [];
  const skin: number[] = [];
  /** A box centred on (cx, cy, cz) relative to a bone's bind position. */
  const box = (bone: number, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, c: Color) => {
    const o = world[bone] ?? new Vector3();
    const x0 = o.x + cx - sx / 2, x1 = o.x + cx + sx / 2;
    const y0 = o.y + cy - sy / 2, y1 = o.y + cy + sy / 2;
    const z0 = o.z + cz - sz / 2, z1 = o.z + cz + sz / 2;
    const faces = [
      [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]],
      [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
      [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
      [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]],
      [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]],
      [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]],
    ];
    for (const [a, b, c2, d] of faces) {
      for (const v of [a, b, c2, a, c2, d]) {
        pos.push(...(v ?? [0, 0, 0]));
        col.push(c.r, c.g, c.b);
        skin.push(bone, 0, 0, 0);
      }
    }
  };

  box(B.root, 0, 0, 0, 1.3, 0.95, 1.5, MOSS);
  box(B.root, 0, -0.38, 0.1, 1.0, 0.25, 1.2, BELLY);
  box(B.chest, 0, 0.1, 0.1, 1.25, 1.05, 1.0, MOSS_LIGHT);
  box(B.chest, 0, -0.35, 0.2, 0.95, 0.3, 0.8, BELLY);
  box(B.head, 0, 0.05, 0.15, 0.8, 0.55, 0.85, MOSS);
  box(B.head, 0, -0.02, 0.62, 0.62, 0.08, 0.12, TEETH);
  for (const x of [-0.24, 0.24]) box(B.head, x, 0.2, 0.55, 0.13, 0.07, 0.06, EYE);
  box(B.jaw, 0, -0.06, 0.2, 0.7, 0.18, 0.7, MOSS_LIGHT);
  box(B.jaw, 0, 0.05, 0.5, 0.58, 0.06, 0.1, TEETH);
  box(B.tail1, 0, 0, -0.35, 0.65, 0.55, 0.8, MOSS);
  box(B.tail2, 0, 0, -0.3, 0.45, 0.4, 0.7, MOSS);
  box(B.tail3, 0, 0, -0.3, 0.28, 0.26, 0.7, MOSS_LIGHT);
  // Ridge of plates down the back.
  for (const [bone, z, h] of [[B.chest, 0.15, 0.4], [B.chest, -0.25, 0.45], [B.root, 0.35, 0.42], [B.root, -0.15, 0.38], [B.root, -0.6, 0.3], [B.tail1, -0.3, 0.26], [B.tail2, -0.3, 0.18]] as const) {
    box(bone, 0, (bone === B.chest ? 0.6 : bone === B.root ? 0.47 : 0.25) + h / 2, z, 0.12, h, 0.3, SPINE);
  }
  for (const [upper, lower] of [[B.flUpper, B.flLower], [B.frUpper, B.frLower], [B.blUpper, B.blLower], [B.brUpper, B.brLower]] as const) {
    box(upper, 0, -0.25, 0, 0.42, 0.62, 0.45, MOSS);
    box(lower, 0, -0.3, 0.02, 0.34, 0.6, 0.38, MOSS_LIGHT);
    box(lower, 0, -0.62, 0.1, 0.4, 0.1, 0.55, SPINE);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute(skin, 4));
  geometry.setAttribute('skinWeight', new BufferAttribute(new Float32Array(skin.map((_, k) => (k % 4 === 0 ? 1 : 0))), 4));
  geometry.computeVertexNormals();
  const material = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 });
  const mesh = new SkinnedMesh(geometry, material);
  const root = bones[B.root];
  if (root) mesh.add(root);
  mesh.bind(new Skeleton(bones));
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  return { mesh, bones };
}

const LEGS = [
  [B.flUpper, B.flLower, 0],
  [B.brUpper, B.brLower, 0],
  [B.frUpper, B.frLower, Math.PI],
  [B.blUpper, B.blLower, Math.PI],
] as const;

/**
 * The Mirebeast: rises out of the water, then lumbers along the sim's path
 * with a four-legged walk, a swinging tail and a roar now and then. Each
 * footfall kicks up dust.
 */
export class MirebeastFx {
  readonly group = new Group();
  private readonly bones: Bone[];
  private readonly mesh: SkinnedMesh;
  private time = 0;
  private phase = 0;
  private yaw = 0;
  private roar = 0;
  private nextRoar = 1.5;
  private lastSin = [0, 0, 0, 0];
  ending = false;
  private sink = 0;

  constructor(
    private readonly mirror: CityMirror,
    private readonly particles: Particles,
    x: number,
    z: number,
    heading: number,
    private readonly emit: (e: { type: 'roar' | 'footfall'; x: number; y: number; z: number }) => void = () => undefined,
  ) {
    const { mesh, bones } = build();
    this.mesh = mesh;
    this.bones = bones;
    this.group.add(mesh);
    this.group.scale.setScalar(1.35);
    this.yaw = [Math.PI, Math.PI / 2, 0, -Math.PI / 2][heading] ?? 0;
    this.group.position.set(x, mirror.heightAt(x, z) - 3, z);
  }

  update(dt: number, tx: number, tz: number, heading: number): boolean {
    this.time += dt;
    const p = this.group.position;
    const k = 1 - Math.exp(-4 * dt);
    const dx = tx - p.x;
    const dz = tz - p.z;
    p.x += dx * k;
    p.z += dz * k;
    const moving = Math.hypot(dx, dz) > 0.05;
    const ground = Math.max(this.mirror.heightAt(p.x, p.z), 0.9);
    // Emerging: rise out of the water over the first seconds, dripping.
    const emerge = Math.min(1, this.time / 2.5);
    if (this.ending) this.sink = Math.min(1, this.sink + dt / 2);
    p.y = ground - 3 * (1 - emerge) - 3 * this.sink;
    if (emerge < 1 || this.sink > 0) this.drip();

    const want = [Math.PI, Math.PI / 2, 0, -Math.PI / 2][heading] ?? this.yaw;
    let turn = want - this.yaw;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    this.yaw += turn * Math.min(1, dt * 3);
    this.group.rotation.y = this.yaw;

    this.phase += dt * (moving ? 4.2 : 1.2);
    const bone = (i: number) => this.bones[i];
    for (const [li, [upper, lower, offset]] of LEGS.entries()) {
      const s = Math.sin(this.phase + offset);
      const up = bone(upper);
      const low = bone(lower);
      if (up) up.rotation.x = s * (moving ? 0.5 : 0.08);
      if (low) low.rotation.x = Math.max(0, -s) * (moving ? 0.7 : 0.1);
      // A foot comes down: dust.
      if (moving && this.lastSin[li] !== undefined && (this.lastSin[li] ?? 0) > 0 && s <= 0 && emerge >= 1) this.footfall(li);
      this.lastSin[li] = s;
    }
    const root = bone(B.root);
    if (root) {
      root.position.y = 1.25 + Math.abs(Math.sin(this.phase)) * 0.06;
      root.rotation.z = Math.sin(this.phase) * 0.04;
    }
    [B.tail1, B.tail2, B.tail3].forEach((t, i) => {
      const b = bone(t);
      if (b) b.rotation.y = Math.sin(this.phase * 0.5 - i * 0.7) * 0.28;
    });

    // Roar every few seconds: head back, jaw wide.
    this.nextRoar -= dt;
    if (this.nextRoar <= 0 && emerge >= 1) {
      this.roar = 1.6;
      this.nextRoar = 6 + Math.random() * 5;
      const p = this.group.position;
      this.emit({ type: 'roar', x: p.x, y: p.y + 2, z: p.z });
    }
    this.roar = Math.max(0, this.roar - dt);
    const r = this.roar > 0 ? Math.sin(Math.min(1, (1.6 - this.roar) / 1.6) * Math.PI) : 0;
    const head = bone(B.head);
    const jaw = bone(B.jaw);
    if (head) head.rotation.x = -0.45 * r + Math.sin(this.phase * 0.5) * 0.05;
    if (jaw) jaw.rotation.x = 0.7 * r;
    return this.ending && this.sink >= 1;
  }

  private footfall(leg: number): void {
    const side = leg === 0 || leg === 3 ? -1 : 1;
    const front = leg < 2 ? (leg === 0 ? 0.9 : -0.35) : leg === 2 ? 0.9 : -0.35;
    const s = this.group.scale.x;
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    const lx = side * 0.6 * s;
    const lz = front * s;
    const x = this.group.position.x + lx * cos + lz * sin;
    const z = this.group.position.z - lx * sin + lz * cos;
    const y = this.mirror.heightAt(x, z);
    this.emit({ type: 'footfall', x, y, z });
    for (let n = 0; n < 10; n++) {
      const a = Math.random() * Math.PI * 2;
      this.particles.smoke.emit({
        x,
        y: y + 0.05,
        z,
        vx: Math.cos(a) * 1.4,
        vy: 0.3 + Math.random() * 0.4,
        vz: Math.sin(a) * 1.4,
        drag: 2,
        life: 1.2 + Math.random() * 0.6,
        size0: 0.3,
        size1: 1.1,
        c0: [0.55, 0.5, 0.42, 0.6],
        c1: [0.6, 0.56, 0.5, 0],
      });
    }
  }

  private drip(): void {
    const p = this.group.position;
    for (let n = 0; n < 4; n++) {
      this.particles.smoke.emit({
        x: p.x + (Math.random() - 0.5) * 2,
        y: p.y + 1.5 + Math.random() * 1.5,
        z: p.z + (Math.random() - 0.5) * 2,
        vy: -0.5,
        gravity: -6,
        life: 0.7,
        size0: 0.08,
        size1: 0.05,
        c0: [0.55, 0.75, 0.85, 0.9],
        c1: [0.55, 0.75, 0.85, 0.3],
      });
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshStandardMaterial).dispose();
    this.mesh.skeleton.dispose();
  }
}
