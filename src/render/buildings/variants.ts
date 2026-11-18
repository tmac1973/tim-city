import type { BufferGeometry } from 'three';
import { Vector3 } from 'three';
import { MAX_DENSITY, ZoneType } from '@/shared/tiles';
import { Rng } from '@/sim/rng';
import { FLOOR, Kit } from './kit';

/** One ready-to-instance building. */
export interface Variant {
  geometry: BufferGeometry;
  /** Height of the tallest point, for markers above the roof. */
  height: number;
  /** Chimney and stack tops, in local space, where smoke rises. */
  emitters: Vector3[];
  /** White steam instead of grey smoke. */
  steam?: boolean;
}

export const VARIANTS_PER_CELL = 2;
export const LAND_VALUE_CLASSES = 4;

export function variantKey(type: ZoneType, density: number, landValue: number, variant: number): number {
  return ((type * (MAX_DENSITY + 1) + density) * LAND_VALUE_CLASSES + landValue) * VARIANTS_PER_CELL + variant;
}

const RES_WALLS = [0xf2e6d0, 0xe8d6b5, 0xd9e4ea, 0xf0e2a8, 0xc9826b, 0xf5f2ea, 0xb9c9a6, 0xe3c4b0];
const RES_ROOFS = [0xb5543a, 0x6b6f78, 0x7a4b36, 0x4f5d6e, 0x8c3b2e];
const COM_WALLS = [0xd8d6d0, 0xc6ccd3, 0xe4ddd0, 0xb7c3cc, 0xd6cbb8];
const TOWER_GLASS = [0x8fb3cf, 0x7fa6b5, 0x9eb1c4, 0xa6c2c9];
const SIGNS = [0xe74c3c, 0xf1c40f, 0x27ae60, 0x2e86de, 0x8e44ad, 0xe67e22];
const IND_WALLS = [0x9aa1a6, 0x8b7d6b, 0x7f8c8d, 0xa89f91, 0x6e7f8f, 0xb3a28c];
const IND_ROOFS = [0x5d6d7e, 0x7b8a8b, 0x6b5d50];
const LAWN = 0x7fb35a;
const PLAZA = 0xbab4a8;
const PARKING = 0x55595e;
const YARD = 0x8d8a80;
const TRIM = 0xf4f1ea;
const STACK = 0xa8402f;
const TANK = 0xe6e6e2;
const ROOF_UNIT = 0x9aa0a6;

const pick = <T>(rng: Rng, list: readonly T[]): T => list[rng.nextInt(list.length)] ?? (list[0] as T);
const range = (rng: Rng, lo: number, hi: number) => lo + rng.nextFloat() * (hi - lo);

function house(k: Kit, rng: Rng, cx: number, cz: number, lv: number, floors: number): void {
  const w = range(rng, 0.75, 1.0) + lv * 0.03;
  const d = range(rng, 0.7, 0.9);
  const h = floors * FLOOR;
  const wall = pick(rng, RES_WALLS);
  k.block(cx, cz, w, d, 0, h, wall);
  k.windows(cx, cz, w, d, 0, floors, 'punched');
  k.door(cx, cz + d / 2, 0);
  k.gable(cx, cz, w, d, h, 0.22 + rng.nextFloat() * 0.1, pick(rng, RES_ROOFS), rng.nextFloat() < 0.5, wall);
  // A garage on the side facing the middle of the lot, so it never leaves the lot.
  const inward = cx > 0 ? -1 : 1;
  if (lv >= 2 && rng.nextFloat() < 0.6) k.block(cx + inward * (w / 2 + 0.16), cz + d / 2 - 0.2, 0.3, 0.4, 0, 0.18, TRIM);
}

function residential(k: Kit, rng: Rng, density: number, lv: number): void {
  k.ground(-1.45, -1.45, 1.45, 1.45, LAWN);
  if (density <= 3) {
    const slots: [number, number][][] = [
      [],
      [[-0.65, -0.35], [0.7, 0.45]],
      [[-0.75, -0.7], [0.75, -0.7], [0, 0.75]],
      [[-0.72, -0.72], [0.72, -0.72], [-0.72, 0.72], [0.72, 0.72]],
    ];
    for (const [x, z] of slots[density] ?? []) house(k, rng, x, z, lv, density >= 3 || rng.nextFloat() < 0.25 + lv * 0.1 ? 2 : 1);
    return;
  }
  if (density === 4) {
    // Two terraces of three attached homes.
    for (const z of [-0.65, 0.65]) {
      const roof = pick(rng, RES_ROOFS);
      for (let i = 0; i < 3; i++) {
        const x = -0.88 + i * 0.88;
        k.block(x, z, 0.86, 0.9, 0, 2 * FLOOR, pick(rng, RES_WALLS));
        k.windows(x, z, 0.86, 0.9, 0, 2, 'punched');
        k.door(x, z + 0.45, 0);
      }
      k.gable(0, z, 2.62, 0.9, 2 * FLOOR, 0.26, roof, true);
    }
    return;
  }
  if (density <= 6) {
    // Walk-up apartments, an L of two wings with a flat roof.
    const floors = 3 + (density - 5) * 2 + (lv >= 2 ? 1 : 0) + rng.nextInt(2);
    const wall = pick(rng, RES_WALLS);
    const h = floors * FLOOR;
    k.block(-0.25, -0.45, 2.3, 1.4, 0, h, wall, 0x8a8f94);
    k.windows(-0.25, -0.45, 2.3, 1.4, 0, floors, 'punched');
    k.parapet(-0.25, -0.45, 2.3, 1.4, h, TRIM);
    const wingFloors = Math.max(2, floors - 1 - rng.nextInt(2));
    k.block(0.6, 0.7, 1.2, 1.1, 0, wingFloors * FLOOR, wall, 0x8a8f94);
    k.windows(0.6, 0.7, 1.2, 1.1, 0, wingFloors, 'punched');
    k.block(0.2, -0.6, 0.4, 0.3, h, 0.16, ROOF_UNIT);
    k.block(-0.25, 0.3, 0.5, 0.1, 0.24, 0.04, TRIM);
    return;
  }
  // Towers on a podium; nicer areas get taller towers and balconies.
  const floors = density === 7 ? 9 + lv + rng.nextInt(3) : 13 + lv * 2 + rng.nextInt(3);
  const wall = pick(rng, RES_WALLS);
  k.block(0, 0, 2.7, 2.7, 0, 2 * FLOOR, TRIM, 0x9aa0a6);
  k.windows(0, 0, 2.7, 2.7, 0, 2, 'shop');
  const tw = rng.nextFloat() < 0.5 ? 1.5 : 1.7;
  const base = 2 * FLOOR;
  k.block(0, 0, tw, tw, base, floors * FLOOR, wall, 0x8a8f94);
  k.windows(0, 0, tw, tw, base, floors, 'band');
  if (lv >= 2) {
    for (let f = 2; f < floors; f += 2) k.block(0, tw / 2 + 0.06, tw * 0.8, 0.12, base + f * FLOOR, 0.025, TRIM);
  }
  const top = base + floors * FLOOR;
  k.block(0, 0, tw * 0.6, tw * 0.6, top, 0.3, wall, 0x7b8188);
  k.parapet(0, 0, tw, tw, top, TRIM);
}

function shop(k: Kit, rng: Rng, cx: number, cz: number, w: number, d: number, floors: number): void {
  const wall = pick(rng, COM_WALLS);
  const h = floors * FLOOR;
  k.block(cx, cz, w, d, 0, h, wall, 0x8f949a);
  k.windows(cx, cz, w, d, 0, 1, 'shop');
  if (floors > 1) k.windows(cx, cz, w, d, 0, floors, 'punched', 1);
  const sign = pick(rng, SIGNS);
  k.block(cx, cz + d / 2 + 0.08, w * 0.95, 0.16, 0.2, 0.03, sign);
  k.block(cx, cz + d / 2 - 0.02, w * 0.6, 0.04, h, 0.14, sign);
  k.parapet(cx, cz, w, d, h, TRIM);
}

function commercial(k: Kit, rng: Rng, density: number, lv: number): void {
  k.ground(-1.45, -1.45, 1.45, 1.45, PLAZA);
  if (density <= 3) {
    k.ground(-1.4, 0.55, 1.4, 1.4, PARKING, 0.016);
    if (density === 1) shop(k, rng, 0, -0.35, 2.2, 1.3, 1);
    else if (density === 2) {
      shop(k, rng, -0.68, -0.35, 1.25, 1.3, 1);
      shop(k, rng, 0.68, -0.35, 1.25, 1.3, 1 + rng.nextInt(2));
    } else shop(k, rng, 0, -0.3, 2.6, 1.6, 2 + (lv >= 2 ? 1 : 0));
    return;
  }
  if (density <= 6) {
    // Office blocks with ribbon windows; the biggest step back near the top.
    const floors = 4 + (density - 4) * 2 + lv + rng.nextInt(2);
    const wall = pick(rng, COM_WALLS);
    const w = range(rng, 2.0, 2.4);
    k.block(0, 0, w, w, 0, floors * FLOOR, wall, 0x8f949a);
    k.windows(0, 0, w, w, 0, 1, 'shop');
    k.windows(0, 0, w, w, 0, floors, 'band', 1);
    let top = floors * FLOOR;
    if (density === 6) {
      const extra = 3 + rng.nextInt(2);
      k.block(0, 0, w * 0.7, w * 0.7, top, extra * FLOOR, wall, 0x8f949a);
      k.windows(0, 0, w * 0.7, w * 0.7, top, extra, 'band');
      top += extra * FLOOR;
    }
    k.block(0.3, -0.2, 0.5, 0.4, top, 0.18, ROOF_UNIT);
    k.parapet(0, 0, density === 6 ? w * 0.7 : w, density === 6 ? w * 0.7 : w, top, TRIM);
    return;
  }
  // Glass towers on a podium; the tallest get a spire.
  const floors = density === 7 ? 14 + lv * 2 + rng.nextInt(3) : 20 + lv * 2 + rng.nextInt(4);
  const glass = pick(rng, TOWER_GLASS);
  k.block(0, 0, 2.7, 2.7, 0, 3 * FLOOR, pick(rng, COM_WALLS), 0x9aa0a6);
  k.windows(0, 0, 2.7, 2.7, 0, 3, 'shop');
  const tw = range(rng, 1.5, 1.8);
  const base = 3 * FLOOR;
  const lower = Math.round(floors * 0.65);
  k.block(0, 0, tw, tw, base, lower * FLOOR, glass, 0x7b8188);
  k.windows(0, 0, tw, tw, base, lower, 'curtain');
  const upper = floors - lower;
  const uw = tw * 0.78;
  k.block(0, 0, uw, uw, base + lower * FLOOR, upper * FLOOR, glass, 0x7b8188);
  k.windows(0, 0, uw, uw, base + lower * FLOOR, upper, 'curtain');
  const top = base + floors * FLOOR;
  if (density === 8) k.cylinder(0, 0, 0.04, top, 0.9 + rng.nextFloat() * 0.5, 0xd0d4d8, 6, undefined, 0.01);
  else k.block(0, 0, uw * 0.5, uw * 0.5, top, 0.25, 0x8f949a);
}

/** A red-and-white smokestack; returns the top, where smoke comes out. */
function stack(k: Kit, cx: number, cz: number, r: number, h: number, y0 = 0): Vector3 {
  k.cylinder(cx, cz, r, y0, h * 0.82, STACK, 8, undefined, r * 0.85);
  k.cylinder(cx, cz, r * 0.85, y0 + h * 0.82, h * 0.18, TRIM, 8, 0x333333);
  return new Vector3(cx, y0 + h, cz);
}

function shed(k: Kit, rng: Rng, cx: number, cz: number, w: number, d: number, h: number): void {
  const wall = pick(rng, IND_WALLS);
  k.block(cx, cz, w, d, 0, h, wall);
  k.windows(cx, cz, w, d, 0, 1, 'high');
  k.gable(cx, cz, w, d, h, 0.18, pick(rng, IND_ROOFS), rng.nextFloat() < 0.5, wall);
}

/** Factory hall with a sawtooth roof of north lights. */
function hall(k: Kit, rng: Rng, cx: number, cz: number, w: number, d: number, h: number): void {
  const wall = pick(rng, IND_WALLS);
  const roof = pick(rng, IND_ROOFS);
  k.block(cx, cz, w, d, 0, h, wall, roof);
  k.windows(cx, cz, w, d, 0, Math.max(1, Math.floor(h / FLOOR)), 'high');
  const teeth = Math.max(2, Math.round(w / 0.5));
  const tw = w / teeth;
  for (let i = 0; i < teeth; i++) k.gable(cx - w / 2 + tw * (i + 0.5), cz, tw - 0.04, d - 0.04, h, 0.16, roof, false);
}

function industrial(k: Kit, rng: Rng, density: number, lv: number): Vector3[] {
  k.ground(-1.45, -1.45, 1.45, 1.45, YARD);
  const emitters: Vector3[] = [];
  const containers = (n: number, z: number) => {
    for (let i = 0; i < n; i++) k.block(-1.1 + i * 0.42, z, 0.36, 0.18, 0, 0.16, pick(rng, SIGNS));
  };
  switch (density) {
    case 1:
      shed(k, rng, -0.2, -0.3, 1.8, 1.3, 0.45);
      containers(3, 0.95);
      break;
    case 2:
      shed(k, rng, -0.7, -0.4, 1.3, 1.6, 0.5);
      shed(k, rng, 0.8, 0.2, 1.1, 1.9, 0.42);
      break;
    case 3:
      k.block(0, -0.2, 2.6, 2.0, 0, 0.62, pick(rng, IND_WALLS), pick(rng, IND_ROOFS));
      k.windows(0, -0.2, 2.6, 2.0, 0, 2, 'high');
      containers(5, 1.2);
      break;
    case 4:
      hall(k, rng, -0.3, -0.2, 2.1, 1.8, 0.7);
      emitters.push(stack(k, 1.05, 0.9, 0.12, 1.7));
      break;
    case 5:
      hall(k, rng, -0.35, -0.35, 2.0, 1.7, 0.8);
      emitters.push(stack(k, 1.05, -0.9, 0.13, 1.9));
      k.cylinder(0.85, 0.9, 0.42, 0, 0.7, TANK, 12, 0xcfcfca);
      break;
    case 6:
      hall(k, rng, -0.45, -0.6, 1.8, 1.4, 0.75);
      hall(k, rng, -0.45, 0.85, 1.8, 0.9, 0.6);
      for (let i = 0; i < 3; i++) k.cylinder(0.95, -0.95 + i * 0.6, 0.24, 0, 1.3, TANK, 10, 0xb9b9b4);
      emitters.push(stack(k, 0.95, 1.05, 0.12, 2.0));
      break;
    default: {
      // Heavy industry: a big works with several stacks and tanks.
      hall(k, rng, -0.4, -0.5, 2.1, 1.6, 0.95 + lv * 0.05);
      const stacks = density === 7 ? 2 : 3;
      for (let i = 0; i < stacks; i++) emitters.push(stack(k, 1.05, -1.0 + i * 0.7, 0.14, 2.2 + i * 0.25 + lv * 0.1));
      k.cylinder(-0.75, 0.95, 0.45, 0, 0.9, TANK, 12, 0xcfcfca);
      k.cylinder(0.25, 0.95, 0.35, 0, 0.75, TANK, 12, 0xcfcfca);
      k.block(-0.25, 0.95, 0.9, 0.08, 0.6, 0.08, 0x777b80);
    }
  }
  return emitters;
}

/** Build every zone building: 3 types × 8 densities × 4 land-value classes × 2 variants. */
export function buildVariants(): Map<number, Variant> {
  const out = new Map<number, Variant>();
  for (const type of [ZoneType.R, ZoneType.C, ZoneType.I]) {
    for (let density = 1; density <= MAX_DENSITY; density++) {
      for (let lv = 0; lv < LAND_VALUE_CLASSES; lv++) {
        for (let v = 0; v < VARIANTS_PER_CELL; v++) {
          const rng = new Rng(`building/${String(type)}/${String(density)}/${String(lv)}/${String(v)}`);
          const k = new Kit();
          let emitters: Vector3[] = [];
          if (type === ZoneType.R) residential(k, rng, density, lv);
          else if (type === ZoneType.C) commercial(k, rng, density, lv);
          else emitters = industrial(k, rng, density, lv);
          out.set(variantKey(type, density, lv, v), { geometry: k.build(), height: k.top, emitters });
        }
      }
    }
  }
  return out;
}
