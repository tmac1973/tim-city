/**
 * The art palette. Every visual module takes its colors from here so the
 * diorama keeps one consistent look. Values are sRGB hex.
 */
export const PALETTE = {
  sky: 0x9fd3f0,
  skyHorizon: 0xe8f1ec,
  groundBounce: 0x6b5a3e,
  sun: 0xfff1d6,

  sandWet: 0xb9a77a,
  sand: 0xdcc893,
  grassLight: 0x9cc65f,
  grassDark: 0x5c8f43,
  earth: 0x8c7650,
  rock: 0x8f8d80,
  rockLight: 0xc4c2b4,
  skirt: 0x6e5638,
  skirtDark: 0x4a3925,

  waterShallow: 0x3fa9b8,
  waterDeep: 0x1a5f8f,
  foam: 0xf4fbf8,

  trunk: 0x7a5233,
  pine: 0x2f6b3a,
  leaf: 0x4f8f3a,
  leafLight: 0x77a843,

  asphalt: 0x4a4e55,
  sidewalk: 0xb8b3a6,
  marking: 0xe9d57e,
  ballast: 0x8b8379,
  sleeper: 0x6b4a32,
  steel: 0xa3a9b0,
  concrete: 0xaaa69c,
  pylon: 0xa7adb3,
  wire: 0x2c2f33,
  tunnelMouth: 0x141414,

  previewOk: 0x5ee07a,
  previewBad: 0xff5a5a,
  previewBlocked: 0xffb347,

  cursor: 0xffffff,
} as const;
