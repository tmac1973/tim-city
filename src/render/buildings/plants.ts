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
