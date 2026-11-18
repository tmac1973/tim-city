import { BufferAttribute, BufferGeometry, Color, Group, Mesh, ShaderMaterial, Vector3 } from 'three';
import { CHUNK_SIZE } from '@/shared/constants';
import { TileKind } from '@/shared/tiles';
import type { CityMirror } from './mirror';
import { PALETTE } from './palette';
import { HEIGHT_UNIT, WATER_Y } from './units';

const vertexShader = /* glsl */ `
  attribute float depth;
  varying float vDepth;
  varying vec3 vWorld;
  void main() {
    vDepth = depth;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uFoam;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  varying float vDepth;
  varying vec3 vWorld;

  void main() {
    if (vDepth < -0.02) discard;
    float d = clamp(vDepth / 1.2, 0.0, 1.0);
    vec3 col = mix(uShallow, uDeep, smoothstep(0.0, 1.0, d));

    // Cheap analytic ripples: travelling sine waves at unrelated angles and
    // wavelengths perturb the normal (related ones beat into a dot grid).
    vec2 p = vWorld.xz;
    float t = uTime;
    float nx = sin(dot(p, vec2(0.83, 0.31)) * 1.9 + t * 1.3) * 0.5
             + sin(dot(p, vec2(-0.27, 0.91)) * 3.3 - t * 1.7) * 0.3
             + sin(dot(p, vec2(0.58, -0.71)) * 5.7 + t * 2.1) * 0.2;
    float nz = sin(dot(p, vec2(-0.44, 0.87)) * 2.3 - t * 1.1) * 0.5
             + sin(dot(p, vec2(0.96, 0.12)) * 4.1 + t * 1.5) * 0.3
             + sin(dot(p, vec2(-0.69, -0.52)) * 6.3 - t * 1.9) * 0.2;
    // Fade ripples with distance: far away a pixel spans several waves and
    // the highlights alias into a dot grid.
    float camDist = length(cameraPosition - vWorld);
    float ripple = 0.06 * smoothstep(110.0, 35.0, camDist);
    vec3 n = normalize(vec3(nx * ripple, 1.0, nz * ripple));

    vec3 viewDir = normalize(cameraPosition - vWorld);
    vec3 halfDir = normalize(uSunDir + viewDir);
    float spec = pow(max(dot(n, halfDir), 0.0), 200.0) * 0.6;
    float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 4.0) * 0.12;

    // Foam where the water thins out against the shore.
    float foam = smoothstep(0.14, 0.0, vDepth) * (0.6 + 0.4 * sin(t * 2.0 + (p.x + p.y) * 3.0));
    foam = clamp(foam, 0.0, 1.0);
    col = mix(col, uFoam, foam);
    col += uSunColor * spec + fresnel;

    gl_FragColor = vec4(col, max(mix(0.72, 0.93, d), foam));
  }
`;

/** Animated water surface, one 33×33-vertex grid per chunk that has water. */
export class WaterLayer {
  readonly group = new Group();
  readonly material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uShallow: { value: new Color(PALETTE.waterShallow) },
      uDeep: { value: new Color(PALETTE.waterDeep) },
      uFoam: { value: new Color(PALETTE.foam) },
      uSunDir: { value: new Vector3(0, 1, 0) },
      uSunColor: { value: new Color(PALETTE.sun) },
    },
  });
  private readonly meshes = new Map<number, Mesh>();

  constructor(private readonly mirror: CityMirror) {
    this.group.name = 'water';
  }

  update(time: number, sunDir: Vector3): void {
    const uniforms = this.material.uniforms as { uTime: { value: number }; uSunDir: { value: Vector3 } };
    uniforms.uTime.value = time;
    uniforms.uSunDir.value.copy(sunDir);
  }

  rebuild(id: number): void {
    const old = this.meshes.get(id);
    if (old) {
      old.geometry.dispose();
      this.group.remove(old);
      this.meshes.delete(id);
    }
    const m = this.mirror;
    const x0 = (id % m.chunksPerSide) * CHUNK_SIZE;
    const y0 = Math.floor(id / m.chunksPerSide) * CHUNK_SIZE;

    let hasWater = false;
    for (let y = y0; y < y0 + CHUNK_SIZE && !hasWater; y++) {
      for (let x = x0; x < x0 + CHUNK_SIZE; x++) {
        if (m.tile(x, y) === TileKind.Water) {
          hasWater = true;
          break;
        }
      }
    }
    if (!hasWater) return;

    const side = CHUNK_SIZE + 1;
    const positions = new Float32Array(side * side * 3);
    const depth = new Float32Array(side * side);
    for (let j = 0; j < side; j++) {
      for (let i = 0; i < side; i++) {
        const v = j * side + i;
        positions[v * 3] = x0 + i;
        positions[v * 3 + 1] = WATER_Y;
        positions[v * 3 + 2] = y0 + j;
        depth[v] = WATER_Y - m.corner(x0 + i, y0 + j) * HEIGHT_UNIT;
      }
    }
    const index: number[] = [];
    for (let j = 0; j < CHUNK_SIZE; j++) {
      for (let i = 0; i < CHUNK_SIZE; i++) {
        const a = j * side + i;
        index.push(a, a + side, a + side + 1, a, a + side + 1, a + 1);
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('depth', new BufferAttribute(depth, 1));
    geometry.setIndex(index);
    geometry.computeBoundingSphere();

    const mesh = new Mesh(geometry, this.material);
    mesh.renderOrder = 1;
    this.meshes.set(id, mesh);
    this.group.add(mesh);
  }
}
