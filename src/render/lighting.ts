import { DirectionalLight, HemisphereLight, type Scene, Vector3 } from 'three';
import { PALETTE } from './palette';

/** Sky/ground fill plus one shadow-casting sun, its shadow fitted to the view. */
export class Lighting {
  readonly hemisphere = new HemisphereLight(PALETTE.sky, PALETTE.groundBounce, 1.1);
  readonly sun = new DirectionalLight(PALETTE.sun, 2.6);
  /** Unit vector pointing toward the sun. */
  readonly sunDir = new Vector3(-0.55, 0.75, -0.35).normalize();

  constructor(scene: Scene) {
    const shadow = this.sun.shadow;
    this.sun.castShadow = true;
    shadow.mapSize.set(2048, 2048);
    shadow.bias = -0.0004;
    shadow.normalBias = 0.03;
    scene.add(this.hemisphere, this.sun, this.sun.target);
  }

  /** Center the shadow frustum on the camera target, sized to what is on screen. */
  fit(target: Vector3, radius: number): void {
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).addScaledVector(this.sunDir, 200);
    const cam = this.sun.shadow.camera;
    cam.left = -radius;
    cam.right = radius;
    cam.top = radius;
    cam.bottom = -radius;
    cam.near = 1;
    cam.far = 400;
    cam.updateProjectionMatrix();
  }
}
