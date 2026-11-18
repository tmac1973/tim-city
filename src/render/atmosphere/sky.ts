import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three';

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    // Pin to the far plane so the dome never hides the scene.
    gl_Position = p.xyww;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uNight;
  uniform float uCloud;
  uniform float uFlash;
  uniform float uTime;
  varying vec3 vDir;

  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }

  void main() {
    vec3 dir = normalize(vDir);
    float h = dir.y;
    vec3 col = mix(uHorizon, uZenith, smoothstep(-0.02, 0.55, h));
    // Below the horizon: a darker haze, never a hard edge.
    col = mix(col, uHorizon * 0.8, smoothstep(0.0, -0.25, h));

    float s = max(dot(dir, uSunDir), 0.0);
    float clear = 1.0 - uCloud;
    col += uSunColor * (smoothstep(0.9994, 0.9997, s) * 6.0 + pow(s, 48.0) * 0.45 + pow(s, 6.0) * 0.12) * clear * step(-0.05, uSunDir.y);

    // Stars: sparse cells on the sphere, twinkling, only on clear nights.
    vec3 cell = floor(dir * 160.0);
    float star = step(0.9965, hash(cell));
    float twinkle = 0.6 + 0.4 * sin(uTime * 2.0 + hash(cell + 1.0) * 30.0);
    col += vec3(0.9, 0.93, 1.0) * star * twinkle * uNight * clear * smoothstep(0.02, 0.2, h) * 1.4;

    col += vec3(0.75, 0.8, 1.0) * uFlash;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** A gradient sky dome with a sun disk and stars, following the camera. */
export class Sky {
  readonly mesh: Mesh;
  readonly material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    side: BackSide,
    depthWrite: false,
    uniforms: {
      uZenith: { value: new Color() },
      uHorizon: { value: new Color() },
      uSunDir: { value: new Vector3(0, 1, 0) },
      uSunColor: { value: new Color() },
      uNight: { value: 0 },
      uCloud: { value: 0 },
      uFlash: { value: 0 },
      uTime: { value: 0 },
    },
  });

  constructor() {
    this.mesh = new Mesh(new SphereGeometry(500, 32, 16), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.name = 'sky';
  }

  get uniforms() {
    return this.material.uniforms as {
      uZenith: { value: Color };
      uHorizon: { value: Color };
      uSunDir: { value: Vector3 };
      uSunColor: { value: Color };
      uNight: { value: number };
      uCloud: { value: number };
      uFlash: { value: number };
      uTime: { value: number };
    };
  }

  follow(position: Vector3): void {
    this.mesh.position.copy(position);
  }
}
