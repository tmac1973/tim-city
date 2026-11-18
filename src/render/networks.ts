import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import { CHUNK_SIZE } from '@/shared/constants';
import { carries, isBridge, isPower, isRail, isRoad, isTunnel, type Network, TileFlag, TileKind } from '@/shared/tiles';
import { TriangleBuilder } from './geometry';
import type { CityMirror } from './mirror';
import { PALETTE } from './palette';
import { HEIGHT_UNIT, splitsNwSe, tileHeight, WATER_Y } from './units';

const C = Object.fromEntries(Object.entries(PALETTE).map(([k, v]) => [k, new Color(v)])) as Record<
  keyof typeof PALETTE,
  Color
>;

type Dir = readonly [number, number];
const DIRS: readonly Dir[] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

const PYLON_HEIGHT = 1.2;
const ARM = 0.3;
const DECK_THICKNESS = 0.18;

/** A pylon: tapered square mast plus a crossarm along local X, base at y = 0. */
const PYLON = (() => {
  const mast = new CylinderGeometry(0.03, 0.08, 1, 4).toNonIndexed();
  mast.rotateY(Math.PI / 4);
  mast.translate(0, 0.5, 0);
  const arm = new BoxGeometry(ARM * 2 + 0.1, 0.04, 0.04).toNonIndexed();
  arm.translate(0, 1 - 0.06, 0);
  mast.deleteAttribute('uv');
  arm.deleteAttribute('uv');
  return { mast, arm };
})();

/**
 * Per-chunk meshes for roads, rail, power lines, bridges and tunnel portals,
 * built straight from tile corners so they follow every slope.
 */
export class NetworkLayer {
  readonly group = new Group();
  private readonly material = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 });
  private readonly wireMaterial = new LineBasicMaterial({ color: PALETTE.wire });
  private readonly chunks = new Map<number, { group: Group; geometries: BufferGeometry[] }>();
  /** Per-tile deck and ramp lookups for `surfaceAt`; cleared whenever a chunk changes. */
  private readonly deckCache = new Map<number, number>();
  private readonly rampCache = new Map<number, readonly [number, number, number] | null>();

  constructor(private readonly mirror: CityMirror) {
    this.group.name = 'networks';
  }

  /**
   * World Y where a vehicle's wheels touch a road (or a train's touch the
   * rails) at world (px, pz): on the deck over a bridge, on the ramp beside
   * one, and on the ground elsewhere.
   */
  surfaceAt(px: number, pz: number, network: 'road' | 'rail'): number {
    const m = this.mirror;
    const x = Math.min(m.size - 1, Math.max(0, Math.floor(px)));
    const y = Math.min(m.size - 1, Math.max(0, Math.floor(pz)));
    const kind = m.tile(x, y);
    const lift = network === 'road' ? 0.03 : 0.1;
    if (isBridge(kind)) {
      const i = y * m.size + x;
      let deck = this.deckCache.get(i);
      if (deck === undefined) {
        deck = this.deckY(x, y, kind);
        this.deckCache.set(i, deck);
      }
      return deck + (network === 'road' ? 0.005 : 0.065);
    }
    const ground = m.heightAt(px, pz);
    const key = (y * m.size + x) * 2 + (network === 'rail' ? 1 : 0);
    let ramp = this.rampCache.get(key);
    if (ramp === undefined) {
      ramp = null;
      for (const dir of DIRS) {
        const nx = x + dir[0];
        const ny = y + dir[1];
        if (nx < 0 || ny < 0 || nx >= m.size || ny >= m.size) continue;
        const nk = m.tile(nx, ny);
        if (isBridge(nk) && carries(nk, network)) {
          ramp = [dir[0], dir[1], this.deckY(nx, ny, nk)];
          break;
        }
      }
      this.rampCache.set(key, ramp);
    }
    if (!ramp) return ground + lift;
    const [dx, dy, deck] = ramp;
    const t = dx !== 0 ? (dx > 0 ? px - x : x + 1 - px) : dy > 0 ? pz - y : y + 1 - pz;
    return ground + (Math.max(ground, deck) - ground) * Math.min(1, Math.max(0, t)) + lift;
  }

  rebuild(id: number): void {
    this.deckCache.clear();
    this.rampCache.clear();
    const old = this.chunks.get(id);
    if (old) {
      for (const geometry of old.geometries) geometry.dispose();
      this.group.remove(old.group);
      this.chunks.delete(id);
    }
    const m = this.mirror;
    const x0 = (id % m.chunksPerSide) * CHUNK_SIZE;
    const y0 = Math.floor(id / m.chunksPerSide) * CHUNK_SIZE;
    const tris = new TriangleBuilder();
    const wires: number[] = [];

    for (let y = y0; y < y0 + CHUNK_SIZE; y++) {
      for (let x = x0; x < x0 + CHUNK_SIZE; x++) {
        const kind = m.tile(x, y);
        if (kind < 16 || kind > 63 || isTunnel(kind)) continue;
        if (isBridge(kind)) this.bridge(tris, x, y, kind);
        else {
          if (isRoad(kind)) this.road(tris, x, y);
          if (isRail(kind)) this.rail(tris, x, y, (px, pz) => m.heightAt(px, pz), kind === TileKind.RoadRail ? 0.06 : 0.04);
          if (isRoad(kind) || isRail(kind)) this.portals(tris, x, y, isRoad(kind) ? 'road' : 'rail');
        }
        if (isPower(kind)) this.pylon(tris, wires, x, y);
      }
    }
    if (tris.empty && wires.length === 0) return;

    const chunk = new Group();
    const geometries: BufferGeometry[] = [];
    if (!tris.empty) {
      const built = tris.build();
      geometries.push(built);
      const mesh = new Mesh(built, this.material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      chunk.add(mesh);
    }
    if (wires.length > 0) {
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(new Float32Array(wires), 3));
      geometries.push(geometry);
      chunk.add(new LineSegments(geometry, this.wireMaterial));
    }
    this.chunks.set(id, { group: chunk, geometries });
    this.group.add(chunk);
  }

  private connects(x: number, y: number, [dx, dy]: Dir, network: Network): boolean {
    const nx = x + dx;
    const ny = y + dy;
    const m = this.mirror;
    return nx >= 0 && ny >= 0 && nx < m.size && ny < m.size && carries(m.tile(nx, ny), network);
  }

  /** Surface height under (px, pz), raised to a bridge deck where a road meets one. */
  private rampedHeight(x: number, y: number, network: Network): (px: number, pz: number) => number {
    const m = this.mirror;
    for (const dir of DIRS) {
      const nx = x + dir[0];
      const ny = y + dir[1];
      if (nx < 0 || ny < 0 || nx >= m.size || ny >= m.size) continue;
      const nk = m.tile(nx, ny);
      if (!isBridge(nk) || !carries(nk, network)) continue;
      const deck = this.deckY(nx, ny, nk);
      // Blend from the ground at the far edge to the deck at the bridge edge.
      return (px, pz) => {
        const t = dir[0] !== 0 ? (dir[0] > 0 ? px - x : x + 1 - px) : dir[1] > 0 ? pz - y : y + 1 - pz;
        const ground = m.heightAt(px, pz);
        return ground + (Math.max(ground, deck) - ground) * Math.min(1, Math.max(0, t));
      };
    }
    return (px, pz) => m.heightAt(px, pz);
  }

  private road(out: TriangleBuilder, x: number, y: number): void {
    const ground = this.rampedHeight(x, y, 'road');
    // Asphalt is the tile's two triangles through its (possibly ramped)
    // corners; markings and sidewalks sit on those same planes.
    const corner = (cx: number, cz: number) => new Vector3(cx, ground(cx, cz) + 0.03, cz);
    const nw = corner(x, y), ne = corner(x + 1, y), se = corner(x + 1, y + 1), sw = corner(x, y + 1);
    const worn = (this.mirror.flag(x, y) & TileFlag.POTHOLED) !== 0;
    const surface = worn ? C.asphaltWorn : C.asphalt;
    if (splitsNwSe(nw.y, ne.y, se.y, sw.y)) {
      out.tri(nw, sw, se, surface);
      out.tri(nw, se, ne, surface);
    } else {
      out.tri(nw, sw, ne, surface);
      out.tri(ne, sw, se, surface);
    }
    const height = (px: number, pz: number) => tileHeight(nw.y, ne.y, se.y, sw.y, px - x, pz - y) - 0.03;
    if (worn) {
      // A few dark cracks and patches across the worn surface.
      strip(out, height, x + 0.2, y + 0.3, x + 0.55, y + 0.45, 0.04, 0.04, C.asphalt, 1);
      strip(out, height, x + 0.6, y + 0.7, x + 0.82, y + 0.5, 0.04, 0.04, C.asphalt, 1);
      strip(out, height, x + 0.3, y + 0.72, x + 0.42, y + 0.84, 0.12, 0.04, C.asphalt, 1);
    }

    const cx = x + 0.5;
    const cz = y + 0.5;
    let links = 0;
    for (const dir of DIRS) {
      const [dx, dz] = dir;
      if (this.connects(x, y, dir, 'road')) {
        links++;
        strip(out, height, cx, cz, cx + dx * 0.5, cz + dz * 0.5, 0.035, 0.045, C.marking);
      } else {
        // Sidewalk along the open edge.
        const ex = cx + dx * 0.43;
        const ez = cz + dz * 0.43;
        strip(out, height, ex - dz * 0.5, ez - dx * 0.5, ex + dz * 0.5, ez + dx * 0.5, 0.14, 0.06, C.sidewalk);
      }
    }
    if (links === 0) strip(out, height, x + 0.2, cz, x + 0.8, cz, 0.035, 0.045, C.marking);
  }

  private rail(
    out: TriangleBuilder,
    x: number,
    y: number,
    height: (px: number, pz: number) => number,
    lift: number,
  ): void {
    const cx = x + 0.5;
    const cz = y + 0.5;
    const links = DIRS.filter((dir) => this.connects(x, y, dir, 'rail'));
    const ramp = this.rampedHeight(x, y, 'rail');
    const h = (px: number, pz: number) => Math.max(height(px, pz), ramp(px, pz));
    const segments: [number, number, number, number][] =
      links.length > 0
        ? links.map(([dx, dz]) => [cx, cz, cx + dx * 0.5, cz + dz * 0.5])
        : [[x, cz, x + 1, cz]];
    for (const [ax, az, bx, bz] of segments) {
      strip(out, h, ax, az, bx, bz, 0.5, lift, C.ballast);
      const len = Math.hypot(bx - ax, bz - az);
      const ux = (bx - ax) / len;
      const uz = (bz - az) / len;
      for (let t = 0.125; t < len; t += 0.25) {
        const px = ax + ux * t;
        const pz = az + uz * t;
        strip(out, h, px - uz * 0.31, pz + ux * 0.31, px + uz * 0.31, pz - ux * 0.31, 0.08, lift + 0.025, C.sleeper, 1);
      }
      for (const side of [-0.14, 0.14]) {
        strip(out, h, ax - uz * side, az + ux * side, bx - uz * side, bz + ux * side, 0.035, lift + 0.055, C.steel);
      }
    }
  }

  /** Bridge run axis and deck height, shared by the deck and its ramps. */
  private deckY(x: number, y: number, kind: number): number {
    const m = this.mirror;
    const network: Network = isRoad(kind) ? 'road' : isRail(kind) ? 'rail' : 'power';
    const alongX = this.connects(x, y, [1, 0], network) || this.connects(x, y, [-1, 0], network);
    const [dx, dy] = alongX ? [1, 0] : [0, 1];
    let bank = WATER_Y + 0.45;
    for (const s of [-1, 1]) {
      let px = x;
      let py = y;
      while (px >= 0 && py >= 0 && px < m.size && py < m.size && m.tile(px, py) === kind) {
        px += dx * s;
        py += dy * s;
      }
      // Corners on the edge shared by the last bridge tile and the bank.
      const ex = s > 0 ? px : px + 1;
      const ey = s > 0 ? py : py + 1;
      const a = alongX ? m.corner(ex, py) : m.corner(px, ey);
      const b = alongX ? m.corner(ex, py + 1) : m.corner(px + 1, ey);
      bank = Math.max(bank, Math.max(a, b) * HEIGHT_UNIT + 0.03);
    }
    return bank;
  }

  private bridge(out: TriangleBuilder, x: number, y: number, kind: number): void {
    const m = this.mirror;
    const deck = this.deckY(x, y, kind);
    const bed = m.heightAt(x + 0.5, y + 0.5);
    const network: Network = isRoad(kind) ? 'road' : isRail(kind) ? 'rail' : 'power';
    if (network === 'power') return;
    const alongX = this.connects(x, y, [1, 0], network) || this.connects(x, y, [-1, 0], network);

    out.box(x + 0.5, deck - DECK_THICKNESS / 2, y + 0.5, 1, DECK_THICKNESS, 1, C.concrete);
    if ((alongX ? x : y) % 3 === 1) {
      const pierTop = deck - DECK_THICKNESS;
      out.box(x + 0.5, (pierTop + bed) / 2, y + 0.5, 0.24, pierTop - bed, 0.24, C.concrete);
    }
    for (const side of [0.04, 0.96]) {
      if (alongX) out.box(x + 0.5, deck + 0.07, y + side, 1, 0.14, 0.05, C.concrete);
      else out.box(x + side, deck + 0.07, y + 0.5, 0.05, 0.14, 1, C.concrete);
    }

    const flat = () => deck;
    if (network === 'road') {
      const v = (px: number, pz: number) => new Vector3(px, deck + 0.005, pz);
      out.tri(v(x, y), v(x, y + 1), v(x + 1, y + 1), C.asphalt);
      out.tri(v(x, y), v(x + 1, y + 1), v(x + 1, y), C.asphalt);
      if (alongX) strip(out, flat, x, y + 0.5, x + 1, y + 0.5, 0.035, 0.015, C.marking, 1);
      else strip(out, flat, x + 0.5, y, x + 0.5, y + 1, 0.035, 0.015, C.marking, 1);
    } else {
      this.rail(out, x, y, flat, 0.005);
    }
  }

  /** A concrete portal where a road or rail tile meets a tunnel. */
  private portals(out: TriangleBuilder, x: number, y: number, network: Network): void {
    const m = this.mirror;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= m.size || ny >= m.size) continue;
      const nk = m.tile(nx, ny);
      if (!isTunnel(nk) || !carries(nk, network)) continue;
      const ex = x + 0.5 + dx * 0.5;
      const ez = y + 0.5 + dy * 0.5;
      const base = m.heightAt(x + 0.5 + dx * 0.4, y + 0.5 + dy * 0.4);
      const across = (o: number) => [ex + Math.abs(dy) * o, ez + Math.abs(dx) * o] as const;
      const depth = 0.16;
      for (const o of [-0.45, 0.45]) {
        const [px, pz] = across(o);
        out.box(px, base + 0.35, pz, dx !== 0 ? depth : 0.1, 0.7, dy !== 0 ? depth : 0.1, C.concrete);
      }
      out.box(ex, base + 0.75, ez, dx !== 0 ? depth : 1, 0.12, dy !== 0 ? depth : 1, C.concrete);
      // Dark mouth, set just inside the frame.
      out.box(ex + dx * 0.04, base + 0.32, ez + dy * 0.04, dx !== 0 ? 0.1 : 0.8, 0.64, dy !== 0 ? 0.1 : 0.8, C.tunnelMouth);
    }
  }

  /** Where the pylon stands: tile centre, or to the side when sharing a road or rail tile. */
  private pylonSpot(x: number, y: number): { px: number; pz: number; armAlongX: boolean; base: number; top: number } {
    const m = this.mirror;
    const kind = m.tile(x, y);
    const wiresAlongX = this.connects(x, y, [1, 0], 'power') || this.connects(x, y, [-1, 0], 'power');
    let px = x + 0.5;
    let pz = y + 0.5;
    if (kind === TileKind.RoadPower || kind === TileKind.RailPower) {
      // Stand on the verge: shift along the wire direction, off the roadway.
      if (wiresAlongX) px += 0.42;
      else pz += 0.42;
    }
    const base = m.heightAt(px, pz);
    const top = kind === TileKind.PowerBridge ? Math.max(base, WATER_Y) + PYLON_HEIGHT + 0.4 : base + PYLON_HEIGHT;
    return { px, pz, armAlongX: !wiresAlongX, base, top };
  }

  private pylon(out: TriangleBuilder, wires: number[], x: number, y: number): void {
    const spot = this.pylonSpot(x, y);
    const height = spot.top - spot.base;
    const matrix = new Matrix4().makeTranslation(spot.px, spot.base, spot.pz);
    matrix.multiply(new Matrix4().makeRotationY(spot.armAlongX ? 0 : Math.PI / 2));
    out.geometry(PYLON.mast, matrix.clone().multiply(new Matrix4().makeScale(1, height, 1)), C.pylon);
    out.geometry(PYLON.arm, matrix.clone().multiply(new Matrix4().makeTranslation(0, height - 1, 0)), C.pylon);

    // Wires to the east and south neighbours; each pair of tiles draws its span once.
    for (const dir of [[1, 0], [0, 1]] as const) {
      if (!this.connects(x, y, dir, 'power')) continue;
      const other = this.pylonSpot(x + dir[0], y + dir[1]);
      for (const side of [-ARM, ARM]) {
        const a = tip(spot, side);
        const b = tip(other, side);
        catenary(wires, a, b);
      }
    }
  }
}

function tip(spot: { px: number; pz: number; armAlongX: boolean; top: number }, side: number): Vector3 {
  return new Vector3(spot.px + (spot.armAlongX ? side : 0), spot.top - 0.08, spot.pz + (spot.armAlongX ? 0 : side));
}

/** Sagging wire from a to b as line segments. */
function catenary(out: number[], a: Vector3, b: Vector3): void {
  const segments = 6;
  const sag = 0.12 * a.distanceTo(b);
  let prev = a;
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const p = new Vector3().lerpVectors(a, b, t);
    p.y -= sag * 4 * t * (1 - t);
    out.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
    prev = p;
  }
}

/**
 * Flat ribbon from (ax, az) to (bx, bz), `width` wide, `lift` above the
 * height function, subdivided so it follows a bend in the ground.
 */
function strip(
  out: TriangleBuilder,
  height: (x: number, z: number) => number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  width: number,
  lift: number,
  color: Color,
  segments = 3,
): void {
  const len = Math.hypot(bx - ax, bz - az);
  if (len === 0) return;
  const nx = (-(bz - az) / len) * (width / 2);
  const nz = ((bx - ax) / len) * (width / 2);
  const at = (t: number, s: number) => {
    const px = ax + (bx - ax) * t + nx * s;
    const pz = az + (bz - az) * t + nz * s;
    return new Vector3(px, height(px, pz) + lift, pz);
  };
  const up = new Vector3(0, 1, 0);
  for (let i = 0; i < segments; i++) {
    const t0 = i / segments;
    const t1 = (i + 1) / segments;
    out.quad(at(t0, -1), at(t1, -1), at(t1, 1), at(t0, 1), up, color);
  }
}
