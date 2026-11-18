import { AdditiveBlending, BufferAttribute, BufferGeometry, Group, LineSegments, NormalBlending, Points, ShaderMaterial, Vector3 } from 'three';
import type { VisualRng } from '../agents/visualRng';

/** Drops (or flakes) in the box around the camera target. */
export const PRECIPITATION_COUNT = 20000;

const common = /* glsl */ `
  uniform vec3 uCenter;
  uniform vec3 uBox;
  uniform float uTime;
  uniform float uSpeed;
  uniform vec2 uWind;
  // Wrap a falling point into the box so the field looks fixed in the world.
  vec3 place(vec3 base) {
    vec3 p = base * uBox;
    p.y -= uTime * uSpeed;
    p.xz += uWind * uTime;
    vec3 lo = uCenter - uBox * 0.5;
    return mod(p - lo, uBox) + lo;
  }
`;

const rainVertex = /* glsl */ `
  ${common}
  uniform float uLength;
  attribute vec3 aBase;
  attribute float aEnd;
  void main() {
    vec3 p = place(aBase);
    // The lower end of each streak trails behind along the fall direction.
    vec3 fall = normalize(vec3(uWind.x, -uSpeed, uWind.y));
    p += fall * aEnd * uLength;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

const rainFragment = /* glsl */ `
  uniform float uOpacity;
  void main() {
    gl_FragColor = vec4(0.72, 0.78, 0.88, uOpacity);
  }
`;

const snowVertex = /* glsl */ `
  ${common}
  attribute vec3 aBase;
  void main() {
    vec3 p = place(aBase);
    // Flakes drift side to side as they fall.
    float seed = aBase.x * 91.7 + aBase.z * 37.3;
    p.x += sin(uTime * 1.3 + seed) * 0.25;
    p.z += cos(uTime * 1.1 + seed * 1.7) * 0.25;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    gl_PointSize = clamp(90.0 / -mv.z, 1.0, 6.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const snowFragment = /* glsl */ `
  uniform float uOpacity;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    if (dot(c, c) > 0.25) discard;
    gl_FragColor = vec4(0.97, 0.98, 1.0, uOpacity);
  }
`;

/** GPU-animated rain streaks and snowflakes around the camera. */
export class Precipitation {
  readonly group = new Group();
  private readonly rain: LineSegments;
  private readonly snow: Points;
  private readonly rainMaterial: ShaderMaterial;
  private readonly snowMaterial: ShaderMaterial;
  private time = 0;

  constructor(rng: VisualRng) {
    const uniforms = () => ({
      uCenter: { value: new Vector3() },
      uBox: { value: new Vector3(40, 20, 40) },
      uTime: { value: 0 },
      uSpeed: { value: 14 },
      uWind: { value: { x: 1.5, y: 0.6 } },
      uOpacity: { value: 0 },
    });
    const bases = new Float32Array(PRECIPITATION_COUNT * 3);
    for (let i = 0; i < bases.length; i++) bases[i] = rng.next();

    // Rain: two vertices per drop, sharing a base point.
    const lineBase = new Float32Array(PRECIPITATION_COUNT * 6);
    const ends = new Float32Array(PRECIPITATION_COUNT * 2);
    for (let i = 0; i < PRECIPITATION_COUNT; i++) {
      for (let k = 0; k < 2; k++) {
        lineBase.set(bases.subarray(i * 3, i * 3 + 3), (i * 2 + k) * 3);
        ends[i * 2 + k] = k;
      }
    }
    const rainGeometry = new BufferGeometry();
    rainGeometry.setAttribute('position', new BufferAttribute(new Float32Array(PRECIPITATION_COUNT * 6), 3));
    rainGeometry.setAttribute('aBase', new BufferAttribute(lineBase, 3));
    rainGeometry.setAttribute('aEnd', new BufferAttribute(ends, 1));
    this.rainMaterial = new ShaderMaterial({
      vertexShader: rainVertex,
      fragmentShader: rainFragment,
      uniforms: { ...uniforms(), uLength: { value: 0.5 } },
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
    });
    this.rain = new LineSegments(rainGeometry, this.rainMaterial);

    const snowGeometry = new BufferGeometry();
    snowGeometry.setAttribute('position', new BufferAttribute(new Float32Array(PRECIPITATION_COUNT * 3), 3));
    snowGeometry.setAttribute('aBase', new BufferAttribute(bases, 3));
    this.snowMaterial = new ShaderMaterial({
      vertexShader: snowVertex,
      fragmentShader: snowFragment,
      uniforms: { ...uniforms(), uSpeed: { value: 1.6 } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.snow = new Points(snowGeometry, this.snowMaterial);
    for (const o of [this.rain, this.snow]) {
      o.frustumCulled = false;
      o.visible = false;
      this.group.add(o);
    }
    this.group.name = 'precipitation';
  }

  /** rain and snow are 0–1 amounts; the box grows with the camera distance. */
  update(dt: number, center: Vector3, distance: number, rain: number, snow: number, night: number): void {
    this.time += dt;
    const side = Math.min(120, Math.max(24, distance * 1.1));
    for (const [object, material, amount] of [
      [this.rain, this.rainMaterial, rain],
      [this.snow, this.snowMaterial, snow],
    ] as const) {
      object.visible = amount > 0.02;
      if (!object.visible) continue;
      const u = material.uniforms as Record<string, { value: unknown }>;
      (u.uCenter?.value as Vector3).set(center.x, center.y + side * 0.2, center.z);
      (u.uBox?.value as Vector3).set(side, side * 0.5, side);
      if (u.uTime) u.uTime.value = this.time;
      if (u.uOpacity) u.uOpacity.value = (object === this.rain ? 0.32 : 0.85) * (1 - 0.5 * night) * Math.min(1, amount * 1.5);
      if (u.uLength) u.uLength.value = 0.3 + side * 0.006;
      const count = Math.floor(PRECIPITATION_COUNT * amount);
      object.geometry.setDrawRange(0, object === this.rain ? count * 2 : count);
    }
  }
}
