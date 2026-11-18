import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from 'three';
import { CHUNK_SIZE } from '@/shared/constants';
import { TileFlag, TileKind } from '@/shared/tiles';
import { ATMOSPHERE } from '../atmosphere/uniforms';
import { TriangleBuilder } from '../geometry';
import { hash3 } from '../hash';
import type { CityMirror } from '../mirror';
import { Rate, tileTop } from './common';
import type { Particles } from './particles';

const RUBBLE = [new Color(0x8a8378), new Color(0x6f675d), new Color(0xa39a8c)];
const MAX_FIRES = 4000;
/** Flame particles per second across all fires at High quality; per-tile rates shrink to fit. */
const FLAME_BUDGET = 2400;
/** Scales particle emission with the graphics quality (Low 0.25 … Ultra 1.5). */
export const FX_SCALE = { value: 1 };

const sheetVertex = /* glsl */ `
  uniform float uTime;
  attribute vec2 aTimes; // when the tile flooded, when it drained (0: still wet)
  varying float vLevel;
  varying vec3 vWorld;
  void main() {
    float rise = smoothstep(aTimes.x, aTimes.x + 2.5, uTime);
    float sink = aTimes.y > 0.0 ? 1.0 - smoothstep(aTimes.y, aTimes.y + 2.5, uTime) : 1.0;
    vLevel = rise * sink;
    vec3 p = position;
    p.y -= 0.35 * (1.0 - vLevel);
    vWorld = p;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const floodFragment = /* glsl */ `
  uniform float uTime;
  uniform float uLight;
  varying float vLevel;
  varying vec3 vWorld;
  void main() {
    vec2 p = vWorld.xz;
    float ripple = sin(p.x * 3.1 + uTime * 1.7) * sin(p.y * 2.7 - uTime * 1.3) * 0.5 + 0.5;
    vec3 murky = mix(vec3(0.2, 0.38, 0.45), vec3(0.32, 0.5, 0.55), ripple);
    gl_FragColor = vec4(murky * uLight + ripple * 0.05, 0.78 * vLevel);
  }
`;

const radiationFragment = /* glsl */ `
  uniform float uTime;
  varying float vLevel;
  varying vec3 vWorld;
  void main() {
    float pulse = 0.55 + 0.45 * sin(uTime * 2.2 + (vWorld.x + vWorld.z) * 0.35);
    // HDR green so bloom carries it at night.
    gl_FragColor = vec4(vec3(0.3, 1.1, 0.2) * pulse, 0.26);
  }
`;

const fireGlowVertex = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying float vFlicker;
  void main() {
    vUv = uv;
    vec3 origin = instanceMatrix[3].xyz;
    vFlicker = 0.75 + 0.25 * sin(uTime * 13.0 + origin.x * 7.1) * sin(uTime * 7.3 + origin.z * 5.3);
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;
const fireGlowFragment = /* glsl */ `
  varying vec2 vUv;
  varying float vFlicker;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.0, d);
    gl_FragColor = vec4(vec3(1.0, 0.45, 0.12) * a * a * 0.9 * vFlicker, 1.0);
  }
`;

interface ChunkState {
  kinds: Uint16Array;
  flags: Uint8Array;
  fires: Vector3[];
  radiation: number[];
  group: Group;
  geometries: BufferGeometry[];
}

/**
 * Effects that live on tiles: rubble heaps (with a dust burst when a
 * building falls), fire (flames, smoke, embers and a glow on the ground),
 * flood water that rises and drains, and glowing radioactive ground.
 */
export class TileFx {
  readonly group = new Group();
  private readonly chunks = new Map<number, ChunkState>();
  private readonly solid = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
  private readonly floodMaterial: ShaderMaterial;
  private readonly radiationMaterial: ShaderMaterial;
  private readonly fireGlow: InstancedMesh;
  private readonly fireGlowMaterial: ShaderMaterial;
  /** Tile → [flooded at, drained at]; drained 0 while still wet. */
  private readonly floodTimes = new Map<number, [number, number]>();
  private readonly flameRate = new Rate();
  private readonly smokeRate = new Rate();
  private readonly emberRate = new Rate();
  private readonly moteRate = new Rate();
  private time = 0;
  private cleanupClock = 0;
  private glowDirty = true;
  /** Count of tiles burned out into rubble since the last read (for the camera shake and audio). */
  collapses: [number, number][] = [];

  constructor(
    private readonly mirror: CityMirror,
    private readonly particles: Particles,
  ) {
    const uniforms = () => ({ uTime: { value: 0 }, uLight: ATMOSPHERE.uLight });
    this.floodMaterial = new ShaderMaterial({ vertexShader: sheetVertex, fragmentShader: floodFragment, uniforms: uniforms(), transparent: true, depthWrite: false });
    this.radiationMaterial = new ShaderMaterial({
      vertexShader: sheetVertex,
      fragmentShader: radiationFragment,
      uniforms: uniforms(),
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.fireGlowMaterial = new ShaderMaterial({
      vertexShader: fireGlowVertex,
      fragmentShader: fireGlowFragment,
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.fireGlow = new InstancedMesh(new PlaneGeometry(2.4, 2.4).rotateX(-Math.PI / 2), this.fireGlowMaterial, MAX_FIRES);
    this.fireGlow.count = 0;
    this.fireGlow.frustumCulled = false;
    this.group.add(this.fireGlow);
    this.group.name = 'tile-fx';
  }

  rebuild(id: number): void {
    const m = this.mirror;
    const x0 = (id % m.chunksPerSide) * CHUNK_SIZE;
    const y0 = Math.floor(id / m.chunksPerSide) * CHUNK_SIZE;
    const before = this.chunks.get(id);
    const kinds = new Uint16Array(CHUNK_SIZE * CHUNK_SIZE);
    const flags = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
    const fires: Vector3[] = [];
    const radiation: number[] = [];
    const rubble = new TriangleBuilder();
    const flood: number[] = [];
    const floodTimes: number[] = [];
    const glow: number[] = [];

    for (let y = y0; y < y0 + CHUNK_SIZE; y++) {
      for (let x = x0; x < x0 + CHUNK_SIZE; x++) {
        const local = (y - y0) * CHUNK_SIZE + (x - x0);
        const i = y * m.size + x;
        const kind = m.tile(x, y);
        const flag = m.flag(x, y);
        kinds[local] = kind;
        flags[local] = flag;
        const top = tileTop(m, x, y);
        if (flag & TileFlag.BURNING) fires.push(new Vector3(x + 0.5, top, y + 0.5));
        if (kind === TileKind.Rubble) {
          for (let k = 0; k < 3; k++) {
            const s = 0.18 + 0.2 * hash3(x, y, 70 + k);
            const px = x + 0.2 + 0.6 * hash3(x, y, 80 + k);
            const pz = y + 0.2 + 0.6 * hash3(x, y, 90 + k);
            rubble.box(px, m.heightAt(px, pz) + s / 3, pz, s, (s * 2) / 3, s, RUBBLE[k] ?? RUBBLE[0] ?? new Color());
          }
          // A building just came down: a burst of dust.
          if (before && before.kinds[local] !== TileKind.Rubble) {
            this.dust(x + 0.5, top, y + 0.5, 14);
            this.collapses.push([x, y]);
          }
        }
        // Flood water rises where the flag appears and drains where it goes.
        const wet = (flag & TileFlag.FLOODED) !== 0;
        let times = this.floodTimes.get(i);
        if (wet && (!times || times[1] > 0)) {
          times = [before ? this.time : -10, 0];
          this.floodTimes.set(i, times);
        } else if (!wet && times && times[1] === 0) {
          times[1] = this.time;
        }
        if (times) {
          const sy = top + 0.12;
          // Wound counter-clockwise seen from above, so the face points up.
          flood.push(x, sy, y, x, sy, y + 1, x + 1, sy, y + 1, x, sy, y, x + 1, sy, y + 1, x + 1, sy, y);
          for (let k = 0; k < 6; k++) floodTimes.push(times[0], times[1]);
        }
        if (kind === TileKind.Radiation) {
          radiation.push(i);
          const sy = top + 0.05;
          glow.push(x, sy, y, x, sy, y + 1, x + 1, sy, y + 1, x, sy, y, x + 1, sy, y + 1, x + 1, sy, y);
        }
      }
    }

    if (before) {
      for (const g of before.geometries) g.dispose();
      this.group.remove(before.group);
    }
    const group = new Group();
    const geometries: BufferGeometry[] = [];
    if (!rubble.empty) {
      const geometry = rubble.build();
      geometries.push(geometry);
      const mesh = new Mesh(geometry, this.solid);
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    }
    const sheet = (positions: number[], times: number[] | null, material: ShaderMaterial) => {
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
      // Radiation sheets are always fully up: born long ago, never drained.
      const fallback = new Array<number>((positions.length / 3) * 2).fill(0).map((_, k) => (k % 2 === 0 ? -10 : 0));
      geometry.setAttribute('aTimes', new BufferAttribute(new Float32Array(times ?? fallback), 2));
      geometry.computeBoundingSphere();
      geometries.push(geometry);
      group.add(new Mesh(geometry, material));
    };
    if (flood.length > 0) sheet(flood, floodTimes, this.floodMaterial);
    if (glow.length > 0) sheet(glow, null, this.radiationMaterial);
    this.chunks.set(id, { kinds, flags, fires, radiation, group, geometries });
    this.group.add(group);
    this.glowDirty = true;
  }

  update(dt: number, target: Vector3): void {
    this.time += dt;
    for (const mat of [this.floodMaterial, this.radiationMaterial, this.fireGlowMaterial]) {
      (mat.uniforms as { uTime: { value: number } }).uTime.value = this.time;
    }
    // Drained flood tiles leave the mesh once their water has sunk.
    this.cleanupClock += dt;
    if (this.cleanupClock > 1) {
      this.cleanupClock = 0;
      const stale = new Set<number>();
      for (const [i, [, gone]] of this.floodTimes) {
        if (gone > 0 && this.time - gone > 3) {
          this.floodTimes.delete(i);
          const x = i % this.mirror.size;
          const y = Math.floor(i / this.mirror.size);
          stale.add((y >> 5) * this.mirror.chunksPerSide + (x >> 5));
        }
      }
      for (const id of stale) this.rebuild(id);
    }
    if (this.glowDirty) this.placeGlows();
    this.burn(dt);
    this.motes(dt, target);
  }

  /** Flames, smoke and embers over every burning tile. */
  private burn(dt: number): void {
    let count = 0;
    for (const c of this.chunks.values()) count += c.fires.length;
    if (count === 0) return;
    const perTile = Math.min(14, (FLAME_BUDGET * FX_SCALE.value) / count);
    const flames = this.flameRate.take(perTile * count, dt);
    const smokes = this.smokeRate.take(Math.min(3, 600 / count) * count, dt);
    const embers = this.emberRate.take(Math.min(2, 300 / count) * count, dt);
    const pick = (): Vector3 | undefined => {
      let k = Math.floor(Math.random() * count);
      for (const c of this.chunks.values()) {
        if (k < c.fires.length) return c.fires[k];
        k -= c.fires.length;
      }
      return undefined;
    };
    const { glow, smoke } = this.particles;
    for (let n = 0; n < flames; n++) {
      const p = pick();
      if (!p) break;
      glow.emit({
        x: p.x + (Math.random() - 0.5) * 0.7,
        y: p.y + 0.05 + Math.random() * 0.3,
        z: p.z + (Math.random() - 0.5) * 0.7,
        vx: (Math.random() - 0.5) * 0.2,
        vy: 0.9 + Math.random() * 0.8,
        vz: (Math.random() - 0.5) * 0.2,
        life: 0.5 + Math.random() * 0.5,
        size0: 0.42 + Math.random() * 0.2,
        size1: 0.08,
        c0: [3.2, 1.35, 0.32, 0.85],
        c1: [1.4, 0.22, 0.04, 0.5],
      });
    }
    for (let n = 0; n < smokes; n++) {
      const p = pick();
      if (!p) break;
      smoke.emit({
        x: p.x + (Math.random() - 0.5) * 0.5,
        y: p.y + 0.6,
        z: p.z + (Math.random() - 0.5) * 0.5,
        vx: 0.25 + (Math.random() - 0.5) * 0.2,
        vy: 0.9 + Math.random() * 0.4,
        vz: 0.1 + (Math.random() - 0.5) * 0.2,
        life: 3.5 + Math.random() * 2,
        size0: 0.5,
        size1: 2.4,
        drag: 0.25,
        c0: [0.16, 0.15, 0.14, 0.55],
        c1: [0.42, 0.41, 0.4, 0.0],
      });
    }
    for (let n = 0; n < embers; n++) {
      const p = pick();
      if (!p) break;
      glow.emit({
        x: p.x,
        y: p.y + 0.4,
        z: p.z,
        vx: (Math.random() - 0.5) * 1.2,
        vy: 1.5 + Math.random() * 1.5,
        vz: (Math.random() - 0.5) * 1.2,
        gravity: -1.2,
        life: 1.2 + Math.random(),
        size0: 0.07,
        size1: 0.03,
        c0: [5, 2.2, 0.5, 1],
        c1: [2.5, 0.6, 0.1, 0.6],
      });
    }
  }

  /** Green motes drifting up from radioactive ground near the camera. */
  private motes(dt: number, target: Vector3): void {
    const near: number[] = [];
    for (const c of this.chunks.values()) {
      for (const i of c.radiation) {
        const x = i % this.mirror.size;
        const y = Math.floor(i / this.mirror.size);
        if (Math.abs(x - target.x) < 40 && Math.abs(y - target.z) < 40) near.push(i);
      }
    }
    if (near.length === 0) return;
    const n = this.moteRate.take(Math.min(120, near.length * 0.6), dt);
    for (let k = 0; k < n; k++) {
      const i = near[Math.floor(Math.random() * near.length)] ?? 0;
      const x = (i % this.mirror.size) + Math.random();
      const z = Math.floor(i / this.mirror.size) + Math.random();
      this.particles.glow.emit({
        x,
        y: this.mirror.heightAt(x, z) + 0.1,
        z,
        vx: (Math.random() - 0.5) * 0.2,
        vy: 0.25 + Math.random() * 0.3,
        vz: (Math.random() - 0.5) * 0.2,
        life: 3 + Math.random() * 2,
        size0: 0.12,
        size1: 0.05,
        c0: [0.6, 2.2, 0.4, 0.9],
        c1: [0.3, 1.2, 0.2, 0],
      });
    }
  }

  /** A puff of dust where a building fell. */
  dust(x: number, y: number, z: number, count: number): void {
    for (let n = 0; n < count; n++) {
      const a = Math.random() * Math.PI * 2;
      const s = 0.6 + Math.random() * 1.2;
      this.particles.smoke.emit({
        x: x + Math.cos(a) * 0.3,
        y: y + 0.1 + Math.random() * 0.4,
        z: z + Math.sin(a) * 0.3,
        vx: Math.cos(a) * s,
        vy: 0.4 + Math.random() * 0.8,
        vz: Math.sin(a) * s,
        drag: 1.4,
        life: 2 + Math.random() * 1.5,
        size0: 0.4,
        size1: 1.8,
        c0: [0.62, 0.57, 0.5, 0.75],
        c1: [0.7, 0.66, 0.6, 0],
      });
    }
  }

  private placeGlows(): void {
    this.glowDirty = false;
    let n = 0;
    const matrix = new Matrix4();
    for (const c of this.chunks.values()) {
      for (const p of c.fires) {
        if (n >= MAX_FIRES) break;
        this.fireGlow.setMatrixAt(n++, matrix.makeTranslation(p.x, p.y + 0.06, p.z));
      }
    }
    this.fireGlow.count = n;
    this.fireGlow.instanceMatrix.needsUpdate = true;
  }
}
