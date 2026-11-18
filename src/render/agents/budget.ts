/** Global agent caps. Phase 20 scales them with the graphics quality setting. */
export const AGENT_CAPS = {
  cars: 2500,
  trains: 12,
  planes: 6,
  ships: 6,
  pedestrians: 400,
  fireTrucks: 10,
  policeCars: 12,
} as const;

/** Pedestrians only appear when the camera is closer than this. */
export const PEDESTRIAN_RANGE = 30;
