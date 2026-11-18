import { type Camera, HalfFloatType, type Scene, type WebGLRenderer } from 'three';
import {
  EffectComposer,
  EffectPass,
  KernelSize,
  RenderPass,
  SMAAEffect,
  TiltShiftEffect,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';

/**
 * Render → tilt-shift + vignette + tone mapping → SMAA. Tilt-shift and SMAA
 * are both convolution effects, so they need separate passes.
 */
export class PostFx {
  readonly composer: EffectComposer;
  private readonly tiltShift: TiltShiftEffect;

  /** `lite` keeps only tone mapping: no blur, vignette or anti-aliasing. */
  constructor(renderer: WebGLRenderer, scene: Scene, camera: Camera, lite = false) {
    this.composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType });
    this.composer.addPass(new RenderPass(scene, camera));
    this.tiltShift = new TiltShiftEffect({ focusArea: 0.45, feather: 0.3, kernelSize: KernelSize.MEDIUM });
    if (lite) {
      this.composer.addPass(new EffectPass(camera, new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL })));
      return;
    }
    this.composer.addPass(
      new EffectPass(
        camera,
        this.tiltShift,
        new VignetteEffect({ offset: 0.35, darkness: 0.3 }),
        // Neutral keeps the palette's saturation; AgX washed the greens out.
        new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }),
      ),
    );
    this.composer.addPass(new EffectPass(camera, new SMAAEffect()));
  }

  /**
   * zoom: 0 fully in … 1 fully out; topDown: 0 low angle … 1 straight down.
   * Close up the sharp band is wide so the player can work; further out it
   * narrows for a stronger miniature look. Looking straight down there is no
   * depth to fake, so the band widens again.
   */
  setView(zoom: number, topDown: number): void {
    this.tiltShift.focusArea = Math.min(1, 0.8 - 0.3 * zoom + 0.35 * topDown);
    this.tiltShift.feather = 0.35;
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height, false);
  }

  render(dt: number): void {
    this.composer.render(dt);
  }
}
