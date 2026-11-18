import { BatchedMesh, Color, Group, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { CHUNK_SIZE } from '@/shared/constants';
import { AIRPORT_SIZE, FOOTPRINTS, PLANT_SIZE, TileFlag, TileKind, ZONE_SIZE, zoneOf } from '@/shared/tiles';
import { hash3 } from '../hash';
import type { CityMirror } from '../mirror';
import { HEIGHT_UNIT } from '../units';
import { PuffLayer } from './particles';
import { Kit } from './kit';
import { coalPlant, nuclearPlant } from './plants';
import { fireStation, largePark, park, policeStation } from './services';
import { airport, seaport, stadium } from './specials';
import { waterSide } from '@/sim/tools/place';
import { buildVariants, type Variant, variantKey } from './variants';
import { BoltLayer, LotLayer } from './zoneMarkers';

/** Model keys for single buildings, by tile kind (zone models use variantKey). */
const BUILDING_KEYS: Partial<Record<number, number>> = {
  [TileKind.CoalPlant]: -1,
  [TileKind.NuclearPlant]: -2,
  [TileKind.PoliceStation]: -5,
  [TileKind.FireStation]: -6,
  [TileKind.Park]: -7,
  [TileKind.LargePark]: -8,
  [TileKind.Stadium]: -10,
  [TileKind.Seaport]: -11,
  [TileKind.Airport]: -12,
};
const PLINTH_KEYS: Record<number, number> = { [ZONE_SIZE]: -3, [PLANT_SIZE]: -4, 1: -9, [AIRPORT_SIZE]: -13 };
/** Seaport models face their quay to +z; turns that point it at each water side (N, E, S, W). */
const QUAY_TURNS = [2, 1, 0, 3];
const PLINTH_COLOR = 0x9c968a;

/** Unit-tall stone base for a size × size lot, scaled to the slope it fills. */
function plinth(size: number) {
  const k = new Kit();
  k.box(-size / 2 + 0.03, 0, -size / 2 + 0.03, size / 2 - 0.03, 1, size / 2 - 0.03, PLINTH_COLOR);
  return { geometry: k.build(), height: 1, emitters: [] };
}
const RISE_SECONDS = 1.5;
const SINK_SECONDS = 0.6;

interface Placed {
  key: number;
  instanceId: number;
  plinthId: number | null;
  position: Vector3;
  rotation: Quaternion;
  emitters: number[];
}

interface Anim {
  instanceId: number;
  position: Vector3;
  rotation: Quaternion;
  start: number;
  duration: number;
  rising: boolean;
}

/**
 * Every zone building and power plant, drawn in one BatchedMesh. Each chunk
 * rebuild diffs the buildings it should hold against what is placed:
 * new ones rise out of the ground, vanished ones sink, and a change of
 * density swaps the model in place.
 */
export class BuildingLayer {
  readonly group = new Group();
  private readonly mesh: BatchedMesh;
  private readonly material = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.78 });
  private readonly puffs = new PuffLayer();
  private readonly bolts = new BoltLayer();
  private readonly lots: LotLayer;
  private readonly variants = new Map<number, Variant>();
  private readonly geometryIds = new Map<number, number>();
  private readonly placed = new Map<number, Placed>();
  private readonly chunkOrigins = new Map<number, Set<number>>();
  private readonly chunkBolts = new Map<number, Vector3[]>();
  private readonly seenChunks = new Set<number>();
  private anims: Anim[] = [];
  private boltsDirty = false;
  private time = 0;
  private readonly matrix = new Matrix4();
  private readonly scale = new Vector3();
  private readonly tint = new Color();

  constructor(private readonly mirror: CityMirror) {
    this.group.name = 'buildings';
    for (const [key, variant] of buildVariants()) this.variants.set(key, variant);
    const models = {
      [TileKind.CoalPlant]: coalPlant(),
      [TileKind.NuclearPlant]: nuclearPlant(),
      [TileKind.PoliceStation]: policeStation(),
      [TileKind.FireStation]: fireStation(),
      [TileKind.Park]: park(),
      [TileKind.LargePark]: largePark(),
      [TileKind.Stadium]: stadium(),
      [TileKind.Seaport]: seaport(),
      [TileKind.Airport]: airport(),
    };
    for (const [kind, model] of Object.entries(models)) {
      const key = BUILDING_KEYS[Number(kind)];
      if (key !== undefined) this.variants.set(key, model);
    }
    for (const [size, key] of Object.entries(PLINTH_KEYS)) this.variants.set(key, plinth(Number(size)));

    let vertices = 0;
    for (const v of this.variants.values()) vertices += v.geometry.getAttribute('position').count;
    // A building and its plinth per lot.
    const maxInstances = 2 * Math.ceil((mirror.size * mirror.size) / (ZONE_SIZE * ZONE_SIZE)) + 64;
    this.mesh = new BatchedMesh(
      maxInstances,
      vertices,
      0,
      this.material,
    );
    for (const [key, v] of this.variants) this.geometryIds.set(key, this.mesh.addGeometry(v.geometry));
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    // Instances are culled one by one; the batch as a whole spans the map.
    this.mesh.frustumCulled = false;

    this.lots = new LotLayer(mirror);
    this.group.add(this.mesh, this.lots.group, this.puffs.points, this.bolts.points);
  }

  /** Total vertices across all building models, for budget checks. */
  get vertexCount(): number {
    let n = 0;
    for (const v of this.variants.values()) n += v.geometry.getAttribute('position').count;
    return n;
  }

  /** See-through while a data overlay is on, so the colours show. */
  setFade(on: boolean): void {
    const material = this.material;
    material.transparent = on;
    material.opacity = on ? 0.3 : 1;
    material.depthWrite = !on;
    material.needsUpdate = true;
  }

  rebuild(id: number): void {
    const m = this.mirror;
    const animate = this.seenChunks.has(id);
    this.seenChunks.add(id);
    const x0 = (id % m.chunksPerSide) * CHUNK_SIZE;
    const y0 = Math.floor(id / m.chunksPerSide) * CHUNK_SIZE;

    const wanted = new Map<number, { key: number; size: number }>();
    const bolts: Vector3[] = [];
    for (let ty = y0; ty < y0 + CHUNK_SIZE; ty++) {
      for (let tx = x0; tx < x0 + CHUNK_SIZE; tx++) {
        const origin = ty * m.size + tx;
        if (m.parts[origin] !== 1) continue;
        const kind = m.tile(tx, ty);
        const zone = zoneOf(kind);
        if (zone) {
          const pick = hash3(tx, ty, 5) < 0.5 ? 0 : 1;
          const key = zone.density > 0 ? variantKey(zone.type, zone.density, zone.landValueClass, pick) : null;
          if (key !== null) wanted.set(origin, { key, size: ZONE_SIZE });
          if (!(m.flag(tx + 1, ty + 1) & TileFlag.POWERED)) {
            const height = key !== null ? (this.variants.get(key)?.height ?? 0.5) : 0.2;
            bolts.push(new Vector3(tx + 1.5, this.lotHeights(tx, ty, ZONE_SIZE).top + height + 0.5, ty + 1.5));
          }
        } else {
          const key = BUILDING_KEYS[kind];
          const size = FOOTPRINTS.get(kind);
          if (key !== undefined && size !== undefined) wanted.set(origin, { key, size });
        }
      }
    }

    const before = this.chunkOrigins.get(id) ?? new Set<number>();
    for (const origin of before) {
      const now = wanted.get(origin);
      const placed = this.placed.get(origin);
      if (placed && now?.key !== placed.key) this.remove(origin, animate && !now);
    }
    for (const [origin, want] of wanted) {
      if (!this.placed.has(origin)) this.add(origin, want.key, want.size, animate);
    }
    this.chunkOrigins.set(id, new Set(wanted.keys()));
    this.chunkBolts.set(id, bolts);
    this.boltsDirty = true;
    this.lots.rebuild(id);
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.time;
    this.anims = this.anims.filter((a) => {
      const p = Math.min(1, (t - a.start) / a.duration);
      // Rise with a gentle overshoot-free ease; sink straight down.
      const eased = a.rising ? 1 - (1 - p) ** 3 : 1 - p * p;
      this.scale.set(1, Math.max(0.01, eased), 1);
      this.matrix.compose(a.position, a.rotation, this.scale);
      if (p >= 1 && !a.rising) {
        this.mesh.deleteInstance(a.instanceId);
        return false;
      }
      this.mesh.setMatrixAt(a.instanceId, this.matrix);
      return p < 1;
    });
    if (this.boltsDirty) {
      this.boltsDirty = false;
      this.bolts.setPositions([...this.chunkBolts.values()].flat());
    }
    this.bolts.update(t);
    this.puffs.update(t);
  }

  /** Lowest and highest ground under a lot; buildings stand at the top. */
  private lotHeights(x: number, y: number, size: number): { bottom: number; top: number } {
    let lo = Infinity;
    let hi = -Infinity;
    for (let dy = 0; dy <= size; dy++) {
      for (let dx = 0; dx <= size; dx++) {
        const h = this.mirror.corner(x + dx, y + dy);
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
    }
    return { bottom: lo * HEIGHT_UNIT, top: hi * HEIGHT_UNIT };
  }

  private add(origin: number, key: number, size: number, animate: boolean): void {
    const geometryId = this.geometryIds.get(key);
    const variant = this.variants.get(key);
    if (geometryId === undefined || !variant) return;
    const tx = origin % this.mirror.size;
    const ty = (origin - tx) / this.mirror.size;
    const instanceId = this.mesh.addInstance(geometryId);
    const { bottom, top } = this.lotHeights(tx, ty, size);
    const position = new Vector3(tx + size / 2, top, ty + size / 2);
    const side = key === BUILDING_KEYS[TileKind.Seaport] ? waterSide(this.mirror, tx, ty, size) : null;
    const turns = side !== null ? (QUAY_TURNS[side] ?? 0) : Math.floor(hash3(tx, ty, 6) * 4);
    const rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), (turns * Math.PI) / 2);
    const shade = 0.9 + 0.2 * hash3(tx, ty, 7);
    this.mesh.setColorAt(instanceId, this.tint.setRGB(shade, shade, shade));
    this.scale.set(1, animate ? 0.01 : 1, 1);
    this.mesh.setMatrixAt(instanceId, this.matrix.compose(position, rotation, this.scale));

    const emitters = variant.emitters.map((local) =>
      this.puffs.addEmitter(local.clone().applyQuaternion(rotation).add(position), variant.steam === true),
    );
    // On sloping lots a stone plinth fills the ground up to the building.
    let plinthId: number | null = null;
    const plinthGeometry = this.geometryIds.get(PLINTH_KEYS[size] ?? 0);
    if (top > bottom && plinthGeometry !== undefined) {
      plinthId = this.mesh.addInstance(plinthGeometry);
      this.scale.set(1, top - bottom + 0.02, 1);
      this.mesh.setMatrixAt(plinthId, this.matrix.compose(new Vector3(position.x, bottom - 0.02, position.z), new Quaternion(), this.scale));
    }
    this.placed.set(origin, { key, instanceId, plinthId, position, rotation, emitters });
    if (animate) {
      this.anims.push({ instanceId, position, rotation, start: this.time, duration: RISE_SECONDS, rising: true });
      this.puffs.burst(position, 14, this.time);
    }
  }

  private remove(origin: number, sink: boolean): void {
    const placed = this.placed.get(origin);
    if (!placed) return;
    this.placed.delete(origin);
    for (const e of placed.emitters) this.puffs.removeEmitter(e);
    if (placed.plinthId !== null) this.mesh.deleteInstance(placed.plinthId);
    // Drop any running rise animation for this instance.
    this.anims = this.anims.filter((a) => a.instanceId !== placed.instanceId);
    if (sink) {
      this.anims.push({ ...placed, start: this.time, duration: SINK_SECONDS, rising: false });
      this.puffs.burst(placed.position, 18, this.time);
    } else {
      this.mesh.deleteInstance(placed.instanceId);
    }
  }
}
