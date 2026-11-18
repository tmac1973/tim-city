import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CHUNK_SIZE } from '@/shared/constants';
import { isBridge, isRoad, isTunnel } from '@/shared/tiles';
import type { CityMirror } from '../mirror';
import { DX, DY, type Dir, links } from '../agents/roadGraph';

const POLE_HEIGHT = 0.42;

/** Pole and arm, base at the origin, arm reaching toward +x. */
function poleGeometry(): BufferGeometry {
  const pole = new BoxGeometry(0.025, POLE_HEIGHT, 0.025).translate(0, POLE_HEIGHT / 2, 0);
  const arm = new BoxGeometry(0.16, 0.016, 0.016).translate(0.08, POLE_HEIGHT - 0.01, 0);
  return mergeGeometries([pole.toNonIndexed(), arm.toNonIndexed()]);
}

const glowVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;
const glowFragment = /* glsl */ `
  uniform float uNight;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.0, d);
    gl_FragColor = vec4(vec3(1.0, 0.8, 0.5) * a * a * 0.45 * uNight, 1.0);
  }
`;

/**
 * Lamp posts on every third road tile, on a sidewalk side, with heads that
 * glow and a soft pool of light on the road at night.
 */
export class StreetLights {
  readonly group = new Group();
  private readonly perChunk = new Map<number, number[]>();
  private dirty = true;
  private poles: InstancedMesh | null = null;
  private heads: InstancedMesh | null = null;
  private glows: InstancedMesh | null = null;
  private readonly poleGeometry = poleGeometry();
  private readonly headGeometry = new BoxGeometry(0.08, 0.018, 0.045);
  private readonly glowGeometry = new PlaneGeometry(1.1, 1.1).rotateX(-Math.PI / 2);
  private readonly poleMaterial = new MeshStandardMaterial({ color: 0x5b6168, roughness: 0.6, metalness: 0.3 });
  private readonly headMaterial = new MeshBasicMaterial({ color: new Color(0.6, 0.6, 0.6) });
  private readonly glowMaterial = new ShaderMaterial({
    vertexShader: glowVertex,
    fragmentShader: glowFragment,
    uniforms: { uNight: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });

  constructor(private readonly mirror: CityMirror) {
    this.group.name = 'street-lights';
  }

  rebuild(id: number): void {
    const m = this.mirror;
    const x0 = (id % m.chunksPerSide) * CHUNK_SIZE;
    const y0 = Math.floor(id / m.chunksPerSide) * CHUNK_SIZE;
    const out: number[] = [];
    for (let y = y0; y < y0 + CHUNK_SIZE; y++) {
      for (let x = x0; x < x0 + CHUNK_SIZE; x++) {
        const kind = m.tile(x, y);
        if (!isRoad(kind) || isBridge(kind) || isTunnel(kind) || (x * 7 + y * 13) % 3 !== 0) continue;
        const mask = links(m, x, y, 'road');
        // Stand on a side with no road: that is where the sidewalk is.
        let side: Dir | null = null;
        for (const d of [2, 1, 0, 3] as const) {
          if (!(mask & (1 << d))) {
            side = d;
            break;
          }
        }
        if (side === null) continue;
        const px = x + 0.5 + DX[side] * 0.46;
        const pz = y + 0.5 + DY[side] * 0.46;
        // The arm reaches back over the road.
        const yaw = Math.atan2(DY[side], -DX[side]);
        out.push(px, m.heightAt(px, pz), pz, yaw, x + 0.5, m.heightAt(x + 0.5, y + 0.5) + 0.05, y + 0.5);
      }
    }
    this.perChunk.set(id, out);
    this.dirty = true;
  }

  update(night: number): void {
    if (this.dirty) this.rebuildInstances();
    this.headMaterial.color.setScalar(0.55 + night * 3.2);
    (this.glowMaterial.uniforms as { uNight: { value: number } }).uNight.value = night;
    if (this.glows) this.glows.visible = night > 0.02;
  }

  private rebuildInstances(): void {
    this.dirty = false;
    let count = 0;
    for (const list of this.perChunk.values()) count += list.length / 7;
    for (const mesh of [this.poles, this.heads, this.glows]) if (mesh) this.group.remove(mesh);
    if (count === 0) return;
    if (!this.poles || this.poles.instanceMatrix.count < count) {
      for (const mesh of [this.poles, this.heads, this.glows]) mesh?.dispose();
      const capacity = Math.ceil(count * 1.5) + 64;
      this.poles = new InstancedMesh(this.poleGeometry, this.poleMaterial, capacity);
      this.poles.castShadow = true;
      this.heads = new InstancedMesh(this.headGeometry, this.headMaterial, capacity);
      this.glows = new InstancedMesh(this.glowGeometry, this.glowMaterial, capacity);
      for (const mesh of [this.poles, this.heads, this.glows]) mesh.frustumCulled = false;
    }
    const poles = this.poles;
    const heads = this.heads;
    const glows = this.glows;
    if (!heads || !glows) return;
    const matrix = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const one = new Vector3(1, 1, 1);
    const at = new Vector3();
    let i = 0;
    for (const list of this.perChunk.values()) {
      for (let k = 0; k < list.length; k += 7) {
        const [px, py, pz, yaw, gx, gy, gz] = list.slice(k, k + 7) as [number, number, number, number, number, number, number];
        q.setFromAxisAngle(up, yaw);
        poles.setMatrixAt(i, matrix.compose(at.set(px, py, pz), q, one));
        const hx = px + Math.cos(yaw) * 0.17;
        const hz = pz - Math.sin(yaw) * 0.17;
        heads.setMatrixAt(i, matrix.compose(at.set(hx, py + POLE_HEIGHT - 0.025, hz), q, one));
        glows.setMatrixAt(i, matrix.compose(at.set(gx, gy, gz), q, one));
        i++;
      }
    }
    for (const mesh of [poles, heads, glows]) {
      mesh.count = i;
      mesh.instanceMatrix.needsUpdate = true;
      this.group.add(mesh);
    }
  }
}
