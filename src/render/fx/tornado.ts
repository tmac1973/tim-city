import { CylinderGeometry, DoubleSide, Group, Mesh, ShaderMaterial } from 'three';
import { ATMOSPHERE } from '../atmosphere/uniforms';
import type { CityMirror } from '../mirror';
import { WATER_Y } from '../units';
import { Rate } from './common';
import type { Particles } from './particles';

const HEIGHT = 7;

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uTwist;
  varying vec2 vUv;
  varying float vEdge;
  void main() {
    vUv = uv;
    vec3 p = position;
    float h = clamp(p.y / ${HEIGHT.toFixed(1)}, 0.0, 1.0);
    // The funnel sways more toward the top.
    p.x += sin(uTime * 1.3 + p.y * 0.5) * 0.35 * h * h * ${HEIGHT.toFixed(1)} * 0.3;
    p.z += cos(uTime * 1.05 + p.y * 0.4) * 0.3 * h * h * ${HEIGHT.toFixed(1)} * 0.3;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vec3 n = normalize(normalMatrix * normal);
    vEdge = 1.0 - abs(dot(n, normalize(-mv.xyz)));
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uTwist;
  uniform float uLight;
  uniform float uOpacity;
  uniform vec3 uColor;
  varying vec2 vUv;
  varying float vEdge;
  void main() {
    // Bands that wind up the funnel and scroll around it.
    float a = vUv.x * 6.2832;
    float b1 = sin(a * 3.0 + vUv.y * uTwist - uTime * 7.0) * 0.5 + 0.5;
    float b2 = sin(a * 7.0 - vUv.y * uTwist * 1.7 - uTime * 11.0) * 0.5 + 0.5;
    float n = b1 * 0.6 + b2 * 0.4;
    float alpha = (0.62 + 0.35 * n) * (0.75 + 0.25 * vEdge);
    alpha *= smoothstep(0.0, 0.06, vUv.y) * (1.0 - smoothstep(0.8, 1.0, vUv.y)) * uOpacity;
    vec3 col = mix(uColor * 0.6, uColor * 1.15, n) * uLight;
    gl_FragColor = vec4(col, alpha);
  }
`;

function funnel(radiusTop: number, radiusBottom: number, color: [number, number, number], twist: number): Mesh {
  const geometry = new CylinderGeometry(radiusTop, radiusBottom, HEIGHT, 28, 14, true).translate(0, HEIGHT / 2, 0);
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uTwist: { value: twist },
      uLight: ATMOSPHERE.uLight,
      uOpacity: { value: 0 },
      uColor: { value: { r: color[0], g: color[1], b: color[2] } },
    },
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

/** A twisting, swaying funnel with a dust skirt and flung debris. */
export class TornadoFx {
  readonly group = new Group();
  private readonly layers: Mesh[];
  private readonly dustRate = new Rate();
  private readonly debrisRate = new Rate();
  private time = 0;
  private fade = 0;
  ending = false;

  constructor(
    private readonly mirror: CityMirror,
    private readonly particles: Particles,
    x: number,
    z: number,
  ) {
    this.layers = [funnel(1.9, 0.3, [0.58, 0.55, 0.5], 9), funnel(1.2, 0.18, [0.36, 0.34, 0.31], 13)];
    this.group.add(...this.layers);
    this.group.position.set(x, mirror.heightAt(x, z), z);
  }

  /** Ease toward the sim's position (it steps once per tick). */
  update(dt: number, tx: number, tz: number): boolean {
    this.time += dt;
    this.fade = Math.min(1, Math.max(0, this.fade + (this.ending ? -dt : dt) / 1.2));
    const k = 1 - Math.exp(-5 * dt);
    const p = this.group.position;
    p.x += (tx - p.x) * k;
    p.z += (tz - p.z) * k;
    p.y = Math.max(this.mirror.heightAt(p.x, p.z), WATER_Y);
    this.layers.forEach((layer, i) => {
      const u = (layer.material as ShaderMaterial).uniforms as { uTime: { value: number }; uOpacity: { value: number } };
      u.uTime.value = this.time * (i === 0 ? 1 : 1.4);
      u.uOpacity.value = this.fade;
      layer.rotation.y += dt * (i === 0 ? 3 : -4.5);
    });
    if (this.fade > 0.2) this.emit(dt);
    return this.ending && this.fade <= 0;
  }

  private emit(dt: number): void {
    const p = this.group.position;
    const dust = this.dustRate.take(70, dt);
    for (let n = 0; n < dust; n++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.5 + Math.random() * 0.9;
      // Tangential swirl plus a lift.
      this.particles.smoke.emit({
        x: p.x + Math.cos(a) * r,
        y: p.y + 0.1,
        z: p.z + Math.sin(a) * r,
        vx: -Math.sin(a) * 2.6 + Math.cos(a) * 0.4,
        vy: 0.6 + Math.random() * 1.2,
        vz: Math.cos(a) * 2.6 + Math.sin(a) * 0.4,
        drag: 0.9,
        life: 1.4 + Math.random(),
        size0: 0.5,
        size1: 1.8,
        c0: [0.5, 0.45, 0.38, 0.55],
        c1: [0.58, 0.54, 0.48, 0],
      });
    }
    const debris = this.debrisRate.take(28, dt);
    for (let n = 0; n < debris; n++) {
      const a = Math.random() * Math.PI * 2;
      const s = 2 + Math.random() * 3;
      const shade = 0.15 + Math.random() * 0.25;
      this.particles.smoke.emit({
        x: p.x,
        y: p.y + 0.5 + Math.random() * 3,
        z: p.z,
        vx: Math.cos(a) * s,
        vy: 2 + Math.random() * 3,
        vz: Math.sin(a) * s,
        gravity: -7,
        life: 1.5 + Math.random(),
        size0: 0.09,
        size1: 0.07,
        c0: [shade, shade * 0.9, shade * 0.8, 1],
        c1: [shade, shade * 0.9, shade * 0.8, 0.8],
      });
    }
  }

  dispose(): void {
    for (const layer of this.layers) {
      layer.geometry.dispose();
      (layer.material as ShaderMaterial).dispose();
    }
  }
}
