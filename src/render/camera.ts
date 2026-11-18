import { PerspectiveCamera, Vector3 } from 'three';

interface View {
  x: number;
  z: number;
  distance: number;
  yaw: number;
  pitch: number;
}

const MIN_PITCH = (20 * Math.PI) / 180;
const MAX_PITCH = (80 * Math.PI) / 180;
const MIN_DISTANCE = 6;
const DAMPING = 12;

const PAN_KEYS: Record<string, [number, number]> = {
  KeyW: [1, 0], ArrowUp: [1, 0],
  KeyS: [-1, 0], ArrowDown: [-1, 0],
  KeyD: [0, 1], ArrowRight: [0, 1],
  KeyA: [0, -1], ArrowLeft: [0, -1],
};

/**
 * Orbit camera around a ground target. WASD/arrows pan, right-drag rotates,
 * middle-drag tilts, the wheel zooms. Input sets a goal view; the real view
 * eases toward it each frame.
 */
export class CityCamera {
  readonly camera = new PerspectiveCamera(40, 1, 0.5, 3000);
  readonly target = new Vector3();
  private readonly goal: View;
  private readonly view: View;
  private readonly maxDistance: number;
  private readonly keys = new Set<string>();
  private drag: { button: number; x: number; y: number } | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly mapSize: number,
    private readonly heightAt: (x: number, z: number) => number,
  ) {
    this.maxDistance = mapSize * 1.4;
    this.goal = { x: mapSize / 2, z: mapSize / 2, distance: mapSize * 0.55, yaw: Math.PI / 4, pitch: 0.85 };
    this.view = { ...this.goal };
    this.target.set(this.view.x, heightAt(this.view.x, this.view.z), this.view.z);
    this.listen();
  }

  /** 0 when fully zoomed in, 1 when fully zoomed out. */
  get zoom(): number {
    return (this.view.distance - MIN_DISTANCE) / (this.maxDistance - MIN_DISTANCE);
  }

  /** 0 at the lowest pitch … 1 looking almost straight down. */
  get topDown(): number {
    return (this.view.pitch - MIN_PITCH) / (MAX_PITCH - MIN_PITCH);
  }

  get distance(): number {
    return this.view.distance;
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number): void {
    const g = this.goal;
    let forward = 0;
    let right = 0;
    for (const code of this.keys) {
      const dir = PAN_KEYS[code];
      if (dir) {
        forward += dir[0];
        right += dir[1];
      }
    }
    if (forward !== 0 || right !== 0) {
      const speed = g.distance * 0.9 * dt;
      const sin = Math.sin(g.yaw);
      const cos = Math.cos(g.yaw);
      g.x += (-sin * forward + cos * right) * speed;
      g.z += (-cos * forward - sin * right) * speed;
    }
    g.x = Math.min(this.mapSize, Math.max(0, g.x));
    g.z = Math.min(this.mapSize, Math.max(0, g.z));

    const k = 1 - Math.exp(-DAMPING * dt);
    const v = this.view;
    v.x += (g.x - v.x) * k;
    v.z += (g.z - v.z) * k;
    v.distance += (g.distance - v.distance) * k;
    v.yaw += (g.yaw - v.yaw) * k;
    v.pitch += (g.pitch - v.pitch) * k;

    const groundY = this.heightAt(v.x, v.z);
    this.target.set(v.x, this.target.y + (groundY - this.target.y) * k, v.z);

    const flat = Math.cos(v.pitch) * v.distance;
    const pos = this.camera.position;
    pos.set(
      this.target.x + Math.sin(v.yaw) * flat,
      this.target.y + Math.sin(v.pitch) * v.distance,
      this.target.z + Math.cos(v.yaw) * flat,
    );
    // Never let the camera dip under a hill between it and the target.
    pos.y = Math.max(pos.y, this.heightAt(pos.x, pos.z) + 1.5);
    this.camera.lookAt(this.target);
  }

  private listen(): void {
    const canvas = this.canvas;
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 1 && e.button !== 2) return;
      e.preventDefault();
      this.drag = { button: e.button, x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
      if (this.drag.button === 2) this.goal.yaw -= dx * 0.006;
      else this.goal.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, this.goal.pitch + dy * 0.005));
    });
    const endDrag = (e: PointerEvent) => {
      if (this.drag?.button !== e.button) return;
      this.drag = null;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const d = this.goal.distance * Math.exp(e.deltaY * 0.0012);
        this.goal.distance = Math.min(this.maxDistance, Math.max(MIN_DISTANCE, d));
      },
      { passive: false },
    );

    window.addEventListener('keydown', (e) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest('input, textarea, select')) return;
      if (e.code in PAN_KEYS) {
        this.keys.add(e.code);
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
    });
  }
}
