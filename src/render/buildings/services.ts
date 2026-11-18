import { FLOOR, Kit } from './kit';
import type { Variant } from './variants';

const LAWN = 0x7fb35a;
const PATH = 0xd8c9a3;
const CONCRETE = 0xbab4a8;
const ASPHALT = 0x55595e;

const done = (k: Kit): Variant => ({ geometry: k.build(), height: k.top, emitters: [] });

function car(k: Kit, cx: number, cz: number, body: number, roof: number): void {
  k.block(cx, cz, 0.34, 0.17, 0.02, 0.08, body);
  k.block(cx - 0.02, cz, 0.18, 0.15, 0.1, 0.06, roof);
}

/** 3×3 police station with a squad car park and a flag. */
export function policeStation(): Variant {
  const k = new Kit();
  k.ground(-1.45, -1.45, 1.45, 1.45, CONCRETE);
  k.ground(-1.3, 0.45, 1.3, 1.35, ASPHALT, 0.016);
  k.block(0, -0.55, 2.3, 1.4, 0, 2 * FLOOR, 0xdfe6ee, 0x5b6b7c);
  k.windows(0, -0.55, 2.3, 1.4, 0, 2, 'punched');
  k.door(0, 0.15, 0, 0.26);
  k.block(0, 0.17, 2.3, 0.04, 0.4, 0.08, 0x2d5aa8);
  k.parapet(0, -0.55, 2.3, 1.4, 2 * FLOOR, 0xf4f1ea);
  for (const x of [-0.7, -0.2, 0.5]) car(k, x, 0.95, 0xf4f4f4, 0x23408e);
  k.cylinder(1.2, 0.25, 0.015, 0, 0.9, 0xd0d4d8, 5);
  k.block(1.12, 0.25, 0.16, 0.01, 0.76, 0.1, 0x2d5aa8);
  return done(k);
}

/** 3×3 fire station: brick hall with bay doors, a hose tower and an engine out front. */
export function fireStation(): Variant {
  const k = new Kit();
  k.ground(-1.45, -1.45, 1.45, 1.45, CONCRETE);
  k.block(-0.25, -0.45, 2.2, 1.5, 0, 2 * FLOOR, 0xa8432f, 0x5a4a42);
  k.windows(-0.25, -0.45, 2.2, 1.5, 0, 2, 'punched', 1);
  for (const x of [-0.95, -0.25, 0.45]) k.block(x, 0.31, 0.5, 0.02, 0, 0.22, 0xe9e4da);
  k.parapet(-0.25, -0.45, 2.2, 1.5, 2 * FLOOR, 0xe9e4da);
  k.block(1.1, -0.75, 0.55, 0.55, 0, 6 * FLOOR, 0xa8432f, 0x5a4a42);
  k.windows(1.1, -0.75, 0.55, 0.55, 0, 6, 'punched', 2);
  k.block(-0.25, 0.85, 0.8, 0.28, 0.02, 0.2, 0xd42a1e, 0xe8e8e8);
  k.block(-0.05, 0.85, 0.3, 0.26, 0.22, 0.08, 0xd42a1e);
  return done(k);
}

/** 1×1 pocket park: lawn, a crossing path, a tree and a bench. */
export function park(): Variant {
  const k = new Kit();
  k.ground(-0.48, -0.48, 0.48, 0.48, LAWN);
  k.ground(-0.48, -0.06, 0.48, 0.06, PATH, 0.016);
  k.ground(-0.06, -0.48, 0.06, 0.48, PATH, 0.016);
  k.tree(-0.25, -0.25, 0.7, 0x4f8f3a, false);
  k.tree(0.27, 0.26, 0.55, 0x2f6b3a, true);
  k.block(0.26, -0.22, 0.22, 0.07, 0.05, 0.04, 0x8b5a2b);
  return done(k);
}

/** 3×3 large park: a pond, winding paths, a bandstand and trees. */
export function largePark(): Variant {
  const k = new Kit();
  k.ground(-1.45, -1.45, 1.45, 1.45, LAWN);
  k.ground(-1.45, -0.08, 1.45, 0.08, PATH, 0.016);
  k.ground(-0.08, -1.45, 0.08, 1.45, PATH, 0.016);
  k.cylinder(-0.7, 0.7, 0.55, 0.0, 0.03, 0x4aa3c8, 14, 0x4aa3c8);
  k.cylinder(0.75, -0.7, 0.3, 0.0, 0.04, PATH, 10);
  for (const [dx, dz] of [[0.18, 0], [-0.18, 0], [0, 0.18], [0, -0.18]] as const) {
    k.cylinder(0.75 + dx, -0.7 + dz, 0.015, 0.04, 0.22, 0xf4f1ea, 4);
  }
  k.cylinder(0.75, -0.7, 0.3, 0.26, 0.18, 0xb5543a, 8, undefined, 0.02);
  const trees: [number, number, number, boolean][] = [
    [-1.1, -1.1, 0.8, true],
    [-0.6, -0.9, 0.65, false],
    [1.1, 0.5, 0.75, false],
    [0.6, 1.1, 0.7, true],
    [1.15, 1.15, 0.6, false],
    [-1.15, -0.4, 0.55, false],
  ];
  for (const [x, z, h, pointed] of trees) k.tree(x, z, h, pointed ? 0x2f6b3a : 0x4f8f3a, pointed);
  for (const [x, z, c] of [[0.35, 0.45, 0xe74c3c], [0.55, 0.45, 0xf1c40f], [-0.45, -0.35, 0x9b59b6]] as const) {
    k.ground(x - 0.08, z - 0.08, x + 0.08, z + 0.08, c, 0.02);
  }
  return done(k);
}
