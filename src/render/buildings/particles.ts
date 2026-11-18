import { BufferAttribute, BufferGeometry, Points, ShaderMaterial, Vector3 } from 'three';
import { ATMOSPHERE } from '../atmosphere/uniforms';
import { hash3 } from '../hash';

const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute float aShade;
  varying float vAlpha;
  varying float vShade;
  void main() {
    vAlpha = aAlpha;
    vShade = aShade;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (420.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uLight;
  varying float vAlpha;
  varying float vShade;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p);
    if (d > 0.5) discard;
    float soft = smoothstep(0.5, 0.15, d);
    gl_FragColor = vec4(vec3(vShade) * uLight, vAlpha * soft);
  }
`;

const PUFFS_PER_EMITTER = 9;
const MAX_POINTS = 6000;
const BURST_LIFE = 0.9;

interface Emitter {
  pos: Vector3;
  steam: boolean;
  seed: number;
}

interface Burst {
  origin: Vector3;
  start: number;
  count: number;
  seed: number;
}

/**
 * Soft round puffs for chimney smoke, cooling-tower steam and construction
 * dust. Smoke is continuous per emitter; dust comes in short bursts.
 */
export class PuffLayer {
  readonly points: Points;
  private readonly emitters = new Map<number, Emitter>();
  private bursts: Burst[] = [];
  private nextId = 1;
  private readonly position = new Float32Array(MAX_POINTS * 3);
  private readonly size = new Float32Array(MAX_POINTS);
  private readonly alpha = new Float32Array(MAX_POINTS);
  private readonly shade = new Float32Array(MAX_POINTS);

  constructor() {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.position, 3));
    geometry.setAttribute('aSize', new BufferAttribute(this.size, 1));
    geometry.setAttribute('aAlpha', new BufferAttribute(this.alpha, 1));
    geometry.setAttribute('aShade', new BufferAttribute(this.shade, 1));
    geometry.setDrawRange(0, 0);
    this.points = new Points(
      geometry,
      new ShaderMaterial({ vertexShader, fragmentShader, transparent: true, depthWrite: false, uniforms: { uLight: ATMOSPHERE.uLight } }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
  }

  addEmitter(pos: Vector3, steam: boolean): number {
    const id = this.nextId++;
    this.emitters.set(id, { pos: pos.clone(), steam, seed: hash3(Math.round(pos.x * 10), Math.round(pos.z * 10), 9) });
    return id;
  }

  removeEmitter(id: number): void {
    this.emitters.delete(id);
  }

  burst(origin: Vector3, count: number, time: number): void {
    this.bursts.push({ origin: origin.clone(), start: time, count, seed: Math.random() });
  }

  update(time: number): void {
    let n = 0;
    const put = (x: number, y: number, z: number, size: number, alpha: number, shade: number) => {
      if (n >= MAX_POINTS) return;
      this.position[n * 3] = x;
      this.position[n * 3 + 1] = y;
      this.position[n * 3 + 2] = z;
      this.size[n] = size;
      this.alpha[n] = alpha;
      this.shade[n] = shade;
      n++;
    };

    // Smoke drifts downwind (towards +x, +z) while it rises and spreads.
    for (const e of this.emitters.values()) {
      const rate = e.steam ? 0.18 : 0.28;
      for (let k = 0; k < PUFFS_PER_EMITTER; k++) {
        const life = (time * rate + k / PUFFS_PER_EMITTER + e.seed) % 1;
        const rise = life * (e.steam ? 1.6 : 2.2);
        const drift = life * life * 1.4;
        const wobble = Math.sin((life + e.seed) * 9) * 0.08;
        put(
          e.pos.x + drift + wobble,
          e.pos.y + rise,
          e.pos.z + drift * 0.6 - wobble,
          (e.steam ? 0.9 : 0.45) + life * (e.steam ? 1.6 : 1.1),
          (1 - life) * (e.steam ? 0.55 : 0.42) * Math.min(1, life * 6),
          e.steam ? 0.96 : 0.55 - life * 0.1,
        );
      }
    }

    this.bursts = this.bursts.filter((b) => time - b.start < BURST_LIFE);
    for (const b of this.bursts) {
      const life = (time - b.start) / BURST_LIFE;
      for (let k = 0; k < b.count; k++) {
        const a = (k / b.count) * Math.PI * 2 + b.seed * 6;
        const r = 0.4 + life * (0.9 + ((k * 37) % 7) * 0.08);
        put(b.origin.x + Math.cos(a) * r, b.origin.y + 0.15 + life * 0.5, b.origin.z + Math.sin(a) * r, 0.6 + life * 0.9, (1 - life) * 0.5, 0.78);
      }
    }

    const geometry = this.points.geometry;
    geometry.setDrawRange(0, n);
    for (const name of ['position', 'aSize', 'aAlpha', 'aShade']) {
      const attr = geometry.getAttribute(name);
      attr.needsUpdate = true;
    }
  }
}
