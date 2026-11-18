import {
  BoxGeometry,
  Color,
  DataTexture,
  Group,
  InstancedMesh,
  LinearFilter,
  Matrix4,
  MeshBasicMaterial,
  NearestFilter,
  Quaternion,
  ShaderMaterial,
  RGBAFormat,
  Vector3,
} from 'three';
import type { FieldName } from '@/shared/protocol';
import { findBusNetwork } from '@/sim/systems/transit';
import { TileFlag, TileKind, zoneOf } from '@/shared/tiles';
import type { CityMirror } from './mirror';

/** Overlays drawn from the tile mirror instead of a streamed block field. */
export const TILE_OVERLAYS = ['power', 'zoneTier', 'transit'] as const;
export type OverlayName = FieldName | (typeof TILE_OVERLAYS)[number];
export const isTileOverlay = (name: OverlayName | null): boolean => name === 'power' || name === 'zoneTier' || name === 'transit';
type Rgba = [number, number, number, number];
type Ramp = (v: number) => Rgba;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Piecewise-linear colour ramp over 0–1 through the given stops. */
function stops(points: [number, [number, number, number]][], alpha: (t: number) => number): Ramp {
  return (v) => {
    const t = v / 255;
    let i = 0;
    while (i < points.length - 2 && t > (points[i + 1]?.[0] ?? 1)) i++;
    const [t0, c0] = points[i] ?? [0, [0, 0, 0]];
    const [t1, c1] = points[i + 1] ?? [1, [0, 0, 0]];
    const u = Math.min(1, Math.max(0, (t - t0) / (t1 - t0 || 1)));
    return [lerp(c0[0], c1[0], u), lerp(c0[1], c1[1], u), lerp(c0[2], c1[2], u), Math.round(255 * alpha(t))];
  };
}

const badRamp = stops(
  [[0, [255, 230, 90]], [0.5, [255, 140, 40]], [1, [220, 40, 40]]],
  (t) => Math.min(0.88, t * 2.2),
);

export interface OverlayDef {
  id: OverlayName;
  label: string;
  /** Raise translucent columns as well as tinting the ground. */
  columns: boolean;
  ramp: Ramp;
  low: string;
  high: string;
}

export const OVERLAYS: OverlayDef[] = [
  { id: 'power', label: 'Power', columns: false, ramp: badRamp, low: 'Powered', high: 'No power' },
  { id: 'traffic', label: 'Traffic', columns: false, ramp: badRamp, low: 'Light', high: 'Jammed' },
  { id: 'pollution', label: 'Pollution', columns: true, ramp: badRamp, low: 'Clean', high: 'Toxic' },
  { id: 'crime', label: 'Crime', columns: true, ramp: badRamp, low: 'Safe', high: 'Dangerous' },
  {
    // Land value is non-zero everywhere, so columns would fill the map; ground only.
    id: 'landValue',
    label: 'Land value',
    columns: false,
    ramp: stops([[0, [214, 70, 60]], [0.5, [245, 210, 80]], [1, [60, 200, 110]]], () => 0.55),
    low: 'Low',
    high: 'Prime',
  },
  { id: 'zoneTier', label: 'Zoning', columns: false, ramp: badRamp, low: 'Low density', high: 'High density' },
  { id: 'transit', label: 'Transit', columns: false, ramp: badRamp, low: 'Bus route', high: 'Stop' },
  {
    id: 'popDensity',
    label: 'Density',
    columns: true,
    ramp: stops([[0, [120, 200, 255]], [1, [110, 60, 200]]], (t) => Math.min(0.85, t * 3)),
    low: 'Sparse',
    high: 'Crowded',
  },
  {
    id: 'policeCover',
    label: 'Police',
    columns: false,
    ramp: stops([[0, [120, 180, 255]], [1, [30, 90, 230]]], (t) => Math.min(0.8, t * 1.6)),
    low: 'None',
    high: 'Strong',
  },
  {
    id: 'fireCover',
    label: 'Fire',
    columns: false,
    ramp: stops([[0, [255, 190, 120]], [1, [235, 90, 30]]], (t) => Math.min(0.8, t * 1.6)),
    low: 'None',
    high: 'Strong',
  },
  {
    id: 'waterCover',
    label: 'Water',
    columns: false,
    ramp: stops([[0, [150, 220, 255]], [1, [20, 120, 220]]], (t) => Math.min(0.8, t * 1.6)),
    low: 'None',
    high: 'Full',
  },
  {
    id: 'garbageCover',
    label: 'Garbage',
    columns: false,
    ramp: stops([[0, [200, 230, 150]], [1, [90, 150, 40]]], (t) => Math.min(0.8, t * 1.6)),
    low: 'None',
    high: 'Collected',
  },
  {
    id: 'healthCover',
    label: 'Health',
    columns: false,
    ramp: stops([[0, [255, 200, 210]], [1, [215, 50, 80]]], (t) => Math.min(0.8, t * 1.6)),
    low: 'None',
    high: 'Full',
  },
  {
    id: 'educationCover',
    label: 'Education',
    columns: false,
    ramp: stops([[0, [230, 210, 255]], [1, [120, 70, 210]]], (t) => Math.min(0.8, t * 1.6)),
    low: 'None',
    high: 'Full',
  },
  {
    id: 'growth',
    label: 'Growth',
    columns: false,
    // 128 is no change: red where people leave, green where they arrive.
    ramp: (v) => (v < 128 ? [220, 60, 50, Math.min(220, (128 - v) * 4)] : [60, 200, 100, Math.min(220, (v - 128) * 4)]),
    low: 'Shrinking',
    high: 'Growing',
  },
];

export const overlayDef = (id: OverlayName): OverlayDef | undefined => OVERLAYS.find((o) => o.id === id);

const COLUMN_HEIGHT = 5;
/** Columns rise only where a value is notable (about a tenth of the scale). */
export const COLUMN_THRESHOLD = 24;

const drapeVertex = /* glsl */ `
  varying vec2 vMapPos;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vMapPos = world.xz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;
const drapeFragment = /* glsl */ `
  uniform sampler2D uOverlay;
  uniform float uMapSize;
  varying vec2 vMapPos;
  void main() {
    vec4 c = texture2D(uOverlay, vMapPos / uMapSize);
    if (c.a < 0.02) discard;
    gl_FragColor = c;
  }
`;
const IDENTITY = new Quaternion();
const POWER_ON: Rgba = [255, 215, 60, 170];
const POWER_OFF: Rgba = [230, 50, 50, 220];
const BUS_ROUTE: Rgba = [255, 205, 40, 210];
const BUS_STOP: Rgba = [255, 255, 255, 235];
/** Low, medium and high density. */
export const TIER_COLOURS: [Rgba, Rgba, Rgba] = [
  [150, 225, 255, 150],
  [70, 150, 240, 190],
  [45, 60, 205, 225],
];

/**
 * Data overlays: a colour texture over the whole map that the terrain
 * shader blends in, plus translucent columns for some fields. Field values
 * come straight from the sim's block fields; power comes from tile flags.
 */
export class OverlayLayer {
  readonly group = new Group();
  /** Shared with the terrain material. */
  readonly uniforms: { uOverlay: { value: DataTexture }; uOverlayOn: { value: number }; uMapSize: { value: number } };
  /** The raw values last shown (block field or power flags), for tests and the minimap. */
  values: Uint8Array | null = null;
  /** RGBA pixels of the current overlay texture, for the minimap. */
  pixels: Uint8Array | null = null;
  active: OverlayName | null = null;
  private readonly blockTexture: DataTexture;
  private readonly tileTexture: DataTexture;
  private readonly columns: InstancedMesh;
  private readonly side: number;
  /** Unlit, see-through material for the terrain drape that carries the colours. */
  readonly drapeMaterial: ShaderMaterial;

  constructor(private readonly mirror: CityMirror) {
    this.side = mirror.size >> 1;
    this.blockTexture = this.makeTexture(this.side, LinearFilter);
    this.tileTexture = this.makeTexture(mirror.size, NearestFilter);
    this.uniforms = { uOverlay: { value: this.blockTexture }, uOverlayOn: { value: 0 }, uMapSize: { value: mirror.size } };
    this.drapeMaterial = new ShaderMaterial({
      vertexShader: drapeVertex,
      fragmentShader: drapeFragment,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
    });
    this.columns = new InstancedMesh(
      new BoxGeometry(1.3, 1, 1.3).translate(0, 0.5, 0),
      new MeshBasicMaterial({ transparent: true, opacity: 0.6, depthWrite: false }),
      this.side * this.side,
    );
    this.columns.count = 0;
    this.columns.frustumCulled = false;
    this.columns.renderOrder = 6;
    this.group.add(this.columns);
  }

  /** Number of columns showing, for tests. */
  get columnCount(): number {
    return this.columns.count;
  }

  setActive(name: OverlayName | null): void {
    this.active = name;
    this.uniforms.uOverlayOn.value = name ? 1 : 0;
    this.columns.count = 0;
    this.values = null;
    this.pixels = null;
    this.refreshTiles();
  }

  /** New values for a block field; ignored unless it is the active overlay. */
  setField(name: FieldName, data: Uint8Array): void {
    const def = overlayDef(name);
    if (this.active !== name || !def) return;
    this.values = data;
    const pixels = this.blockTexture.image.data as Uint8Array;
    for (let b = 0; b < data.length; b++) pixels.set(def.ramp(data[b] ?? 0), b * 4);
    this.blockTexture.needsUpdate = true;
    this.uniforms.uOverlay.value = this.blockTexture;
    this.pixels = pixels;
    this.updateColumns(def, data);
  }

  /** Rebuild the active tile overlay from the mirror (call when chunks change). */
  refreshTiles(): void {
    if (this.active === 'power') this.refreshPower();
    else if (this.active === 'zoneTier') this.refreshZoneTier();
    else if (this.active === 'transit') this.refreshTransit();
  }

  /** Bus routes in yellow and stops in white, from the same search the sim runs. */
  private refreshTransit(): void {
    const m = this.mirror;
    const pixels = this.tileTexture.image.data as Uint8Array;
    pixels.fill(0);
    const values = new Uint8Array(m.size * m.size);
    for (const route of findBusNetwork(m.size, m.tiles).routes) {
      for (const t of route) {
        pixels.set(BUS_ROUTE, t * 4);
        values[t] = 1;
      }
    }
    for (let i = 0; i < m.size * m.size; i++) {
      if (m.tiles[i] !== TileKind.BusStop) continue;
      pixels.set(BUS_STOP, i * 4);
      values[i] = 2;
    }
    this.tileTexture.needsUpdate = true;
    this.uniforms.uOverlay.value = this.tileTexture;
    this.values = values;
    this.pixels = pixels;
  }

  /** Zone lots shaded light to dark by density tier. */
  private refreshZoneTier(): void {
    const m = this.mirror;
    const pixels = this.tileTexture.image.data as Uint8Array;
    const values = new Uint8Array(m.size * m.size);
    for (let i = 0; i < m.size * m.size; i++) {
      const zoned = zoneOf(m.tiles[i] ?? 0) !== null;
      const tier = m.zoneTier[i] ?? 0;
      pixels.set(zoned ? (TIER_COLOURS[tier] ?? TIER_COLOURS[0]) : [0, 0, 0, 0], i * 4);
      values[i] = zoned ? tier + 1 : 0;
    }
    this.tileTexture.needsUpdate = true;
    this.uniforms.uOverlay.value = this.tileTexture;
    this.values = values;
    this.pixels = pixels;
  }

  /** Powered tiles in yellow, dark zones in red. */
  private refreshPower(): void {
    const m = this.mirror;
    const pixels = this.tileTexture.image.data as Uint8Array;
    const values = new Uint8Array(m.size * m.size);
    for (let i = 0; i < m.size * m.size; i++) {
      const f = m.flags[i] ?? 0;
      let c: Rgba = [0, 0, 0, 0];
      if (f & TileFlag.POWERED) {
        c = POWER_ON;
        values[i] = 2;
      } else if (zoneOf(m.tiles[i] ?? 0)) {
        c = POWER_OFF;
        values[i] = 1;
      }
      pixels.set(c, i * 4);
    }
    this.tileTexture.needsUpdate = true;
    this.uniforms.uOverlay.value = this.tileTexture;
    this.values = values;
    this.pixels = pixels;
  }

  private updateColumns(def: OverlayDef, data: Uint8Array): void {
    if (!def.columns) {
      this.columns.count = 0;
      return;
    }
    const matrix = new Matrix4();
    const color = new Color();
    let n = 0;
    for (let b = 0; b < data.length; b++) {
      const v = data[b] ?? 0;
      if (v < COLUMN_THRESHOLD) continue;
      const x = (b % this.side) * 2 + 1;
      const z = Math.floor(b / this.side) * 2 + 1;
      matrix.compose(new Vector3(x, this.mirror.heightAt(x, z), z), IDENTITY, new Vector3(1, (v / 255) * COLUMN_HEIGHT, 1));
      this.columns.setMatrixAt(n, matrix);
      const [r, g, bl] = def.ramp(v);
      this.columns.setColorAt(n, color.setRGB(r / 255, g / 255, bl / 255));
      n++;
    }
    this.columns.count = n;
    this.columns.instanceMatrix.needsUpdate = true;
    if (this.columns.instanceColor) this.columns.instanceColor.needsUpdate = true;
  }

  private makeTexture(size: number, filter: typeof LinearFilter | typeof NearestFilter): DataTexture {
    const texture = new DataTexture(new Uint8Array(size * size * 4), size, size, RGBAFormat);
    texture.magFilter = filter;
    texture.minFilter = filter;
    texture.needsUpdate = true;
    return texture;
  }
}

