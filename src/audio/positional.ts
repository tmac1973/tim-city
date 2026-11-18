/** World-positioned sound: a panner per source, and the listener on the camera. */

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** A panner at a world position, routed to `dest`. */
export function panner(ctx: BaseAudioContext, dest: AudioNode, at: Point3): PannerNode {
  const p = ctx.createPanner();
  p.panningModel = 'equalpower';
  p.distanceModel = 'inverse';
  p.refDistance = 6;
  p.maxDistance = 300;
  p.rolloffFactor = 1.3;
  place(p, at);
  p.connect(dest);
  return p;
}

export function place(p: PannerNode, at: Point3): void {
  // Older engines (Firefox's listener) only have the setPosition method.
  if ('positionX' in p) {
    p.positionX.value = at.x;
    p.positionY.value = at.y;
    p.positionZ.value = at.z;
  } else {
    (p as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(at.x, at.y, at.z);
  }
}

/**
 * Put the listener's ears between the camera and the ground it looks at,
 * facing the same way, so the city sounds as close as it looks.
 */
export function placeListener(ctx: BaseAudioContext, camera: Point3, target: Point3): void {
  const l = ctx.listener;
  const ear = { x: target.x + (camera.x - target.x) * 0.3, y: target.y + (camera.y - target.y) * 0.3, z: target.z + (camera.z - target.z) * 0.3 };
  const fx = target.x - camera.x;
  const fz = target.z - camera.z;
  const len = Math.hypot(fx, fz) || 1;
  if ('positionX' in l) {
    l.positionX.value = ear.x;
    l.positionY.value = ear.y;
    l.positionZ.value = ear.z;
    l.forwardX.value = fx / len;
    l.forwardY.value = 0;
    l.forwardZ.value = fz / len;
    l.upX.value = 0;
    l.upY.value = 1;
    l.upZ.value = 0;
  } else {
    const legacy = l as unknown as { setPosition(x: number, y: number, z: number): void; setOrientation(...v: number[]): void };
    legacy.setPosition(ear.x, ear.y, ear.z);
    legacy.setOrientation(fx / len, 0, fz / len, 0, 1, 0);
  }
}
