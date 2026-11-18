import { Vector3 } from 'three';
import { FLOOR, Kit } from './kit';
import type { Variant } from './variants';

const CONCRETE = 0xc9c5bb;
const HALL = 0x8e9aa3;
const HALL_ROOF = 0x5d6d7e;
const STACK = 0xa8402f;
const WHITE = 0xf2f1ec;
const COAL = 0x2b2b2e;
const TOWER = 0xd9d6cf;

/** 4×4 coal plant: turbine hall, boiler house, coal heap and two tall stacks. */
export function coalPlant(): Variant {
  const k = new Kit();
  k.ground(-1.95, -1.95, 1.95, 1.95, 0x8d8a80);
  k.block(-0.55, -0.7, 2.4, 1.6, 0, 1.0, HALL, HALL_ROOF);
  k.windows(-0.55, -0.7, 2.4, 1.6, 0, 3, 'high');
  k.block(1.15, -0.7, 0.9, 1.3, 0, 1.6, 0x9c8f80, 0x6b5d50);
  k.windows(1.15, -0.7, 0.9, 1.3, 0, 6, 'high');
  k.hip(-1.1, 1.05, 1.4, 1.2, 0, 0.55, COAL, 0.6);
  k.block(-0.2, 0.95, 1.0, 0.12, 0.35, 0.1, 0x6f747a);
  const emitters: Vector3[] = [];
  for (const [x, z] of [[0.55, 1.2], [1.35, 1.2]] as const) {
    k.cylinder(x, z, 0.22, 0, 2.9, STACK, 10, undefined, 0.17);
    k.cylinder(x, z, 0.17, 2.9, 0.45, WHITE, 10, 0x2f2f2f, 0.16);
    emitters.push(new Vector3(x, 3.35, z));
  }
  return { geometry: k.build(), height: k.top, emitters };
}

/** 4×4 nuclear plant: two hyperbolic cooling towers and a domed reactor. */
export function nuclearPlant(): Variant {
  const k = new Kit();
  k.ground(-1.95, -1.95, 1.95, 1.95, 0xb8b4aa);
  const profile: [number, number][] = [
    [0.82, 0],
    [0.7, 0.6],
    [0.56, 1.3],
    [0.52, 1.7],
    [0.56, 2.15],
  ];
  const emitters: Vector3[] = [];
  for (const x of [-0.95, 0.95]) {
    k.lathe(x, -0.95, 0, profile, TOWER, 16);
    emitters.push(new Vector3(x, 2.25, -0.95));
  }
  k.cylinder(-0.75, 1.0, 0.6, 0, 0.75, CONCRETE, 16);
  k.lathe(-0.75, 1.0, 0.75, [[0.6, 0], [0.52, 0.25], [0.34, 0.45], [0.02, 0.56]], WHITE, 16);
  k.block(0.85, 1.0, 1.5, 1.3, 0, 3 * FLOOR, HALL, HALL_ROOF);
  k.windows(0.85, 1.0, 1.5, 1.3, 0, 3, 'high');
  return { geometry: k.build(), height: k.top, emitters, steam: true };
}

const PANEL = 0x23395e;
const PANEL_FRAME = 0x9aa3ad;

/** 4×4 solar farm: rows of tilted dark-blue panels on short posts. */
export function solarFarm(): Variant {
  const k = new Kit();
  k.ground(-1.95, -1.95, 1.95, 1.95, 0x9c9a78);
  for (let row = 0; row < 4; row++) {
    const z = -1.5 + row * 1.0;
    for (const x of [-0.95, 0.95]) {
      // A low post and a panel tilted toward the south (+z).
      k.block(x, z, 0.06, 0.06, 0, 0.18, PANEL_FRAME);
      const a = new Vector3(x - 0.85, 0.32, z - 0.3);
      const b = new Vector3(x + 0.85, 0.32, z - 0.3);
      const c = new Vector3(x + 0.85, 0.12, z + 0.3);
      const d = new Vector3(x - 0.85, 0.12, z + 0.3);
      k.quad(a, b, c, d, new Vector3(0, 1, 0.6).normalize(), PANEL);
      k.quad(d, c, b, a, new Vector3(0, -1, -0.6).normalize(), PANEL_FRAME);
    }
  }
  k.block(1.6, 1.7, 0.45, 0.35, 0, 0.3, 0xd8d4c8, 0x6b6f75);
  return { geometry: k.build(), height: k.top, emitters: [] };
}

/** Height of a wind turbine's hub; the blades turn in their own layer (see rotorGeometry). */
export const TURBINE_HUB: [number, number, number] = [0, 2.75, 0.2];

/** 1×1 wind turbine tower and nacelle, without its blades. */
export function windTurbine(): Variant {
  const k = new Kit();
  k.cylinder(0, 0, 0.12, 0, 2.7, WHITE, 10, undefined, 0.06);
  k.block(0, 0.02, 0.16, 0.42, 2.66, 0.16, WHITE, 0xe4e3de);
  k.cylinder(0, 0, 0.18, 0, 0.06, CONCRETE, 10);
  return { geometry: k.build(), height: 3.6, emitters: [] };
}

/** Three blades around a hub at the origin, turning about the z axis. */
export function rotorGeometry(): Kit {
  const k = new Kit();
  for (let b = 0; b < 3; b++) {
    const angle = (b * Math.PI * 2) / 3;
    const dir = new Vector3(Math.sin(angle), Math.cos(angle), 0);
    const side = new Vector3(Math.cos(angle), -Math.sin(angle), 0);
    const root = dir.clone().multiplyScalar(0.08);
    const tip = dir.clone().multiplyScalar(0.95);
    const a = root.clone().addScaledVector(side, 0.06);
    const c = root.clone().addScaledVector(side, -0.04);
    k.facet(a, tip, c, new Vector3(0, 0, 1), WHITE);
    k.facet(c, tip, a, new Vector3(0, 0, -1), 0xdedcd6);
  }
  k.cylinder(0, 0, 0.07, -0.05, 0.1, 0xe4e3de, 8);
  return k;
}

/** 4×4 gas plant: two white spherical tanks, a turbine hall and one short stack. */
export function gasPlant(): Variant {
  const k = new Kit();
  k.ground(-1.95, -1.95, 1.95, 1.95, 0xa09d94);
  const sphere: [number, number][] = [[0.02, 0], [0.42, 0.12], [0.6, 0.45], [0.6, 0.75], [0.42, 1.08], [0.02, 1.2]];
  for (const x of [-1.0, 0.25]) {
    k.cylinder(x, -0.9, 0.05, 0, 0.25, 0x7c7f84, 6);
    k.lathe(x, -0.9, 0.2, sphere, WHITE, 14);
  }
  k.block(0.2, 0.95, 2.6, 1.3, 0, 0.9, HALL, HALL_ROOF);
  k.windows(0.2, 0.95, 2.6, 1.3, 0, 3, 'high');
  k.cylinder(1.45, -0.6, 0.18, 0, 1.9, CONCRETE, 10, 0x3a3a3a, 0.15);
  return { geometry: k.build(), height: k.top, emitters: [new Vector3(1.45, 2.0, -0.6)] };
}

/** 4×4 oil plant: storage tanks, pipework, a tall stack and a flare. */
export function oilPlant(): Variant {
  const k = new Kit();
  k.ground(-1.95, -1.95, 1.95, 1.95, 0x7d776c);
  for (const [x, z] of [[-1.05, -1.05], [-1.05, 0.15]] as const) {
    k.cylinder(x, z, 0.55, 0, 0.7, 0xd6d2c4, 16, 0xbab5a6);
  }
  k.block(-1.05, -0.45, 0.08, 1.2, 0.3, 0.08, 0x5b5f63);
  k.block(0.65, -0.6, 1.4, 1.1, 0, 0.75, 0x8b8f93, 0x55595d);
  for (const x of [0.3, 1.0]) k.cylinder(x, -0.6, 0.12, 0.75, 1.0, 0x6c7075, 8);
  k.cylinder(1.2, 1.15, 0.22, 0, 3.2, STACK, 10, 0x2f2f2f, 0.16);
  k.cylinder(-0.35, 1.3, 0.07, 0, 2.4, 0x4b4f54, 6);
  // The flare: a small orange flame on the thin pipe.
  k.cylinder(-0.35, 1.3, 0.09, 2.4, 0.3, 0xff9a2e, 6, undefined, 0.01);
  k.block(-0.5, 1.15, 1.4, 0.1, 0.5, 0.1, 0x5b5f63);
  return {
    geometry: k.build(),
    height: k.top,
    // Three plumes (coal has two) for half again the smoke: two from the stack, one above the flare.
    emitters: [new Vector3(1.2, 3.3, 1.15), new Vector3(1.25, 3.3, 1.1), new Vector3(-0.35, 2.75, 1.3)],
  };
}
