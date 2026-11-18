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
} as const;
export type TileKind = (typeof TileKind)[keyof typeof TileKind];

/** Bit flags stored per tile in a Uint8Array. */
export const TileFlag = {
  POWERED: 1 << 0,
  CONDUCTIVE: 1 << 1,
  BURNING: 1 << 2,
  ZONE_CENTER: 1 << 3,
  BULLDOZABLE: 1 << 4,
} as const;

export type Network = 'road' | 'rail' | 'power';

const ROAD = new Set<number>([TileKind.Road, TileKind.RoadPower, TileKind.RoadRail, TileKind.RoadBridge, TileKind.RoadTunnel]);
const RAIL = new Set<number>([TileKind.Rail, TileKind.RailPower, TileKind.RoadRail, TileKind.RailBridge, TileKind.RailTunnel]);
const POWER = new Set<number>([TileKind.PowerLine, TileKind.RoadPower, TileKind.RailPower, TileKind.PowerBridge]);
const BRIDGE = new Set<number>([TileKind.RoadBridge, TileKind.RailBridge, TileKind.PowerBridge]);
const TUNNEL = new Set<number>([TileKind.RoadTunnel, TileKind.RailTunnel]);

export const isRoad = (kind: number): boolean => ROAD.has(kind);
export const isRail = (kind: number): boolean => RAIL.has(kind);
export const isPower = (kind: number): boolean => POWER.has(kind);
export const isBridge = (kind: number): boolean => BRIDGE.has(kind);
export const isTunnel = (kind: number): boolean => TUNNEL.has(kind);
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
