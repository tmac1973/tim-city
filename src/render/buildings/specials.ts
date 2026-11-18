import { Vector3 } from 'three';
import { Kit } from './kit';
import type { Variant } from './variants';

const CONCRETE = 0xc9c5bb;
const ASPHALT = 0x4a4e55;
const WHITE = 0xf4f1ea;

const done = (k: Kit): Variant => ({ geometry: k.build(), height: k.top, emitters: [] });

/** 4×4 stadium: a round bowl of two-tone stands around a pitch, with floodlights. */
export function stadium(): Variant {
  const k = new Kit();
  k.ground(-1.95, -1.95, 1.95, 1.95, CONCRETE);
  k.lathe(0, 0, 0, [[1.85, 0], [1.85, 0.8]], 0xd9d4c7, 24);
  k.lathe(0, 0, 0, [[1.85, 0.8], [1.55, 0.48]], 0x2e86de, 24, true);
  k.lathe(0, 0, 0, [[1.55, 0.48], [1.25, 0.14]], 0xc0392b, 24, true);
  k.cylinder(0, 0, 1.25, 0, 0.12, 0x5aa449, 24, 0x5aa449);
  // Pitch markings.
  const y = 0.125;
  k.ground(-0.75, -0.45, 0.75, -0.42, WHITE, y);
  k.ground(-0.75, 0.42, 0.75, 0.45, WHITE, y);
  k.ground(-0.75, -0.45, -0.72, 0.45, WHITE, y);
  k.ground(0.72, -0.45, 0.75, 0.45, WHITE, y);
  k.ground(-0.015, -0.45, 0.015, 0.45, WHITE, y);
  for (const [x, z] of [[-1.62, -1.62], [1.62, -1.62], [-1.62, 1.62], [1.62, 1.62]] as const) {
    k.cylinder(x, z, 0.035, 0, 1.9, 0xd0d4d8, 5);
    k.block(x * 0.96, z * 0.96, 0.26, 0.26, 1.9, 0.1, 0xfafafa);
  }
  return done(k);
}

/**
 * 4×4 seaport: quay, warehouse, container stacks and two cranes. The quay
 * faces +z; the building layer turns it to face the water.
 */
export function seaport(): Variant {
  const k = new Kit();
  k.ground(-1.95, -1.95, 1.95, 1.95, CONCRETE);
  k.block(0, 1.93, 3.9, 0.08, 0, 0.06, 0x8a8f94);
  for (let x = -1.6; x <= 1.6; x += 0.8) k.cylinder(x, 1.85, 0.04, 0.06, 0.07, 0x2b2b2e, 6);
  k.block(0, -1.25, 3.3, 1.1, 0, 0.6, 0x8b9aa6);
  k.windows(0, -1.25, 3.3, 1.1, 0, 2, 'high');
  k.gable(0, -1.25, 3.3, 1.1, 0.6, 0.22, 0x5d6d7e, true, 0x8b9aa6);
  const colors = [0xc0392b, 0x2e86de, 0x27ae60, 0xe67e22, 0x8e44ad, 0xf1c40f];
  let c = 0;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 2; j++) {
      const stack = 1 + ((i + j) % 3);
      for (let h = 0; h < stack; h++) k.block(-1.35 + i * 0.6, -0.05 + j * 0.42, 0.5, 0.2, h * 0.17, 0.16, colors[c++ % colors.length] ?? WHITE);
    }
  }
  for (const x of [-0.9, 0.9]) {
    for (const [dx, dz] of [[-0.25, 1.1], [0.25, 1.1], [-0.25, 1.7], [0.25, 1.7]] as const) {
      k.block(x + dx, dz, 0.06, 0.06, 0, 1.25, 0xe67e22);
    }
    k.block(x, 1.4, 0.62, 0.7, 1.25, 0.1, 0xe67e22);
    // Boom out over the water.
    k.block(x, 2.25, 0.1, 1.9, 1.32, 0.08, 0xd35400);
    k.block(x, 1.15, 0.36, 0.3, 1.35, 0.22, 0xf4f1ea);
  }
  return done(k);
}

/** 6×6 airport: runway, taxiway, apron, terminal, hangar, control tower and a parked plane. */
export function airport(): Variant {
  const k = new Kit();
  k.ground(-2.95, -2.95, 2.95, 2.95, 0x86b45f);
  k.ground(-2.9, 1.55, 2.9, 2.45, ASPHALT, 0.016);
  for (let x = -2.4; x < 2.5; x += 0.6) k.ground(x, 1.98, x + 0.3, 2.02, WHITE, 0.02);
  for (const x of [-2.75, 2.55]) for (let z = 1.65; z < 2.4; z += 0.14) k.ground(x, z, x + 0.2, z + 0.06, WHITE, 0.02);
  k.ground(1.55, 0.15, 1.95, 1.55, ASPHALT, 0.016);
  k.ground(-2.6, -1.05, 2.6, 0.2, 0xb8b4aa, 0.016);
  k.block(-0.5, -1.9, 3.2, 1.3, 0, 0.55, 0xe4e7ea, 0x8f949a);
  k.windows(-0.5, -1.9, 3.2, 1.3, 0, 2, 'curtain');
  k.gable(-2.3, -1.9, 1.0, 1.1, 0.42, 0.25, 0x7b8a8b, false, 0xa9b4bb);
  k.block(-2.3, -1.9, 1.0, 1.1, 0, 0.42, 0xa9b4bb);
  k.cylinder(2.25, -2.2, 0.17, 0, 1.4, 0xe4e7ea, 8);
  k.cylinder(2.25, -2.2, 0.3, 1.4, 0.24, 0x4a6f8f, 8, 0x8f949a, 0.34);
  // A parked airliner on the apron.
  k.block(0.6, -0.4, 1.0, 0.14, 0.08, 0.14, WHITE);
  k.block(0.65, -0.4, 0.2, 1.0, 0.12, 0.03, WHITE);
  k.block(0.18, -0.4, 0.1, 0.03, 0.2, 0.22, 0x2e86de);
  k.block(0.6, -0.4, 0.9, 0.15, 0.12, 0.03, 0x2e86de);
  return done(k);
}

const STONE = 0xe6dfcf;
const BRICK = 0xa45a3f;
const ROOF_GREY = 0x6b7078;
const LAWN = 0x7fb35a;
const PATH_STONE = 0xd8c9a3;

/** Columns along the front (+z) of a building, from x0 to x1. */
function colonnade(k: Kit, x0: number, x1: number, z: number, h: number, n: number): void {
  for (let c = 0; c < n; c++) k.cylinder(x0 + ((x1 - x0) * c) / (n - 1), z, 0.06, 0.12, h, STONE, 8);
}

/** 3×3 City Hall: steps, a columned front and a dome. */
export function cityHall(): Variant {
  const k = new Kit();
  k.ground(-1.45, -1.45, 1.45, 1.45, CONCRETE);
  k.block(0, 0.95, 2.2, 0.4, 0, 0.12, STONE);
  k.block(0, -0.2, 2.2, 1.6, 0.12, 0.85, STONE, 0xcfc7b5);
  k.windows(0, -0.2, 2.2, 1.6, 0.12, 3, 'punched');
  colonnade(k, -0.9, 0.9, 0.7, 0.8, 6);
  k.block(0, 0.7, 2.0, 0.2, 0.92, 0.1, STONE);
  k.gable(0, 0.7, 2.0, 0.22, 1.02, 0.25, STONE, true);
  k.cylinder(0, -0.2, 0.42, 0.97, 0.3, STONE, 16);
  k.lathe(0, -0.2, 1.27, [[0.42, 0], [0.36, 0.2], [0.22, 0.36], [0.02, 0.44]], 0x7fae9b, 16);
  return done(k);
}

/** 3×3 hospital: a white block with a red cross and a rooftop helipad. */
export function hospital(): Variant {
  const k = new Kit();
  k.ground(-1.45, -1.45, 1.45, 1.45, CONCRETE);
  k.block(-0.25, -0.2, 2.2, 1.8, 0, 1.3, WHITE, 0xd8d8d4);
  k.windows(-0.25, -0.2, 2.2, 1.8, 0, 5, 'band');
  k.block(0.95, 0.85, 0.7, 0.8, 0, 0.5, WHITE, 0xd8d8d4);
  k.windows(0.95, 0.85, 0.7, 0.8, 0, 2, 'shop');
  // The cross on the front, and the helipad.
  k.block(-0.25, 0.71, 0.36, 0.02, 0.85, 0.12, 0xd63031);
  k.block(-0.25, 0.71, 0.12, 0.02, 0.73, 0.36, 0xd63031);
  k.cylinder(-0.25, -0.2, 0.5, 1.3, 0.03, 0x5b6068, 16);
  k.ground(-0.4, -0.25, -0.1, -0.15, WHITE, 1.34);
  return done(k);
}

/** 4×4 university: brick halls around a green quad, and a spired clock tower. */
export function university(): Variant {
  const k = new Kit();
  k.ground(-1.95, -1.95, 1.95, 1.95, LAWN);
  k.ground(-0.2, -1.95, 0.2, 1.95, PATH_STONE);
  k.block(0, -1.45, 3.4, 0.8, 0, 0.75, BRICK, ROOF_GREY);
  k.windows(0, -1.45, 3.4, 0.8, 0, 3, 'punched');
  k.gable(0, -1.45, 3.4, 0.8, 0.75, 0.35, ROOF_GREY, true, BRICK);
  for (const x of [-1.45, 1.45]) {
    k.block(x, 0.3, 0.8, 2.2, 0, 0.6, BRICK, ROOF_GREY);
    k.windows(x, 0.3, 0.8, 2.2, 0, 2, 'punched');
    k.gable(x, 0.3, 0.8, 2.2, 0.6, 0.3, ROOF_GREY, false, BRICK);
  }
  k.block(0, -1.45, 0.45, 0.45, 0.75, 0.9, BRICK);
  k.block(0, -1.22, 0.2, 0.02, 1.3, 0.2, 0xf4f1ea);
  k.cylinder(0, -1.45, 0.3, 1.65, 0.55, ROOF_GREY, 4, undefined, 0.01);
  for (const [x, z] of [[-0.7, 0.6], [0.7, 1.2]] as const) k.tree(x, z, 0.7, 0x4f8a3a, false);
  return done(k);
}


/** 3×3 museum: a stepped classical front with a pediment. */
export function museum(): Variant {
  const k = new Kit();
  k.ground(-1.45, -1.45, 1.45, 1.45, CONCRETE);
  k.block(0, 0.9, 2.4, 0.6, 0, 0.08, STONE);
  k.block(0, 0.75, 2.2, 0.4, 0.08, 0.08, STONE);
  k.block(0, -0.25, 2.4, 1.7, 0, 0.95, STONE, 0xcfc7b5);
  colonnade(k, -0.95, 0.95, 0.65, 0.85, 8);
  k.block(0, 0.65, 2.2, 0.22, 0.97, 0.1, STONE);
  k.gable(0, 0.65, 2.2, 0.24, 1.07, 0.32, STONE, true);
  return done(k);
}

/** 4×4 zoo: fenced paddocks with trees, a pond and a few animals. */
export function zoo(): Variant {
  const k = new Kit();
  k.ground(-1.95, -1.95, 1.95, 1.95, 0x8fbf5f);
  k.ground(-0.12, -1.95, 0.12, 1.95, PATH_STONE, 0.016);
  k.ground(-1.95, -0.12, 1.95, 0.12, PATH_STONE, 0.016);
  for (let s = -1.85; s <= 1.85; s += 0.37) {
    for (const [x, z] of [[s, -0.25], [s, 0.25], [-0.25, s], [0.25, s]] as const) k.block(x, z, 0.03, 0.03, 0, 0.14, 0x7a5a3a);
  }
  k.cylinder(1.0, 1.0, 0.55, 0, 0.02, 0x3d8fd1, 14);
  for (const [x, z] of [[-1.2, -1.3], [-0.6, -0.9], [1.3, -1.1], [-1.1, 1.2]] as const) k.tree(x, z, 0.6, 0x4f8a3a, false);
  // An elephant (grey), a giraffe (yellow, tall) and a zebra (white).
  k.block(-1.0, 0.9, 0.3, 0.18, 0.12, 0.2, 0x8d8f93);
  k.block(-0.8, 0.9, 0.1, 0.1, 0.22, 0.12, 0x8d8f93);
  k.block(1.1, -0.8, 0.2, 0.1, 0.18, 0.14, 0xe0b44a);
  k.block(1.18, -0.8, 0.05, 0.05, 0.3, 0.35, 0xe0b44a);
  k.block(0.9, 1.6, 0.22, 0.1, 0.1, 0.12, 0xf2f2f2);
  return done(k);
}

/** Wheel of the amusement park's Ferris wheel, about its hub (see amusementPark). */
export const FERRIS_HUB: [number, number, number] = [-0.8, 1.35, -0.6];

/** 4×4 amusement park: a coaster loop, tents and the stand of a Ferris wheel (the wheel turns in its own layer). */
export function amusementPark(): Variant {
  const k = new Kit();
  k.ground(-1.95, -1.95, 1.95, 1.95, 0x9bc46a);
  k.ground(-1.95, 0.6, 1.95, 0.85, PATH_STONE, 0.016);
  // The wheel's A-frame stand.
  const [hx, hy, hz] = FERRIS_HUB;
  for (const dx of [-0.45, 0.45]) {
    k.cylinder(hx + dx, hz - 0.12, 0.04, 0, hy, 0xd0d4d8, 6, undefined, 0.03);
    k.cylinder(hx + dx, hz + 0.12, 0.04, 0, hy, 0xd0d4d8, 6, undefined, 0.03);
  }
  // Coaster: posts and a loop of track.
  for (let a = 0; a < 12; a++) {
    const ang = (a / 12) * Math.PI * 2;
    const x = 0.9 + Math.cos(ang) * 0.75;
    const z = -0.7 + Math.sin(ang) * 0.55;
    const h = 0.4 + 0.35 * (1 + Math.sin(ang * 2));
    k.cylinder(x, z, 0.03, 0, h, 0x9aa3ad, 4);
    k.block(x, z, 0.16, 0.16, h, 0.04, 0xd63031);
  }
  // Striped tents.
  for (const [x, z, c] of [[-1.2, 1.4, 0xd63031], [0, 1.45, 0x2e86de], [1.2, 1.4, 0xf5c542]] as const) {
    k.cylinder(x, z, 0.38, 0, 0.3, WHITE, 10);
    k.cylinder(x, z, 0.42, 0.3, 0.35, c, 10, undefined, 0.02);
  }
  return done(k);
}

/** The Ferris wheel itself: two rims with spokes and cars, turning about the x axis. */
export function ferrisWheel(): Kit {
  const k = new Kit();
  const r = 1.05;
  const n = 16;
  const at = (a: number, rr: number, x: number) => new Vector3(x, Math.cos(a) * rr, Math.sin(a) * rr);
  for (let s = 0; s < n; s++) {
    const a0 = (s / n) * Math.PI * 2;
    const a1 = ((s + 1) / n) * Math.PI * 2;
    for (const x of [-0.12, 0.12]) {
      // A flat band for each rim segment, facing out from the hub.
      const out = at((a0 + a1) / 2, 1, 0);
      k.quad(at(a0, r, x - 0.03), at(a1, r, x - 0.03), at(a1, r, x + 0.03), at(a0, r, x + 0.03), out, 0xf4f1ea);
      k.quad(at(a0, r, x + 0.03), at(a1, r, x + 0.03), at(a1, r, x - 0.03), at(a0, r, x - 0.03), out.clone().negate(), 0xf4f1ea);
      // A spoke, as a thin strip from the hub to the rim, seen from both sides.
      if (s % 2 === 0) {
        const side = new Vector3(1, 0, 0);
        k.quad(at(a0, 0.05, x - 0.015), at(a0, r, x - 0.015), at(a0, r, x + 0.015), at(a0, 0.05, x + 0.015), at(a0 + Math.PI / 2, 1, 0), 0xd0d4d8);
        k.quad(at(a0, 0.05, x + 0.015), at(a0, r, x + 0.015), at(a0, r, x - 0.015), at(a0, 0.05, x - 0.015), side.clone().negate(), 0xd0d4d8);
      }
    }
    if (s % 2 === 0) {
      const c = at(a0, r, 0);
      k.box(-0.1, c.y - 0.2, c.z - 0.07, 0.1, c.y - 0.05, c.z + 0.07, [0xd63031, 0x2e86de, 0xf5c542][(s / 2) % 3] ?? WHITE);
    }
  }
  k.box(-0.16, -0.06, -0.06, 0.16, 0.06, 0.06, 0xd0d4d8);
  return k;
}

/** 1×1 statue: a figure on a plinth. */
export function statue(): Variant {
  const k = new Kit();
  k.ground(-0.48, -0.48, 0.48, 0.48, PATH_STONE);
  k.block(0, 0, 0.42, 0.42, 0, 0.35, STONE);
  k.block(0, 0, 0.16, 0.12, 0.35, 0.35, 0x6f8f7e);
  k.cylinder(0, 0, 0.07, 0.7, 0.14, 0x6f8f7e, 8);
  k.block(0.12, 0, 0.18, 0.05, 0.6, 0.05, 0x6f8f7e);
  return done(k);
}

/** 2×2 clock tower: a tall square tower whose clock faces light up at night. */
export function clockTower(): Variant {
  const k = new Kit();
  k.ground(-0.95, -0.95, 0.95, 0.95, PATH_STONE);
  k.block(0, 0, 0.7, 0.7, 0, 2.4, BRICK);
  k.block(0, 0, 0.8, 0.8, 2.4, 0.08, STONE);
  // Four glowing faces (glow 1.99: lit almost every night).
  for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
    const cx = nx * 0.36;
    const cz = nz * 0.36;
    const ux = nz !== 0 ? 0.2 : 0;
    const uz = nx !== 0 ? 0.2 : 0;
    const v = (sx: number, y: number) => new Vector3(cx + ux * sx + nx * 0.01, y, cz + uz * sx + nz * 0.01);
    k.quad(v(-1, 1.9), v(1, 1.9), v(1, 2.3), v(-1, 2.3), new Vector3(nx, 0, nz), 0xf5eccf, 1.99);
  }
  k.cylinder(0, 0, 0.5, 2.48, 0.6, ROOF_GREY, 4, undefined, 0.01);
  return done(k);
}

/** 2×2 "TIM" sign: big letters on a scaffold, lit at night. */
export function timSign(): Variant {
  const k = new Kit();
  k.ground(-0.95, -0.95, 0.95, 0.95, 0x7a8f5a);
  for (const x of [-0.8, 0, 0.8]) k.cylinder(x, -0.2, 0.03, 0, 0.6, 0x7a7f86, 5);
  k.block(0, -0.2, 1.8, 0.06, 0.55, 0.05, 0x7a7f86);
  const LETTER = 0xfff6d8;
  const glowBox = (x: number, y: number, w: number, h: number) => {
    const z = -0.17;
    const v = (px: number, py: number) => new Vector3(px, py, z);
    k.box(x - w / 2, y, z - 0.05, x + w / 2, y + h, z, LETTER);
    k.quad(v(x - w / 2, y), v(x + w / 2, y), v(x + w / 2, y + h), v(x - w / 2, y + h), new Vector3(0, 0, 1), LETTER, 1.99);
  };
  // T
  glowBox(-0.6, 1.25, 0.5, 0.1);
  glowBox(-0.6, 0.6, 0.1, 0.65);
  // I
  glowBox(0, 0.6, 0.1, 0.75);
  // M
  glowBox(0.4, 0.6, 0.1, 0.75);
  glowBox(0.8, 0.6, 0.1, 0.75);
  glowBox(0.5, 1.1, 0.1, 0.25);
  glowBox(0.7, 1.1, 0.1, 0.25);
  glowBox(0.6, 0.98, 0.1, 0.2);
  return done(k);
}
