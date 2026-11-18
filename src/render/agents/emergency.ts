import { Color, type Material, MeshBasicMaterial, Vector3 } from 'three';
import { isRoad, isTunnel, TileFlag, TileKind, ZONE_SIZE } from '@/shared/tiles';
import type { CityMirror } from '../mirror';
import { AGENT_CAPS } from './budget';
import { type Agent, InstancePool, Mover, placeOnSurface, VEHICLE_SCALE } from './core';
import { MODELS } from './models';
import { DX, DY, type Dir, exits, links, reverse, route } from './roadGraph';
import type { VisualRng } from './visualRng';

const LANE = 0.17;
const PATROL_RADIUS = 10;

class Unit implements Agent {
  alive = true;
  hidden = false;
  readonly pos = new Vector3();
  readonly dir = new Vector3(1, 0, 0);
  readonly chase = [0.9, 0.32] as const;
  readonly mover = new Mover(LANE, 'road');
  speed = 0;
  scale = 0;
  /** Fire trucks: tiles still to drive (next first), then park. */
  path: [number, number][] = [];
  parked = 0;
  leaving = false;
  /** The station's centre, for patrols and to send trucks home. */
  home: [number, number];
  /** Burning tile a truck was sent to. */
  fire = -1;

  constructor(
    readonly label: 'Fire truck' | 'Police car',
    home: [number, number],
  ) {
    this.home = home;
  }
}

/** Road tiles within 3 tiles of a lot (the sim's road-access reach), nearest first. */
function roadsAround(m: CityMirror, x: number, y: number, size: number): [number, number][] {
  const out: [number, number, number][] = [];
  for (let ty = y - 3; ty < y + size + 3; ty++) {
    for (let tx = x - 3; tx < x + size + 3; tx++) {
      if (tx < 0 || ty < 0 || tx >= m.size || ty >= m.size) continue;
      if (!isRoad(m.tile(tx, ty)) || !links(m, tx, ty, 'road')) continue;
      const gap = Math.max(x - tx, tx - (x + size - 1), y - ty, ty - (y + size - 1));
      out.push([tx, ty, gap]);
    }
  }
  return out.sort((a, b) => a[2] - b[2]).map(([tx, ty]) => [tx, ty]);
}

/**
 * Fire trucks drive from the nearest fire station to burning tiles and
 * park there with lights flashing until the fire is out. Police cars
 * patrol the roads within 10 tiles of their station.
 */
export class EmergencyLayer {
  readonly units: Unit[] = [];
  private readonly trucks: InstancePool;
  private readonly police: InstancePool;
  private readonly lights: InstancePool;
  private stations: { fire: [number, number][]; police: [number, number][] } = { fire: [], police: [] };
  private dirty = true;
  private clock = 0;
  private time = 0;
  private readonly red = new Color(4, 0.3, 0.2);
  private readonly blue = new Color(0.3, 0.6, 4);

  constructor(
    private readonly mirror: CityMirror,
    private readonly rng: VisualRng,
    private readonly surface: (x: number, z: number) => number,
    material: Material,
  ) {
    this.trucks = new InstancePool(MODELS.fireTruck(), material, AGENT_CAPS.fireTrucks, true, VEHICLE_SCALE);
    this.police = new InstancePool(MODELS.policeCar(), material, AGENT_CAPS.policeCars, true, VEHICLE_SCALE);
    const glow = new MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    this.lights = new InstancePool(MODELS.lightBar(), glow, AGENT_CAPS.fireTrucks + AGENT_CAPS.policeCars, false, VEHICLE_SCALE);
  }

  get meshes() {
    return [this.trucks.mesh, this.police.mesh, this.lights.mesh];
  }

  markDirty(): void {
    this.dirty = true;
  }

  update(dt: number): void {
    this.time += dt;
    this.clock += dt;
    if (this.clock >= 1) {
      this.clock = 0;
      if (this.dirty) this.findStations();
      this.dispatch();
    }
    for (const u of this.units) this.step(u, dt);
    for (let i = this.units.length - 1; i >= 0; i--) if (!this.units[i]?.alive) this.units.splice(i, 1);
    this.draw();
  }

  private findStations(): void {
    this.dirty = false;
    const m = this.mirror;
    const fire: [number, number][] = [];
    const police: [number, number][] = [];
    for (let i = 0; i < m.size * m.size; i++) {
      if (m.parts[i] !== 1) continue;
      const kind = m.tiles[i];
      const x = i % m.size;
      const y = (i - x) / m.size;
      if (kind === TileKind.FireStation) fire.push([x, y]);
      if (kind === TileKind.PoliceStation) police.push([x, y]);
    }
    this.stations = { fire, police };
    // Police cars whose station is gone go home for good.
    for (const u of this.units) {
      if (u.label === 'Police car' && !police.some(([x, y]) => x + 1 === u.home[0] && y + 1 === u.home[1])) u.leaving = true;
    }
  }

  private dispatch(): void {
    const m = this.mirror;
    // One patrol car per police station.
    for (const [sx, sy] of this.stations.police) {
      const home: [number, number] = [sx + 1, sy + 1];
      if (this.units.some((u) => u.label === 'Police car' && u.home[0] === home[0] && u.home[1] === home[1] && !u.leaving)) continue;
      if (this.units.filter((u) => u.label === 'Police car').length >= AGENT_CAPS.policeCars) break;
      const start = roadsAround(m, sx, sy, ZONE_SIZE)[0];
      if (!start) continue;
      const unit = new Unit('Police car', home);
      this.start(unit, start[0], start[1]);
      this.units.push(unit);
    }
    // A fire truck for each burning tile no truck is already covering.
    if (this.stations.fire.length === 0) return;
    const burning: number[] = [];
    for (let i = 0; i < m.size * m.size; i++) if ((m.flags[i] ?? 0) & TileFlag.BURNING) burning.push(i);
    const trucks = this.units.filter((u) => u.label === 'Fire truck');
    for (const t of trucks) {
      const fx = t.fire % m.size;
      const fy = Math.floor(t.fire / m.size);
      const stillBurning = burning.some((i) => Math.abs((i % m.size) - fx) <= 3 && Math.abs(Math.floor(i / m.size) - fy) <= 3);
      if (!stillBurning && t.parked > 0) t.leaving = true;
    }
    for (const i of burning) {
      if (this.units.filter((u) => u.label === 'Fire truck').length >= AGENT_CAPS.fireTrucks) break;
      const fx = i % m.size;
      const fy = (i - fx) / m.size;
      if (this.units.some((u) => u.label === 'Fire truck' && Math.abs((u.fire % m.size) - fx) <= 4 && Math.abs(Math.floor(u.fire / m.size) - fy) <= 4)) continue;
      const station = [...this.stations.fire].sort((a, b) => Math.hypot(a[0] - fx, a[1] - fy) - Math.hypot(b[0] - fx, b[1] - fy))[0];
      if (!station) continue;
      const near = (x: number, y: number) => Math.abs(x - fx) <= 2 && Math.abs(y - fy) <= 2;
      for (const [rx, ry] of roadsAround(m, station[0], station[1], ZONE_SIZE).slice(0, 4)) {
        const path = route(m, rx, ry, near, 'road');
        if (!path) continue;
        const unit = new Unit('Fire truck', [station[0] + 1, station[1] + 1]);
        unit.fire = i;
        unit.path = path.slice(1);
        this.start(unit, rx, ry);
        this.units.push(unit);
        break;
      }
    }
  }

  private start(u: Unit, x: number, y: number): void {
    const mask = links(this.mirror, x, y, 'road');
    const next = u.path[0];
    let dout: Dir = 1;
    if (next) dout = ([0, 1, 2, 3] as const).find((d) => x + DX[d] === next[0] && y + DY[d] === next[1]) ?? 1;
    else for (let d = 0; d < 4; d++) if (mask & (1 << d)) dout = d as Dir;
    u.mover.place(x, y, dout, dout, 0.3);
    placeOnSurface(u, u.mover.pose2, this.surface);
  }

  private choose(u: Unit, x: number, y: number, heading: Dir): Dir | null {
    const m = this.mirror;
    if (!isRoad(m.tile(x, y))) return null;
    if (u.path.length > 0) {
      u.path.shift();
      const next = u.path[0];
      if (next) {
        const d = ([0, 1, 2, 3] as const).find((k) => x + DX[k] === next[0] && y + DY[k] === next[1]);
        if (d !== undefined) return d;
      }
      // Arrived: stop at the end of this tile.
      return heading;
    }
    const options = exits(m, x, y, heading, 'road');
    if (u.label === 'Police car') {
      // Stay on the beat: avoid turns that lead too far from the station.
      const inRange = options.filter((d) => Math.hypot(x + DX[d] - u.home[0], y + DY[d] - u.home[1]) <= PATROL_RADIUS);
      return this.rng.pick(inRange.length > 0 ? inRange : [reverse(heading)]) ?? reverse(heading);
    }
    return this.rng.pick(options) ?? reverse(heading);
  }

  private step(u: Unit, dt: number): void {
    u.scale = Math.min(1, Math.max(0, u.scale + (u.leaving ? -dt : dt) / 0.4));
    if (u.leaving && u.scale <= 0) {
      u.alive = false;
      return;
    }
    const truck = u.label === 'Fire truck';
    const arrived = truck && u.path.length === 0 && u.mover.t > 0.5;
    if (arrived) {
      u.parked += dt;
      u.speed = 0;
    } else {
      const cruise = truck ? 1.9 : 1.2;
      u.speed += (cruise - u.speed) * Math.min(1, dt * 2);
      if (!u.mover.advance(this.mirror, u.speed * dt, (x, y, h) => this.choose(u, x, y, h))) u.leaving = true;
    }
    u.hidden = isTunnel(this.mirror.tile(u.mover.seg.x, u.mover.seg.y));
    placeOnSurface(u, u.mover.pose2, this.surface);
  }

  private draw(): void {
    this.trucks.begin();
    this.police.begin();
    this.lights.begin();
    for (const u of this.units) {
      if (u.hidden) continue;
      const truck = u.label === 'Fire truck';
      (truck ? this.trucks : this.police).push(u.pos.x, u.pos.y, u.pos.z, u.dir.x, u.dir.y, u.dir.z, u.scale, 0xffffff);
      const flash = Math.floor(this.time * 4 + u.home[0]) % 2 === 0;
      const top = (truck ? 0.165 : 0.14) * VEHICLE_SCALE;
      const fwd = truck ? 0.2 : 0;
      this.lights.push(
        u.pos.x + u.dir.x * fwd,
        u.pos.y + top * u.scale,
        u.pos.z + u.dir.z * fwd,
        u.dir.x,
        0,
        u.dir.z,
        u.scale,
        flash ? this.red : this.blue,
      );
    }
    this.trucks.end();
    this.police.end();
    this.lights.end();
  }
}
