import { type Camera, HalfFloatType, type Scene, type WebGLRenderer } from 'three';
import {
  BloomEffect,
  type Effect,
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

export interface PostOptions {
  bloom: boolean;
  tiltShift: boolean;
  smaa: boolean;
}

/**
 * Render → tilt-shift + bloom + vignette + tone mapping → SMAA. Tilt-shift
 * and SMAA are both convolution effects, so they need separate passes.
 * Which effects run depends on the graphics quality.
 */
export class PostFx {
  readonly composer: EffectComposer;
  private readonly tiltShift = new TiltShiftEffect({ focusArea: 0.45, feather: 0.3, kernelSize: KernelSize.MEDIUM });

  constructor(
    renderer: WebGLRenderer,
    private readonly scene: Scene,
    private readonly camera: Camera,
    options: PostOptions,
  ) {
    this.composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType });
    this.configure(options);
  }

  /** Rebuild the pass chain for a quality level. */
  configure(options: PostOptions): void {
    this.composer.removeAllPasses();
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const effects: Effect[] = [];
    if (options.tiltShift) effects.push(this.tiltShift);
    // Only HDR emissives (lit windows, lamps, headlights) pass the bloom threshold.
    if (options.bloom) effects.push(new BloomEffect({ luminanceThreshold: 1.1, luminanceSmoothing: 0.25, intensity: 1.1, mipmapBlur: true, radius: 0.6 }));
    if (options.tiltShift) effects.push(new VignetteEffect({ offset: 0.35, darkness: 0.3 }));
    // Neutral keeps the palette's saturation; AgX washed the greens out.
    effects.push(new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }));
    this.composer.addPass(new EffectPass(this.camera, ...effects));
    if (options.smaa) this.composer.addPass(new EffectPass(this.camera, new SMAAEffect()));
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
