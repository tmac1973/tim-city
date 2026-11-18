/** Agent caps at High quality. Quality scales them (see AGENT_SCALE). */
export const AGENT_CAPS = {
  cars: 2500,
  trains: 12,
  planes: 6,
  ships: 6,
  pedestrians: 400,
  fireTrucks: 10,
  policeCars: 12,
  /** One per bus route; they count toward the vehicle budget like cars. */
  buses: 40,
} as const;

type AgentKind = keyof typeof AGENT_CAPS;

/** Low 0.25, Medium 0.5, High 1, Ultra 1.5; set by the graphics quality setting. */
export const AGENT_SCALE = { value: 1 };
const MAX_AGENT_SCALE = 1.5;

/** The live cap for a kind of agent at the current quality. */
export const capOf = (kind: AgentKind): number => Math.max(1, Math.round(AGENT_CAPS[kind] * AGENT_SCALE.value));

/** Instance buffer size: room for the highest quality, so changing it needs no reallocation. */
export const poolSize = (kind: AgentKind): number => Math.ceil(AGENT_CAPS[kind] * MAX_AGENT_SCALE);

/** Pedestrians only appear when the camera is closer than this. */
export const PEDESTRIAN_RANGE = 30;
