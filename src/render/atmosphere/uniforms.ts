import { Color, type LineBasicMaterial, type MeshBasicMaterial, type MeshStandardMaterial } from 'three';

/**
 * Uniforms shared by every patched material, so one update per frame
 * reaches terrain, trees and buildings alike.
 */
export const ATMOSPHERE = {
  /** 0 by day … 1 at full night: lights windows. */
  uNight: { value: 0 },
  /** Snow cover on upward faces, 0–1. */
  uSnow: { value: 0 },
  /** Autumn colour on leaves, 0–1. */
  uAutumn: { value: 0 },
  /** Daylight level 0–1 for unlit shaders (water, smoke). */
  uLight: { value: 1 },
  /** Seconds, for window flicker. */
  uClock: { value: 0 },
  uSnowColor: { value: new Color(0xf4f7fb) },
  uWindowColor: { value: new Color(1, 0.78, 0.45) },
};

/**
 * Unlit, vertex-coloured materials (zone lot fills, flood sheets) that
 * should darken with the daylight; their colour is set to the light level.
 */
export const DAYLIT = new Set<MeshBasicMaterial | LineBasicMaterial>();

export interface PatchOptions {
  /** Snow settles on faces that point up. */
  snow?: boolean;
  /** Leaves (green-dominant colours) turn orange and red. */
  autumn?: boolean;
  /** Vertices with a `glow` attribute are windows that light up at night. */
  windows?: boolean;
}

/**
 * Patch a MeshStandardMaterial for seasons and night lighting. Works with
 * plain, instanced and batched meshes: it computes its own world position
 * and a per-instance seed from the instance or batch matrix.
 */
export function patchMaterial(material: MeshStandardMaterial, options: PatchOptions): void {
  const key = `atmo:${options.snow ? 's' : ''}${options.autumn ? 'a' : ''}${options.windows ? 'w' : ''}`;
  material.customProgramCacheKey = () => key;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, ATMOSPHERE);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vAtmoWorld;
        varying float vAtmoSeed;
        ${options.windows ? 'attribute float glow; varying float vGlow;' : ''}`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 atmoWorld = vec4(transformed, 1.0);
          #ifdef USE_BATCHING
            atmoWorld = batchingMatrix * atmoWorld;
            vec3 atmoOrigin = batchingMatrix[3].xyz;
          #elif defined(USE_INSTANCING)
            atmoWorld = instanceMatrix * atmoWorld;
            vec3 atmoOrigin = instanceMatrix[3].xyz;
          #else
            vec3 atmoOrigin = vec3(0.0);
          #endif
          atmoWorld = modelMatrix * atmoWorld;
          vAtmoWorld = atmoWorld.xyz;
          vAtmoSeed = fract(sin(dot(atmoOrigin.xz, vec2(12.9898, 78.233))) * 43758.5453);
          ${options.windows ? 'vGlow = glow;' : ''}
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uNight;
        uniform float uSnow;
        uniform float uAutumn;
        uniform float uClock;
        uniform vec3 uSnowColor;
        uniform vec3 uWindowColor;
        varying vec3 vAtmoWorld;
        varying float vAtmoSeed;
        ${options.windows ? 'varying float vGlow;' : ''}
        float atmoHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`,
      )
      .replace(
        '#include <lights_physical_fragment>',
        `{
          ${
            options.autumn
              ? `float leafy = smoothstep(0.02, 0.12, diffuseColor.g - max(diffuseColor.r, diffuseColor.b));
          float hue = atmoHash(floor(vAtmoWorld.xz * 0.7) + vAtmoSeed);
          vec3 autumnColor = mix(vec3(0.86, 0.46, 0.12), vec3(0.72, 0.18, 0.09), hue);
          autumnColor = mix(autumnColor, vec3(0.88, 0.7, 0.18), step(0.7, hue));
          diffuseColor.rgb = mix(diffuseColor.rgb, autumnColor * (0.6 + 0.6 * dot(diffuseColor.rgb, vec3(0.33))), uAutumn * leafy * step(0.25, atmoHash(vec2(vAtmoSeed, 3.1))));`
              : ''
          }
          ${
            options.snow
              ? `vec3 upView = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
          float facingUp = smoothstep(0.55, 0.85, dot(normal, upView));
          diffuseColor.rgb = mix(diffuseColor.rgb, uSnowColor, uSnow * facingUp);`
              : ''
          }
          ${
            options.windows
              ? `if (vGlow > 0.0) {
            // Commercial glass (glow ≥ 1) is lit more often than homes.
            float chance = vGlow >= 1.0 ? 0.72 : 0.45;
            float epoch = floor(uClock / 23.0 + vAtmoSeed * 7.0);
            float r = fract(vGlow * 13.71 + vAtmoSeed * 5.3 + epoch * 0.371);
            float lit = step(r, chance) * uNight;
            totalEmissiveRadiance += uWindowColor * (1.6 + 1.2 * fract(r * 7.0)) * lit;
          }`
              : ''
          }
        }
        #include <lights_physical_fragment>`,
      );
  };
  material.needsUpdate = true;
}
