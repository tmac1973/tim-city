import { BufferAttribute, BufferGeometry, Color, Group, LineBasicMaterial, LineLoop, Mesh, MeshBasicMaterial } from 'three';
import type { CityMirror } from './mirror';
import { PALETTE } from './palette';

const LIFT = 0.08;
const SEGMENTS = 96;
/** Rings of the filled disc, so it drapes over hills. */
const RINGS = 12;

/**
 * The reach of a building being placed: a translucent disc where it fully
 * serves and a ring where its effect fades out, both draped over the ground.
 */
export class RadiusGuide {
  readonly group = new Group();
  private readonly ring: LineLoop;
  private readonly disc: Mesh;
  private shown: string | null = null;

  constructor(private readonly mirror: CityMirror) {
    const color = new Color(PALETTE.previewOk);
    this.ring = new LineLoop(new BufferGeometry(), new LineBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
    this.disc = new Mesh(new BufferGeometry(), new MeshBasicMaterial({ color, transparent: true, opacity: 0.16, depthWrite: false }));
    for (const o of [this.ring, this.disc]) {
      o.renderOrder = 3;
      o.frustumCulled = false;
    }
    this.group.add(this.disc, this.ring);
    this.group.visible = false;
  }

  private ground(x: number, z: number): [number, number, number] {
    const m = this.mirror;
    const cx = Math.min(m.size, Math.max(0, x));
    const cz = Math.min(m.size, Math.max(0, z));
    return [x, m.heightAt(cx, cz) + LIFT, z];
  }

  /**
   * Show a reach of `radius` tiles round (x, z); the disc covers `served` of it
   * (0–1: the part where coverage is strong enough to count).
   */
  show(x: number, z: number, radius: number, served: number): void {
    this.group.visible = true;
    const key = [x, z, radius, served].join(',');
    if (key === this.shown) return;
    this.shown = key;
    const at = (r: number, s: number) => {
      const a = (s / SEGMENTS) * Math.PI * 2;
      return this.ground(x + Math.cos(a) * r, z + Math.sin(a) * r);
    };

    const ring: number[] = [];
    for (let s = 0; s < SEGMENTS; s++) ring.push(...at(radius, s));
    const ringGeometry = new BufferGeometry();
    ringGeometry.setAttribute('position', new BufferAttribute(new Float32Array(ring), 3));
    this.ring.geometry.dispose();
    this.ring.geometry = ringGeometry;

    // The disc as concentric bands of quads, each corner on the ground.
    const tris: number[] = [];
    const step = (radius * served) / RINGS;
    for (let ri = 0; ri < RINGS; ri++) {
      for (let s = 0; s < SEGMENTS; s++) {
        const a = at(ri * step, s);
        const b = at((ri + 1) * step, s);
        const c = at((ri + 1) * step, s + 1);
        const d = at(ri * step, s + 1);
        tris.push(...a, ...c, ...b, ...a, ...d, ...c);
      }
    }
    const discGeometry = new BufferGeometry();
    discGeometry.setAttribute('position', new BufferAttribute(new Float32Array(tris), 3));
    this.disc.geometry.dispose();
    this.disc.geometry = discGeometry;
  }

  clear(): void {
    this.group.visible = false;
  }
}
