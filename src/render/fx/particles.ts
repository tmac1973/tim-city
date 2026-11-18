import {
  AdditiveBlending,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
} from 'three';

/** Most particles alive at once, per blend mode. */
export const PARTICLE_CAPACITY = 30000;

/**
 * Slot allocation for a fixed pool: each new particle takes the next slot,
 * overwriting the oldest, so the live count can never pass the capacity.
 */
export class ParticleRing {
  private next = 0;
  /** Slots written since the last flush, as [first, count] runs. */
  private dirtyFrom = -1;
  private dirtyCount = 0;
  private wrapped = false;

  constructor(readonly capacity: number) {}

  alloc(): number {
    const slot = this.next;
    this.next = (this.next + 1) % this.capacity;
    if (this.next === 0) this.wrapped = true;
    if (this.dirtyFrom < 0) this.dirtyFrom = slot;
    this.dirtyCount = Math.min(this.capacity, this.dirtyCount + 1);
    return slot;
  }

  /** Start over from slot 0 (call only when every particle is dead). */
  reset(): void {
    this.next = 0;
    this.wrapped = false;
    this.dirtyFrom = -1;
    this.dirtyCount = 0;
  }

  /** Slots ever used: the most that can be alive. */
  get used(): number {
    return this.wrapped ? this.capacity : this.next;
  }

  /** The written range since the last call (may wrap), then reset. */
  takeDirty(): [number, number] | null {
    if (this.dirtyFrom < 0) return null;
    const out: [number, number] = [this.dirtyFrom, this.dirtyCount];
    this.dirtyFrom = -1;
    this.dirtyCount = 0;
    return out;
  }
}

const vertexShader = /* glsl */ `
  uniform float uTime;
  attribute vec4 aStart;   // xyz, birth time
  attribute vec4 aVel;     // xyz, life
  attribute vec4 aShape;   // size start, size end, gravity, drag
  attribute vec4 aColor0;
  attribute vec4 aColor1;
  varying vec4 vColor;
  varying vec2 vUv;
  void main() {
    float age = uTime - aStart.w;
    float life = aVel.w;
    if (age < 0.0 || age > life) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    float t = age / life;
    // Drag slows the initial velocity exponentially; gravity accelerates.
    float k = aShape.w;
    float travel = k > 0.0 ? (1.0 - exp(-k * age)) / k : age;
    vec3 p = aStart.xyz + aVel.xyz * travel + vec3(0.0, 0.5 * aShape.z * age * age, 0.0);
    vec4 mv = viewMatrix * vec4(p, 1.0);
    float size = mix(aShape.x, aShape.y, t);
    mv.xy += position.xy * size;
    gl_Position = projectionMatrix * mv;
    vColor = mix(aColor0, aColor1, t);
    vColor.a *= smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.65, 1.0, t));
    vUv = uv;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uAdditive;
  varying vec4 vColor;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    if (d > 1.0) discard;
    float soft = 1.0 - smoothstep(0.35, 1.0, d);
    float a = vColor.a * soft;
    gl_FragColor = uAdditive > 0.5 ? vec4(vColor.rgb * a, 1.0) : vec4(vColor.rgb, a);
  }
`;

export interface ParticleSpec {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  life: number;
  size0: number;
  size1: number;
  /** Upward is positive: smoke rises with a small positive value, debris falls with -9. */
  gravity?: number;
  drag?: number;
  /** Linear RGB(A), 0–1 (additive colours may go above 1). */
  c0: readonly [number, number, number, number];
  c1: readonly [number, number, number, number];
  /** Seconds from now before it appears. */
  delay?: number;
}

/**
 * One GPU particle system: camera-facing quads drawn in a single instanced
 * call, animated entirely in the vertex shader from per-particle start
 * values. Nothing is updated per particle per frame on the CPU.
 */
export class ParticleSystem {
  readonly mesh: Mesh;
  readonly ring = new ParticleRing(PARTICLE_CAPACITY);
  private readonly start = new Float32Array(PARTICLE_CAPACITY * 4);
  private readonly vel = new Float32Array(PARTICLE_CAPACITY * 4);
  private readonly shape = new Float32Array(PARTICLE_CAPACITY * 4);
  private readonly color0 = new Float32Array(PARTICLE_CAPACITY * 4);
  private readonly color1 = new Float32Array(PARTICLE_CAPACITY * 4);
  private readonly attributes: InstancedBufferAttribute[];
  private readonly material: ShaderMaterial;
  private readonly geometry: InstancedBufferGeometry;
  /** When the last particle emitted so far dies. */
  private liveUntil = -1;
  time = 0;

  /** `onTop` skips the depth test: for big flashes that would clip into the ground. */
  constructor(additive: boolean, onTop = false) {
    const geometry = new InstancedBufferGeometry();
    const quad = new PlaneGeometry(1, 1);
    geometry.index = quad.index;
    geometry.setAttribute('position', quad.getAttribute('position'));
    geometry.setAttribute('uv', quad.getAttribute('uv'));
    // Births in the far past: every slot starts dead.
    for (let i = 0; i < PARTICLE_CAPACITY; i++) this.start[i * 4 + 3] = -1e6;
    const attr = (name: string, array: Float32Array) => {
      const a = new InstancedBufferAttribute(array, 4);
      a.setUsage(DynamicDrawUsage);
      geometry.setAttribute(name, a);
      return a;
    };
    this.attributes = [attr('aStart', this.start), attr('aVel', this.vel), attr('aShape', this.shape), attr('aColor0', this.color0), attr('aColor1', this.color1)];
    // Draw only the slots in use; nothing at all while every particle is dead.
    geometry.instanceCount = 0;
    this.geometry = geometry;
    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: { uTime: { value: 0 }, uAdditive: { value: additive ? 1 : 0 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
      depthTest: !onTop,
    });
    this.mesh = new Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 6 : 5;
  }

  emit(p: ParticleSpec): void {
    const i = this.ring.alloc() * 4;
    this.liveUntil = Math.max(this.liveUntil, this.time + (p.delay ?? 0) + p.life);
    this.start.set([p.x, p.y, p.z, this.time + (p.delay ?? 0)], i);
    this.vel.set([p.vx ?? 0, p.vy ?? 0, p.vz ?? 0, p.life], i);
    this.shape.set([p.size0, p.size1, p.gravity ?? 0, p.drag ?? 0], i);
    this.color0.set(p.c0, i);
    this.color1.set(p.c1, i);
  }

  update(dt: number): void {
    this.time += dt;
    (this.material.uniforms as { uTime: { value: number } }).uTime.value = this.time;
    if (this.time > this.liveUntil) {
      this.ring.reset();
      this.geometry.instanceCount = 0;
      return;
    }
    this.geometry.instanceCount = this.ring.used;
    const dirty = this.ring.takeDirty();
    if (!dirty) return;
    const [from, count] = dirty;
    for (const a of this.attributes) {
      a.clearUpdateRanges();
      const end = from + count;
      if (end <= PARTICLE_CAPACITY) {
        a.addUpdateRange(from * 4, count * 4);
      } else {
        a.addUpdateRange(from * 4, (PARTICLE_CAPACITY - from) * 4);
        a.addUpdateRange(0, (end - PARTICLE_CAPACITY) * 4);
      }
      a.needsUpdate = true;
    }
  }
}

/**
 * The shared systems: additive (fire, sparks, glows), alpha (smoke, dust,
 * debris), and additive flashes drawn over everything.
 */
export class Particles {
  readonly glow = new ParticleSystem(true);
  readonly smoke = new ParticleSystem(false);
  readonly flash = new ParticleSystem(true, true);

  update(dt: number): void {
    this.glow.update(dt);
    this.smoke.update(dt);
    this.flash.update(dt);
  }
}
