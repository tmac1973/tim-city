import { type Material, Vector3 } from 'three';
import { TileKind } from '@/shared/tiles';
import { waterSide } from '@/sim/tools/place';
import type { CityMirror } from '../mirror';
import { WATER_Y } from '../units';
import { AGENT_CAPS } from './budget';
import { type Agent, InstancePool } from './core';
import { MODELS } from './models';
import { waterRoute } from './roadGraph';
import type { VisualRng } from './visualRng';

/** Round a tile-centre polyline's corners (two Chaikin passes), keeping its ends. */
export function smoothPath(points: readonly [number, number][]): [number, number][] {
  let path = points.map(([x, y]) => [x + 0.5, y + 0.5] as [number, number]);
  for (let pass = 0; pass < 2; pass++) {
    if (path.length < 3) break;
    const next: [number, number][] = [path[0] ?? [0, 0]];
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, az] = path[i] ?? [0, 0];
      const [bx, bz] = path[i + 1] ?? [0, 0];
      next.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
    }
    next.push(path[path.length - 1] ?? [0, 0]);
    path = next;
  }
  return path;
}

interface Port {
  origin: number;
  /** Map edge → quay, smoothed. */
  inbound: [number, number][];
  timer: number;
}

class Ship implements Agent {
  alive = true;
  hidden = false;
  readonly label = 'Cargo ship';
  readonly pos = new Vector3();
  readonly dir = new Vector3(1, 0, 0);
  readonly chase = [2, 0.8] as const;
  /** Index into the path and distance along that leg. */
  leg = 0;
  along = 0;
  wait = 0;
  scale = 0;
  outbound = false;
  constructor(readonly port: Port) {}
}

/** Cargo ships sail in from the map edge to each seaport's quay, unload, and leave. */
export class ShipLayer {
  readonly ships: Ship[] = [];
  private ports: Port[] = [];
  private dirty = true;
  private readonly pool: InstancePool;

  constructor(
    private readonly mirror: CityMirror,
    private readonly rng: VisualRng,
    material: Material,
  ) {
    this.pool = new InstancePool(MODELS.ship(), material, AGENT_CAPS.ships);
  }

  get meshes() {
    return [this.pool.mesh];
  }

  markDirty(): void {
    this.dirty = true;
  }

  private findPorts(): void {
    const m = this.mirror;
    const old = new Map(this.ports.map((p) => [p.origin, p]));
    this.ports = [];
    for (let i = 0; i < m.size * m.size; i++) {
      if (m.tiles[i] !== TileKind.Seaport || m.parts[i] !== 1) continue;
      const tx = i % m.size;
      const ty = (i - tx) / m.size;
      const side = waterSide(m, tx, ty, 4);
      if (side === null) continue;
      // The water tile off the middle of the quay.
      const quays: [number, number][] = [[tx + 2, ty - 1], [tx + 4, ty + 2], [tx + 2, ty + 4], [tx - 1, ty + 2]];
      const [qx, qy] = quays[side] ?? [tx, ty];
      const route = waterRoute(m, qx, qy);
      if (!route) continue;
      const kept = old.get(i);
      this.ports.push({ origin: i, inbound: smoothPath(route.reverse()), timer: kept?.timer ?? this.rng.range(4, 12) });
    }
    for (const s of this.ships) if (!this.ports.some((p) => p.origin === s.port.origin)) s.alive = false;
  }

  update(dt: number): void {
    if (this.dirty) {
      this.dirty = false;
      this.findPorts();
    }
    for (const port of this.ports) {
      port.timer -= dt;
      if (port.timer > 0) continue;
      port.timer = this.rng.range(30, 60);
      if (this.ships.length >= AGENT_CAPS.ships) continue;
      this.ships.push(new Ship(port));
    }
    for (const ship of this.ships) this.step(ship, dt);
    for (let i = this.ships.length - 1; i >= 0; i--) if (!this.ships[i]?.alive) this.ships.splice(i, 1);
    this.pool.begin();
    for (const s of this.ships) this.pool.push(s.pos.x, s.pos.y, s.pos.z, s.dir.x, 0, s.dir.z, s.scale, 0xffffff);
    this.pool.end();
  }

  private step(ship: Ship, dt: number): void {
    const path = ship.port.inbound;
    const n = path.length;
    const point = (k: number) => {
      const i = ship.outbound ? n - 1 - k : k;
      return path[Math.min(n - 1, Math.max(0, i))] ?? [0, 0];
    };
    if (ship.wait > 0) {
      ship.wait -= dt;
      if (ship.wait <= 0) {
        ship.outbound = true;
        ship.leg = 0;
        ship.along = 0;
      }
      return;
    }
    const legs = n - 1;
    const end = ship.leg >= legs;
    // Slow down near the quay, fade in and out at the map edge.
    const speed = !ship.outbound && ship.leg > legs - 4 ? 0.5 : 1.1;
    ship.along += speed * dt;
    for (;;) {
      const [ax, az] = point(ship.leg);
      const [bx, bz] = point(ship.leg + 1);
      const len = Math.hypot(bx - ax, bz - az);
      if (ship.leg < legs && ship.along > len) {
        ship.along -= len;
        ship.leg++;
        continue;
      }
      const t = len > 0 ? Math.min(1, ship.along / len) : 1;
      ship.pos.set(ax + (bx - ax) * t, WATER_Y, az + (bz - az) * t);
      if (len > 0) {
        const k = Math.min(1, dt * 3);
        ship.dir.set(ship.dir.x + ((bx - ax) / len - ship.dir.x) * k, 0, ship.dir.z + ((bz - az) / len - ship.dir.z) * k).normalize();
      }
      break;
    }
    if (end) {
      if (ship.outbound) {
        ship.scale -= dt;
        if (ship.scale <= 0) ship.alive = false;
      } else {
        ship.wait = this.rng.range(6, 10);
      }
    } else if (!ship.outbound || ship.scale < 1) {
      ship.scale = Math.min(1, ship.scale + dt);
    }
  }
}
