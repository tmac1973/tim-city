import type { MapSize, Speed } from './constants';

export interface CityInfo {
  name: string;
  seed: string;
  size: MapSize;
}

/** New-map sliders, each 0–100. */
export interface TerrainOptions {
  water: number;
  forest: number;
  hills: number;
}

export const DEFAULT_TERRAIN: TerrainOptions = { water: 50, forest: 40, hills: 40 };

export interface GameDate {
  year: number;
  /** 0–11 */
  month: number;
  /** 0–15 within the month */
  tick: number;
}

export type ToolId =
  | 'road'
  | 'rail'
  | 'power'
  | 'bulldoze'
  | 'raise'
  | 'lower'
  | 'level'
  | 'residential'
  | 'commercial'
  | 'industrial'
  | 'coal'
  | 'nuclear'
  | 'police'
  | 'fire'
  | 'park'
  | 'largePark';
export type BrushSize = 1 | 3 | 5;

/**
 * One use of a construction tool. Line tools run from (x0, y0) to (x1, y1);
 * bulldoze clears that rectangle; terraform tools use (x0, y0) and the brush.
 */
export interface ToolCommand {
  type: 'tool';
  tool: ToolId;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  brush: BrushSize;
  /** Shift held: road/rail drags bore a tunnel. */
  tunnel: boolean;
  /** Plan and report cost only; never queued, never changes state. */
  dryRun: boolean;
  /** Echoed in the result so the UI can match answers to requests. */
  requestId: number;
}

/**
 * Commands the main thread asks the sim to apply. They are queued and applied
 * at the start of the next tick, in arrival order, so replays are exact.
 */
export type SimCommand =
  /** Debug and test command: overwrite one tile's kind. */
  | { type: 'setTile'; x: number; y: number; kind: number }
  | ToolCommand
  /** Read-only: answered at once, never queued. */
  | { type: 'query'; x: number; y: number; requestId: number };

export interface ToolResult {
  type: 'toolResult';
  requestId: number;
  dryRun: boolean;
  ok: boolean;
  cost: number;
  reason?: string;
  /** Tile indices the tool would touch. */
  tiles: number[];
  /** Tile indices that block it. */
  bad: number[];
}

export interface QueryResult {
  type: 'queryResult';
  requestId: number;
  x: number;
  y: number;
  /** Short name of what is on the tile. */
  title: string;
  /** Label → value lines, in display order. */
  details: [string, string][];
}

export type SimEvent =
  | { type: 'monthEnd'; year: number; month: number }
  | { type: 'yearEnd'; year: number }
  /** Some zones lost power because the grid's plants are at capacity. */
  | { type: 'brownout'; unpowered: number }
  | ToolResult
  | QueryResult;

export interface Census {
  /** Residents, from residential density. */
  resPop: number;
  comJobs: number;
  indJobs: number;
  zones: { r: number; c: number; i: number };
  plants: { coal: number; nuclear: number };
  powerSupply: number;
  powerDemand: number;
  unpoweredZones: number;
}

/** R, C, I demand, each −2000 … +2000. */
export interface Valves {
  r: number;
  c: number;
  i: number;
}

/** One 32×32 chunk's data, copied out of the sim so it can be transferred. */
export interface ChunkSlice {
  id: number;
  tiles: Uint16Array;
  flags: Uint8Array;
  /** Footprint positions (see CityState.parts); 1 marks a building's top-left tile. */
  parts: Uint8Array;
  /** 33×33 corner heights covering the chunk's tiles. */
  heights: Uint8Array;
}

export type MainToWorker =
  | ({ type: 'init'; terrain: TerrainOptions } & CityInfo)
  | { type: 'setSpeed'; speed: Speed }
  | { type: 'command'; command: SimCommand };

export interface TickMessage {
  type: 'tick';
  date: GameDate;
  funds: number;
  speed: Speed;
  census: Census;
  valves: Valves;
  chunks: ChunkSlice[];
}

export type WorkerToMain =
  | ({ type: 'ready' } & CityInfo)
  | TickMessage
  | { type: 'event'; event: SimEvent }
  | { type: 'error'; message: string };
