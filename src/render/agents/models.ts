import { type BufferGeometry, CapsuleGeometry, Color } from 'three';
import { TriangleBuilder } from '../geometry';

/**
 * Low-poly agent models. Each faces +x with its wheels at y = 0. White parts
 * take the instance colour (a car's paint); other parts keep their own
 * colour multiplied by it, so glass and tyres stay dark on any paint.
 */
const WHITE = new Color(1, 1, 1);
const GLASS = new Color(0.16, 0.19, 0.24);
const TYRE = new Color(0.08, 0.08, 0.09);
const LIGHT = new Color(1, 0.95, 0.8);
const c = (hex: number) => new Color(hex);

function wheels(t: TriangleBuilder, length: number, width: number, r = 0.022): void {
  for (const x of [-length * 0.32, length * 0.32]) {
    for (const z of [-width / 2, width / 2]) t.box(x, r, z, r * 2.2, r * 2, 0.02, TYRE);
  }
}

function car(length: number, cabinFrom: number, cabinTo: number, cabinHeight: number, roofSign = false): BufferGeometry {
  const t = new TriangleBuilder();
  const w = 0.13;
  t.box(0, 0.05, 0, length, 0.05, w, WHITE);
  const cl = (cabinTo - cabinFrom) * length;
  const cx = ((cabinFrom + cabinTo) / 2 - 0.5) * length;
  t.box(cx, 0.075 + cabinHeight / 2, 0, cl, cabinHeight, w * 0.86, GLASS);
  t.box(cx, 0.077 + cabinHeight, 0, cl * 0.9, 0.006, w * 0.84, WHITE);
  t.box(length / 2, 0.055, 0, 0.004, 0.015, w * 0.8, LIGHT);
  if (roofSign) t.box(cx, 0.09 + cabinHeight, 0, 0.04, 0.02, 0.07, c(0xfff3b0));
  wheels(t, length, w);
  return t.build();
}

function van(): BufferGeometry {
  const t = new TriangleBuilder();
  const l = 0.3;
  t.box(0, 0.09, 0, l, 0.13, 0.14, WHITE);
  t.box(l * 0.4, 0.12, 0, 0.06, 0.05, 0.13, GLASS);
  wheels(t, l, 0.14);
  return t.build();
}

function truck(): BufferGeometry {
  const t = new TriangleBuilder();
  t.box(0.16, 0.08, 0, 0.11, 0.11, 0.14, WHITE);
  t.box(0.19, 0.11, 0, 0.05, 0.04, 0.142, GLASS);
  t.box(-0.06, 0.1, 0, 0.3, 0.16, 0.15, c(0xe8e6e0));
  t.box(-0.06, 0.03, 0, 0.42, 0.02, 0.1, TYRE);
  wheels(t, 0.42, 0.14);
  return t.build();
}

function bus(): BufferGeometry {
  const t = new TriangleBuilder();
  const l = 0.55;
  t.box(0, 0.1, 0, l, 0.15, 0.15, WHITE);
  t.box(0, 0.13, 0, l * 0.92, 0.045, 0.152, GLASS);
  t.box(l / 2, 0.12, 0, 0.004, 0.06, 0.12, GLASS);
  wheels(t, l, 0.15);
  return t.build();
}

function fireTruck(): BufferGeometry {
  const t = new TriangleBuilder();
  const red = c(0xc0392b);
  t.box(0, 0.09, 0, 0.46, 0.12, 0.15, red);
  t.box(0.18, 0.13, 0, 0.08, 0.05, 0.152, GLASS);
  t.box(-0.05, 0.165, 0, 0.32, 0.02, 0.06, c(0xd0d4d8));
  t.box(-0.05, 0.09, 0, 0.3, 0.02, 0.152, c(0xf4f1ea));
  wheels(t, 0.46, 0.15);
  return t.build();
}

function policeCar(): BufferGeometry {
  const t = new TriangleBuilder();
  const w = 0.13;
  t.box(0, 0.05, 0, 0.28, 0.05, w, c(0xf4f4f4));
  t.box(0.0, 0.04, 0, 0.12, 0.03, w + 0.002, c(0x1d2a44));
  t.box(-0.01, 0.1, 0, 0.14, 0.05, w * 0.86, GLASS);
  wheels(t, 0.28, w);
  return t.build();
}

function locomotive(): BufferGeometry {
  const t = new TriangleBuilder();
  t.box(0, 0.11, 0, 0.52, 0.16, 0.17, WHITE);
  t.box(0.2, 0.16, 0, 0.1, 0.05, 0.172, GLASS);
  t.box(0.262, 0.08, 0, 0.004, 0.08, 0.15, c(0xf1c40f));
  t.box(0, 0.025, 0, 0.44, 0.03, 0.12, TYRE);
  return t.build();
}

function coach(): BufferGeometry {
  const t = new TriangleBuilder();
  t.box(0, 0.11, 0, 0.5, 0.16, 0.16, WHITE);
  t.box(0, 0.14, 0, 0.46, 0.045, 0.162, GLASS);
  t.box(0, 0.025, 0, 0.42, 0.03, 0.12, TYRE);
  return t.build();
}

function freight(): BufferGeometry {
  const t = new TriangleBuilder();
  t.box(0, 0.045, 0, 0.5, 0.03, 0.15, c(0x3a3d42));
  t.box(0, 0.12, 0, 0.46, 0.12, 0.15, WHITE);
  t.box(0, 0.025, 0, 0.42, 0.03, 0.12, TYRE);
  return t.build();
}

function plane(): BufferGeometry {
  const t = new TriangleBuilder();
  const white = c(0xf4f4f4);
  const blue = c(0x2e86de);
  t.box(0, 0.1, 0, 0.78, 0.1, 0.1, white);
  t.box(0.4, 0.1, 0, 0.04, 0.07, 0.07, white);
  t.box(0.37, 0.12, 0, 0.03, 0.025, 0.09, GLASS);
  t.box(0, 0.08, 0, 0.17, 0.02, 0.8, white);
  t.box(0.03, 0.06, -0.22, 0.12, 0.05, 0.05, c(0xa7adb3));
  t.box(0.03, 0.06, 0.22, 0.12, 0.05, 0.05, c(0xa7adb3));
  t.box(-0.33, 0.21, 0, 0.12, 0.17, 0.02, blue);
  t.box(-0.35, 0.12, 0, 0.09, 0.015, 0.3, white);
  t.box(0, 0.105, 0, 0.7, 0.02, 0.102, blue);
  t.box(0.05, 0.02, 0, 0.02, 0.06, 0.02, TYRE);
  return t.build();
}

function ship(): BufferGeometry {
  const t = new TriangleBuilder();
  const hull = c(0x2b3a4a);
  t.box(0, 0.04, 0, 0.9, 0.1, 0.22, hull);
  t.box(0.46, 0.05, 0, 0.06, 0.08, 0.14, hull);
  t.box(0, 0.095, 0, 0.9, 0.01, 0.222, c(0xb03a2e));
  t.box(-0.34, 0.2, 0, 0.14, 0.2, 0.18, c(0xf4f1ea));
  t.box(-0.3, 0.27, 0, 0.03, 0.04, 0.182, GLASS);
  const boxes = [0xc0392b, 0x2e86de, 0x27ae60, 0xe67e22, 0xf1c40f, 0x8e44ad];
  let k = 0;
  for (let x = -0.18; x <= 0.36; x += 0.13) {
    for (const z of [-0.055, 0.055]) {
      const stack = 1 + ((k * 7) % 3);
      for (let h = 0; h < stack; h++) t.box(x, 0.13 + h * 0.06, z, 0.12, 0.055, 0.1, c(boxes[k++ % boxes.length] ?? 0xffffff));
    }
  }
  return t.build();
}

function pedestrian(): BufferGeometry {
  const body = new CapsuleGeometry(0.018, 0.045, 2, 5).toNonIndexed();
  body.translate(0, 0.045, 0);
  body.deleteAttribute('uv');
  const count = body.getAttribute('position').count;
  const colors = new Float32Array(count * 3).fill(1);
  const pos = body.getAttribute('position');
  // A skin-toned head band at the top of the capsule.
  for (let i = 0; i < count; i++) {
    if (pos.getY(i) > 0.075) colors.set([0.95, 0.8, 0.68], i * 3);
  }
  const t = new TriangleBuilder();
  for (let i = 0; i < count; i++) {
    t.positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    t.colors.push(colors[i * 3] ?? 1, colors[i * 3 + 1] ?? 1, colors[i * 3 + 2] ?? 1);
  }
  return t.build();
}

/** Head- and taillights for a vehicle one unit long; stretch along x to fit. */
function carLights(): BufferGeometry {
  const t = new TriangleBuilder();
  for (const z of [-0.042, 0.042]) {
    t.box(0.5, 0.058, z, 0.04, 0.016, 0.026, new Color(1, 0.95, 0.78));
    t.box(-0.5, 0.06, z, 0.04, 0.016, 0.026, new Color(1, 0.08, 0.04));
  }
  return t.build();
}

function lightBar(): BufferGeometry {
  const t = new TriangleBuilder();
  t.box(0, 0, 0, 0.03, 0.018, 0.09, WHITE);
  return t.build();
}

export const MODELS = {
  sedan: () => car(0.28, 0.28, 0.72, 0.045),
  hatchback: () => car(0.24, 0.2, 0.78, 0.05),
  van,
  truck,
  bus,
  taxi: () => car(0.28, 0.28, 0.72, 0.045, true),
  fireTruck,
  policeCar,
  locomotive,
  coach,
  freight,
  plane,
  ship,
  pedestrian,
  lightBar,
  carLights,
};

export type ModelName = keyof typeof MODELS;
