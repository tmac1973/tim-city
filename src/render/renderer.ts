import { Color, PerspectiveCamera, Scene, WebGLRenderer } from 'three';

const SKY_BLUE = 0x87ceeb;

export class Renderer {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(50, 1, 0.1, 2000);
  private readonly webgl: WebGLRenderer;

  constructor(canvas: HTMLCanvasElement) {
    this.webgl = new WebGLRenderer({ canvas, antialias: true });
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene.background = new Color(SKY_BLUE);
    this.resize();
    window.addEventListener('resize', () => {
      this.resize();
    });
  }

  start(): void {
    this.webgl.setAnimationLoop(() => {
      this.webgl.render(this.scene, this.camera);
    });
  }

  private resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.webgl.setSize(width, height, false);
  }
}
