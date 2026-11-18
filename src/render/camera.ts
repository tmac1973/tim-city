import { PerspectiveCamera, Vector3 } from 'three';
import type { Agent } from './agents/core';

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
const NEAR = 0.5;
const FOLLOW_NEAR = 0.06;

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
  readonly camera = new PerspectiveCamera(40, 1, NEAR, 3000);
  readonly target = new Vector3();
  private readonly goal: View;
  private readonly view: View;
  private readonly maxDistance: number;
  private readonly keys = new Set<string>();
  private drag: { button: number; x: number; y: number } | null = null;
  private followed: Agent | null = null;
  private readonly look = new Vector3();
  private readonly chasePos = new Vector3();
  private readonly followListeners: ((agent: Agent | null) => void)[] = [];
  /** Supplies the next vehicle when asked (Tab) or when the followed one is gone. */
  nextVehicle: (current: Agent | null) => Agent | null = () => null;

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

  get following(): Agent | null {
    return this.followed;
  }

  onFollowChange(listener: (agent: Agent | null) => void): void {
    this.followListeners.push(listener);
  }

  /**
   * Ride behind a vehicle at street level (null: back to the orbit view,
   * centred where the vehicle was).
   */
  follow(agent: Agent | null): void {
    if (agent === this.followed) return;
    const was = this.followed;
    this.followed = agent;
    if (agent && !was) {
      this.chasePos.copy(this.camera.position);
      this.look.copy(this.target);
      this.camera.near = FOLLOW_NEAR;
      this.camera.updateProjectionMatrix();
    }
    if (!agent && was) {
      // Resume orbiting from where the chase camera is now.
      const off = this.camera.position.clone().sub(was.pos);
      const flat = Math.hypot(off.x, off.z);
      const v = this.view;
      v.x = was.pos.x;
      v.z = was.pos.z;
      v.yaw = Math.atan2(off.x, off.z);
      v.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, Math.atan2(off.y, flat)));
      v.distance = Math.max(MIN_DISTANCE, off.length());
      Object.assign(this.goal, { ...v, distance: Math.max(14, v.distance) });
      this.target.copy(was.pos);
      this.camera.near = NEAR;
      this.camera.updateProjectionMatrix();
    }
    for (const listener of this.followListeners) listener(agent);
  }

  /** Ease the view to centre on world (x, z), optionally at a new distance. */
  focus(x: number, z: number, distance?: number): void {
    this.goal.x = x;
    this.goal.z = z;
    if (distance !== undefined) this.goal.distance = Math.min(this.maxDistance, Math.max(MIN_DISTANCE, distance));
  }

  /** Glide to a tile and zoom in close enough to see what is there. */
  flyTo(x: number, z: number): void {
    this.focus(x + 0.5, z + 0.5, Math.min(this.goal.distance, 26));
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number): void {
    if (this.followed) {
      this.updateFollow(dt);
      return;
    }
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

  private updateFollow(dt: number): void {
    let agent = this.followed;
    if (agent && !agent.alive) {
      this.follow(this.nextVehicle(agent));
      agent = this.followed;
    }
    if (!agent) return;
    for (const code of this.keys) {
      if (code in PAN_KEYS) {
        this.follow(null);
        return;
      }
    }
    const [back, up] = agent.chase;
    const d = agent.dir;
    const k = 1 - Math.exp(-5 * dt);
    const want = new Vector3(agent.pos.x - d.x * back, agent.pos.y - d.y * back + up, agent.pos.z - d.z * back);
    this.chasePos.lerp(want, k);
    this.chasePos.y = Math.max(this.chasePos.y, this.heightAt(this.chasePos.x, this.chasePos.z) + 0.12);
    this.look.lerp(new Vector3(agent.pos.x + d.x * 0.8, agent.pos.y + d.y * 0.8 + 0.08, agent.pos.z + d.z * 0.8), Math.min(1, k * 2));
    this.camera.position.copy(this.chasePos);
    this.camera.lookAt(this.look);
    // Keep the orbit state on the vehicle, so shadows and the minimap follow it.
    this.target.copy(agent.pos);
    this.view.x = this.goal.x = agent.pos.x;
    this.view.z = this.goal.z = agent.pos.z;
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

    // While following, Esc only stops following and Tab picks the next
    // vehicle; the capture phase runs this before the toolbar's handler.
    window.addEventListener(
      'keydown',
      (e) => {
        if (!this.followed) return;
        if (e.code === 'Escape') {
          this.follow(null);
        } else if (e.code === 'Tab') {
          this.follow(this.nextVehicle(this.followed));
        } else {
          return;
        }
        e.preventDefault();
        e.stopImmediatePropagation();
      },
      { capture: true },
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
