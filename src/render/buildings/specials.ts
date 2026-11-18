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
