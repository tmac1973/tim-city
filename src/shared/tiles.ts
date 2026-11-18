/**
 * Tile kinds are stored in a Uint16Array. Each later system owns a fixed
 * number range so new kinds never force a renumbering of saved maps:
 *   0–15 terrain · 16–63 transport · 64–79 power · 80–255 zones and buildings
 *   256–319 specials · 320–399 disaster tiles
 *
 * Network connections are not stored: a road connects to each neighbouring
 * tile that also carries road, and likewise for rail and power.
 */
export const TILE_RANGES = {
  terrain: [0, 15],
  transport: [16, 63],
  power: [64, 79],
  zones: [80, 255],
  specials: [256, 319],
  disasters: [320, 399],
} as const;

export const TileKind = {
  Empty: 0,
  Water: 1,
  Tree: 2,
  Rubble: 3,

  Road: 16,
  Rail: 17,
  PowerLine: 18,
  RoadPower: 19,
  RailPower: 20,
  RoadRail: 21,
  RoadBridge: 22,
  RailBridge: 23,
  PowerBridge: 24,
  RoadTunnel: 25,
  RailTunnel: 26,

  CoalPlant: 64,
  NuclearPlant: 65,

  PoliceStation: 230,
  FireStation: 231,
  Park: 232,
  LargePark: 233,

  Stadium: 256,
  Seaport: 257,
  Airport: 258,
} as const;
export type TileKind = (typeof TileKind)[keyof typeof TileKind];

/** Bit flags stored per tile in a Uint8Array. */
export const TileFlag = {
  POWERED: 1 << 0,
  CONDUCTIVE: 1 << 1,
  BURNING: 1 << 2,
  ZONE_CENTER: 1 << 3,
  BULLDOZABLE: 1 << 4,
  /** On a road tile: worn by low road funding; slows traffic. */
  POTHOLED: 1 << 5,
  /** On a zone centre: last month's trip found no destination. */
  TRIP_FAILED: 1 << 6,
} as const;

export type Network = 'road' | 'rail' | 'power';

const ROAD = new Set<number>([TileKind.Road, TileKind.RoadPower, TileKind.RoadRail, TileKind.RoadBridge, TileKind.RoadTunnel]);
const RAIL = new Set<number>([TileKind.Rail, TileKind.RailPower, TileKind.RoadRail, TileKind.RailBridge, TileKind.RailTunnel]);
const POWER = new Set<number>([TileKind.PowerLine, TileKind.RoadPower, TileKind.RailPower, TileKind.PowerBridge]);
const BRIDGE = new Set<number>([TileKind.RoadBridge, TileKind.RailBridge, TileKind.PowerBridge]);
const TUNNEL = new Set<number>([TileKind.RoadTunnel, TileKind.RailTunnel]);

/**
 * Network membership by kind as bit flags in a lookup table: these checks
 * sit in the hottest sim loops (trip searches), where a table beats a Set.
 */
const NET_ROAD = 1;
const NET_RAIL = 2;
const NET_POWER = 4;
const NET_BRIDGE = 8;
const NET_TUNNEL = 16;
const NETWORK_BITS = new Uint8Array(1024);
for (const [set, bit] of [[ROAD, NET_ROAD], [RAIL, NET_RAIL], [POWER, NET_POWER], [BRIDGE, NET_BRIDGE], [TUNNEL, NET_TUNNEL]] as const) {
  for (const kind of set) NETWORK_BITS[kind] = (NETWORK_BITS[kind] ?? 0) | bit;
}

export const isRoad = (kind: number): boolean => ((NETWORK_BITS[kind] ?? 0) & NET_ROAD) !== 0;
export const isRail = (kind: number): boolean => ((NETWORK_BITS[kind] ?? 0) & NET_RAIL) !== 0;
export const isPower = (kind: number): boolean => ((NETWORK_BITS[kind] ?? 0) & NET_POWER) !== 0;
export const isBridge = (kind: number): boolean => ((NETWORK_BITS[kind] ?? 0) & NET_BRIDGE) !== 0;
export const isTunnel = (kind: number): boolean => ((NETWORK_BITS[kind] ?? 0) & NET_TUNNEL) !== 0;
/** Road or rail: anything a trip can travel on. */
export const isTransportKind = (kind: number): boolean => ((NETWORK_BITS[kind] ?? 0) & (NET_ROAD | NET_RAIL)) !== 0;
export const isNetwork = (kind: number): boolean => kind >= 16 && kind <= 63;

export function carries(kind: number, network: Network): boolean {
  return network === 'road' ? isRoad(kind) : network === 'rail' ? isRail(kind) : isPower(kind);
}

/** Natural ground: nothing built on it. */
export function isOpenLand(kind: number): boolean {
  return kind === TileKind.Empty || kind === TileKind.Tree || kind === TileKind.Rubble;
}

/**
 * Multi-tile buildings: kind → side length in tiles. Every tile of a
 * footprint has the same kind; the bulldozer clears the whole footprint.
 * Later phases register zones, plants, stations and specials here.
 */
export const FOOTPRINTS = new Map<number, number>();

export function registerFootprint(kind: number, size: number): void {
  FOOTPRINTS.set(kind, size);
}

/**
 * Zones are 3×3 blocks. Every tile of a zone carries one kind that encodes
 * the zone type, its density (0 = empty lot … 8) and a land-value class
 * (0–3, for building variety): ZONE_BASE + type·36 + density·4 + class.
 */
export const ZoneType = { R: 0, C: 1, I: 2 } as const;
export type ZoneType = (typeof ZoneType)[keyof typeof ZoneType];
export const ZONE_BASE = 80;
export const MAX_DENSITY = 8;
const PER_TYPE = (MAX_DENSITY + 1) * 4;

export function zoneKind(type: ZoneType, density: number, landValueClass = 0): number {
  return ZONE_BASE + type * PER_TYPE + density * 4 + landValueClass;
}

export function zoneOf(kind: number): { type: ZoneType; density: number; landValueClass: number } | null {
  const offset = kind - ZONE_BASE;
  if (offset < 0 || offset >= 3 * PER_TYPE) return null;
  return {
    type: Math.floor(offset / PER_TYPE) as ZoneType,
    density: Math.floor((offset % PER_TYPE) / 4),
    landValueClass: offset % 4,
  };
}

export const ZONE_SIZE = 3;
export const PLANT_SIZE = 4;

for (const type of [ZoneType.R, ZoneType.C, ZoneType.I]) {
  for (let density = 0; density <= MAX_DENSITY; density++) {
    for (let lv = 0; lv < 4; lv++) registerFootprint(zoneKind(type, density, lv), ZONE_SIZE);
  }
}
registerFootprint(TileKind.CoalPlant, PLANT_SIZE);
registerFootprint(TileKind.NuclearPlant, PLANT_SIZE);
registerFootprint(TileKind.PoliceStation, ZONE_SIZE);
registerFootprint(TileKind.FireStation, ZONE_SIZE);
registerFootprint(TileKind.Park, 1);
registerFootprint(TileKind.LargePark, ZONE_SIZE);
export const STADIUM_SIZE = 4;
export const SEAPORT_SIZE = 4;
export const AIRPORT_SIZE = 6;
registerFootprint(TileKind.Stadium, STADIUM_SIZE);
registerFootprint(TileKind.Seaport, SEAPORT_SIZE);
registerFootprint(TileKind.Airport, AIRPORT_SIZE);

export const isPark = (kind: number): boolean => kind === TileKind.Park || kind === TileKind.LargePark;
