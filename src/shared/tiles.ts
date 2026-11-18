/**
 * Tile kinds are stored in a Uint16Array. Each later system owns a fixed
 * number range so new kinds never force a renumbering of saved maps:
 *   0–15 terrain · 16–63 transport · 64–79 power · 80–255 zones and buildings
 *   256–319 specials · 320–399 disaster tiles
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
