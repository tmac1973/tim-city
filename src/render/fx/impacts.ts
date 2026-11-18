import { Color, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, ShaderMaterial, Vector3 } from 'three';
import { TriangleBuilder } from '../geometry';
import type { CityMirror } from '../mirror';
import { MODELS } from '../agents/models';
import { WATER_Y } from '../units';
import { Rate } from './common';
import type { Particles } from './particles';

/** A one-off effect with its own timeline; returns true from update when done. */
export interface Impact {
  readonly group: Group;
  update(dt: number): boolean;
  dispose(): void;
}

const oilFragment = /* glsl */ `
  uniform float uTime;
  uniform float uFade;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float edge = 1.0 - smoothstep(0.6, 1.0, d + 0.08 * sin(atan(vUv.y - 0.5, vUv.x - 0.5) * 5.0 + uTime * 0.3));
    // A thin rainbow sheen over black.
    vec3 sheen = 0.5 + 0.5 * cos(6.2832 * (d * 3.0 + vec3(0.0, 0.33, 0.67) + uTime * 0.05));
    vec3 col = mix(vec3(0.02, 0.02, 0.03), sheen * 0.35, 0.35);
    gl_FragColor = vec4(col, edge * 0.82 * uFade);
  }
`;
const oilVertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

function explosion(particles: Particles, at: Vector3, scale: number): void {
  particles.flash.emit({ x: at.x, y: at.y + 0.5, z: at.z, life: 0.35, size0: 6 * scale, size1: 9 * scale, c0: [6, 5, 4, 1], c1: [3, 1.2, 0.3, 0] });
  for (let n = 0; n < 70 * scale; n++) {
    const a = Math.random() * Math.PI * 2;
    const up = Math.random();
    const s = (1.5 + Math.random() * 2.5) * scale;
    particles.glow.emit({
      x: at.x,
      y: at.y + 0.3,
      z: at.z,
      vx: Math.cos(a) * s * (1 - up * 0.5),
      vy: up * s * 1.2,
      vz: Math.sin(a) * s * (1 - up * 0.5),
      drag: 2.2,
      life: 0.7 + Math.random() * 0.6,
      size0: 1.0 * scale,
      size1: 2.2 * scale,
      c0: [4, 1.8, 0.4, 0.9],
      c1: [1.2, 0.2, 0.05, 0],
    });
  }
  for (let n = 0; n < 60 * scale; n++) {
    const a = Math.random() * Math.PI * 2;
    const s = 3 + Math.random() * 4;
    particles.glow.emit({
      x: at.x,
      y: at.y + 0.3,
      z: at.z,
      vx: Math.cos(a) * s,
      vy: 2 + Math.random() * 4,
      vz: Math.sin(a) * s,
      gravity: -8,
      life: 1 + Math.random(),
      size0: 0.1,
      size1: 0.05,
      c0: [5, 2.5, 0.8, 1],
      c1: [2, 0.6, 0.1, 0.5],
    });
  }
}

function smokeColumn(particles: Particles, at: Vector3, count: number, scale: number): void {
  for (let n = 0; n < count; n++) {
    particles.smoke.emit({
      x: at.x + (Math.random() - 0.5) * 0.6 * scale,
      y: at.y + 0.3,
      z: at.z + (Math.random() - 0.5) * 0.6 * scale,
      vx: 0.3 + (Math.random() - 0.5) * 0.3,
      vy: (1.4 + Math.random()) * scale,
      vz: 0.15 + (Math.random() - 0.5) * 0.3,
      gravity: 0.15,
      drag: 0.2,
      life: 5 + Math.random() * 2,
      size0: 0.7 * scale,
      size1: 3.5 * scale,
      c0: [0.12, 0.11, 0.1, 0.7],
      c1: [0.35, 0.34, 0.33, 0],
    });
  }
}

/** A plane dives in, explodes, and leaves a smoke column for a while. */
export class PlaneCrash implements Impact {
  readonly group = new Group();
  private readonly plane: Mesh;
  private readonly from: Vector3;
  private readonly to: Vector3;
  private time = 0;
  private exploded = false;
  private readonly smokeRate = new Rate();

  constructor(
    private readonly particles: Particles,
    mirror: CityMirror,
    x: number,
    z: number,
  ) {
    this.to = new Vector3(x, mirror.heightAt(x, z), z);
    const a = Math.random() * Math.PI * 2;
    this.from = new Vector3(x + Math.cos(a) * 26, this.to.y + 14, z + Math.sin(a) * 26);
    this.plane = new Mesh(MODELS.plane(), new MeshStandardMaterial({ vertexColors: true, flatShading: true }));
    this.plane.scale.setScalar(1.8);
    this.plane.castShadow = true;
    this.group.add(this.plane);
  }

  update(dt: number): boolean {
    this.time += dt;
    const fall = 2.4;
    if (this.time < fall) {
      const t = this.time / fall;
      const p = new Vector3().lerpVectors(this.from, this.to, t * t);
      const dir = new Vector3().subVectors(this.to, this.from).normalize();
      this.plane.position.copy(p);
      // lookAt aims local +z; the model's nose is +x, so aim +z to its left.
      this.plane.lookAt(p.clone().add(new Vector3(-dir.z, 0, dir.x)));
      this.plane.rotateZ(-0.5 - t * 0.3);
      // Smoke trailing from a burning engine.
      this.particles.smoke.emit({ x: p.x, y: p.y, z: p.z, life: 2, size0: 0.4, size1: 1.4, c0: [0.15, 0.14, 0.13, 0.6], c1: [0.4, 0.4, 0.4, 0] });
      return false;
    }
    if (!this.exploded) {
      this.exploded = true;
      this.plane.visible = false;
      explosion(this.particles, this.to, 1.2);
    }
    const left = 26 - this.time;
    if (left > 0) smokeColumn(this.particles, this.to, this.smokeRate.take(9 * Math.min(1, left / 6), dt), 1);
    return left <= -7;
  }

  dispose(): void {
    this.plane.geometry.dispose();
    (this.plane.material as MeshStandardMaterial).dispose();
  }
}

/** A cargo ship lists and sinks; an oil slick spreads where it went down. */
export class Shipwreck implements Impact {
  readonly group = new Group();
  private readonly ship: Mesh;
  private readonly slick: Mesh;
  private readonly slickMaterial: ShaderMaterial;
  private time = 0;

  constructor(
    private readonly particles: Particles,
    x: number,
    z: number,
  ) {
    this.ship = new Mesh(MODELS.ship(), new MeshStandardMaterial({ vertexColors: true, flatShading: true }));
    this.ship.scale.setScalar(2.4);
    this.ship.position.set(x, WATER_Y, z);
    this.ship.rotation.y = Math.random() * Math.PI * 2;
    this.slickMaterial = new ShaderMaterial({
      vertexShader: oilVertex,
      fragmentShader: oilFragment,
      uniforms: { uTime: { value: 0 }, uFade: { value: 1 } },
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });
    this.slick = new Mesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.slickMaterial);
    this.slick.position.set(x, WATER_Y + 0.02, z);
    this.slick.scale.setScalar(0.01);
    this.group.add(this.ship, this.slick);
    for (let n = 0; n < 50; n++) {
      const a = Math.random() * Math.PI * 2;
      particles.smoke.emit({ x, y: WATER_Y + 0.1, z, vx: Math.cos(a) * 2, vy: 2 + Math.random() * 2, vz: Math.sin(a) * 2, gravity: -6, life: 1.2, size0: 0.25, size1: 0.5, c0: [0.9, 0.95, 1, 0.9], c1: [0.9, 0.95, 1, 0] });
    }
  }

  update(dt: number): boolean {
    this.time += dt;
    const t = this.time;
    const sink = Math.min(1, t / 14);
    this.ship.rotation.z = sink * 0.45;
    this.ship.rotation.x = sink * 0.2;
    this.ship.position.y = WATER_Y - sink * sink * 1.4;
    this.ship.visible = sink < 1;
    if (sink < 1 && Math.random() < dt * 8) {
      const p = this.ship.position;
      this.particles.smoke.emit({ x: p.x + (Math.random() - 0.5), y: WATER_Y + 0.05, z: p.z + (Math.random() - 0.5), vy: 0.5, life: 1.5, size0: 0.3, size1: 0.9, c0: [0.92, 0.96, 1, 0.7], c1: [0.92, 0.96, 1, 0] });
    }
    this.slick.scale.setScalar(0.01 + 7 * Math.min(1, t / 12));
    const u = this.slickMaterial.uniforms as { uTime: { value: number }; uFade: { value: number } };
    u.uTime.value = t;
    u.uFade.value = 1 - Math.max(0, (t - 60) / 15);
    return t > 75;
  }

  dispose(): void {
    this.ship.geometry.dispose();
    (this.ship.material as MeshStandardMaterial).dispose();
    this.slick.geometry.dispose();
    this.slickMaterial.dispose();
  }
}

/** A blinding flash, then a mushroom of steam over the plant. */
export class Meltdown implements Impact {
  readonly group = new Group();
  private time = 0;
  private readonly stemRate = new Rate();
  private readonly at: Vector3;

  constructor(
    private readonly particles: Particles,
    mirror: CityMirror,
    x: number,
    z: number,
  ) {
    this.at = new Vector3(x, mirror.heightAt(x, z), z);
    explosion(particles, this.at, 2.2);
    particles.flash.emit({ x, y: this.at.y + 2, z, life: 1.2, size0: 18, size1: 30, c0: [3, 5, 2.5, 1], c1: [0.5, 1.5, 0.4, 0] });
  }

  update(dt: number): boolean {
    this.time += dt;
    const t = this.time;
    if (t < 7) {
      // The stem: fast-rising steam that slows as it climbs.
      for (let n = 0; n < this.stemRate.take(40, dt); n++) {
        this.particles.smoke.emit({
          x: this.at.x + (Math.random() - 0.5) * 1.2,
          y: this.at.y + 0.5,
          z: this.at.z + (Math.random() - 0.5) * 1.2,
          vx: (Math.random() - 0.5) * 0.6,
          vy: 7 + Math.random() * 2,
          vz: (Math.random() - 0.5) * 0.6,
          drag: 0.45,
          life: 8 + Math.random() * 3,
          size0: 1.2,
          size1: 4,
          c0: [0.92, 0.92, 0.9, 0.6],
          c1: [0.7, 0.72, 0.7, 0],
        });
      }
    }
    if (t > 1.6 && t - dt <= 1.6) {
      // The cap: a ring rolling outward at the top of the stem.
      for (let n = 0; n < 220; n++) {
        const a = Math.random() * Math.PI * 2;
        const s = 2 + Math.random() * 3;
        this.particles.smoke.emit({
          x: this.at.x,
          y: this.at.y + 13 + Math.random() * 2,
          z: this.at.z,
          vx: Math.cos(a) * s,
          vy: (Math.random() - 0.3) * 1.2,
          vz: Math.sin(a) * s,
          drag: 0.6,
          life: 9 + Math.random() * 3,
          size0: 2.5,
          size1: 6,
          c0: [0.95, 0.94, 0.9, 0.55],
          c1: [0.65, 0.66, 0.64, 0],
          delay: Math.random() * 1.5,
        });
      }
    }
    return t > 16;
  }

  dispose(): void {}
}

/** Jagged cracks across the ground around an earthquake's epicentre, fading out. */
export class QuakeCracks implements Impact {
  readonly group = new Group();
  private readonly mesh: Mesh;
  private readonly material = new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
  private time = 0;

  constructor(mirror: CityMirror, x: number, z: number) {
    const t = new TriangleBuilder();
    const dark = new Color(0x1d1a17);
    const up = new Vector3(0, 1, 0);
    for (let c = 0; c < 9; c++) {
      let a = (c / 9) * Math.PI * 2 + Math.random() * 0.5;
      let px = x + Math.cos(a) * 0.5;
      let pz = z + Math.sin(a) * 0.5;
      let w = 0.16;
      const steps = 8 + Math.floor(Math.random() * 10);
      for (let s = 0; s < steps; s++) {
        a += (Math.random() - 0.5) * 0.9;
        const nx = px + Math.cos(a) * 0.7;
        const nz = pz + Math.sin(a) * 0.7;
        const ox = -Math.sin(a) * w;
        const oz = Math.cos(a) * w;
        const nw = w * 0.88;
        const h = (qx: number, qz: number) => mirror.heightAt(qx, qz) + 0.045;
        const v = (qx: number, qz: number) => new Vector3(qx, h(qx, qz), qz);
        t.quad(v(px - ox, pz - oz), v(px + ox, pz + oz), v(nx + ox * (nw / w), nz + oz * (nw / w)), v(nx - ox * (nw / w), nz - oz * (nw / w)), up, dark);
        px = nx;
        pz = nz;
        w = nw;
      }
    }
    this.mesh = new Mesh(t.build(), this.material);
    this.group.add(this.mesh);
  }

  update(dt: number): boolean {
    this.time += dt;
    this.material.opacity = 0.85 * (1 - Math.max(0, (this.time - 40) / 20));
    return this.time > 60;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
