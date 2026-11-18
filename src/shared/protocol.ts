import type { MapSize, Speed } from './constants';
import type { DifficultyName } from './difficulty';

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
  | 'block'
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
  | 'solar'
  | 'wind'
  | 'gas'
  | 'oil'
  | 'police'
  | 'fire'
  | 'park'
  | 'largePark'
  | 'stadium'
  | 'seaport'
  | 'airport';
/** Anything that can be locked until a city class: a tool, or an option of one. */
export type UnlockId = ToolId | 'zoneHigh';
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
  /** Zone tools: the density tier to paint (ZoneTier; medium when absent). */
  tier?: number;
  /** Block tool: the zone type to paint inside the ring (ZoneType), or absent for road only. */
  fill?: number;
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
  /** Debug and test command: set the treasury. */
  | { type: 'setFunds'; amount: number }
  | { type: 'setTaxRate'; rate: number }
  | { type: 'setFunding'; service: keyof Funding; percent: number }
  | { type: 'issueBond' }
  | { type: 'repayBond'; index: number }
  | { type: 'setRandomDisasters'; enabled: boolean }
  | { type: 'triggerDisaster'; disaster: DisasterType }
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
  /** A word before the cost tag's price, such as "Rezone". */
  label?: string;
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
  /** The year's books closed; the budget window shows them. */
  | { type: 'yearBudget'; year: number; ledger: Ledger; net: number }
  /** Out of money with no bonds left to issue. */
  | { type: 'bankrupt' }
  /** The city reached a new class. */
  | { type: 'milestone'; cityClass: CityClass; population: number; unlocked: UnlockId[] }
  /** Yearly verdict: approval and score, with the change since last year. */
  | { type: 'evaluation'; year: number; approval: number; approvalChange: number; score: number; scoreChange: number }
  /** A disaster began (or could not begin, with the reason). */
  | { type: 'disaster'; disaster: DisasterType; x: number; y: number }
  | { type: 'disasterRefused'; disaster: DisasterType; reason: string }
  /** A headline for the news ticker, optionally about one place. */
  | { type: 'news'; headline: string; x: number | null; y: number | null }
  /** A zone type stopped growing until the city builds a special building. */
  | { type: 'demandCap'; zone: 'r' | 'c' | 'i'; needs: 'stadium' | 'seaport' | 'airport' }
  | ToolResult
  | QueryResult;

export interface Funding {
  road: number;
  police: number;
  fire: number;
}

export interface Bond {
  /** Principal still owed. */
  principal: number;
  /** Yearly interest rate, e.g. 0.06. */
  rate: number;
  yearsLeft: number;
}

/** A year's money, by line. Income is positive, costs are positive amounts spent. */
export interface Ledger {
  residentialTax: number;
  commercialTax: number;
  industrialTax: number;
  roads: number;
  police: number;
  fire: number;
  bonds: number;
  /** Spent on building during the year (not part of the estimate). */
  construction: number;
}

export interface BudgetInfo {
  taxRate: number;
  funding: Funding;
  bonds: Bond[];
  /** The year just closed, once one has. */
  lastYear: Ledger | null;
  /** Next year's taxes and running costs at today's settings. */
  estimate: Ledger;
  /** Spending on construction so far this year. */
  constructionThisYear: number;
  difficulty: DifficultyName;
  randomDisasters: boolean;
  bankrupt: boolean;
}

export type ProblemId = 'crime' | 'pollution' | 'housing' | 'taxes' | 'traffic' | 'unemployment' | 'fires';

export interface Problem {
  id: ProblemId;
  /** 0–100; higher is worse. */
  score: number;
  /** Share of citizens naming it in the poll, percent (top four only). */
  percent: number;
  /** Where it is worst, as a tile, when there is such a place. */
  x: number | null;
  y: number | null;
  /** One plain sentence on what causes it there. */
  cause: string;
}

export const CITY_CLASSES = ['Village', 'Town', 'City', 'Capital', 'Metropolis', 'Megalopolis'] as const;
export type CityClass = (typeof CITY_CLASSES)[number];
/** Population at which each class starts. */
export const CLASS_THRESHOLDS = [0, 2_000, 10_000, 50_000, 100_000, 500_000] as const;

export interface Evaluation {
  /** 0–100. */
  approval: number;
  /** 0–1000. */
  score: number;
  /** Change since the last year end. */
  scoreChange: number;
  cityClass: CityClass;
  population: number;
  /** Every problem, worst first; the first four form the poll. */
  problems: Problem[];
}

/** One history sample (monthly or yearly). */
export interface HistorySample {
  year: number;
  month: number;
  population: number;
  comJobs: number;
  indJobs: number;
  funds: number;
  crime: number;
  pollution: number;
  traffic: number;
  landValue: number;
  approval: number;
  score: number;
}

export const DISASTERS = ['fire', 'flood', 'tornado', 'earthquake', 'planeCrash', 'shipwreck', 'meltdown', 'mirebeast'] as const;
export type DisasterType = (typeof DISASTERS)[number];

/** A disaster in progress, for the renderer and the menu. */
export interface ActiveDisaster {
  id: number;
  type: DisasterType;
  /** Current position (tile); for tornado and Mirebeast it moves. */
  x: number;
  y: number;
  /** Ticks since it started. */
  age: number;
  /** Ticks it will last, or until done. */
  duration: number;
  /** Direction of travel for movers (0 N, 1 E, 2 S, 3 W). */
  heading: number;
  /** Mirebeast's target block, as a tile. */
  targetX: number;
  targetY: number;
}

export interface Census {
  /** Residents, from residential density. */
  resPop: number;
  comJobs: number;
  indJobs: number;
  zones: { r: number; c: number; i: number };
  plants: { coal: number; nuclear: number; solar: number; wind: number; gas: number; oil: number };
  /** Powered special buildings. */
  specials: { stadium: number; seaport: number; airport: number };
  /** Landmarks built, powered or not (for disasters that need them). */
  landmarks: { airport: number; seaport: number };
  /** Water tiles on the map. */
  water: number;
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
  /** ZoneTier per tile (see CityState.zoneTier). */
  zoneTier: Uint8Array;
  /** 33×33 corner heights covering the chunk's tiles. */
  heights: Uint8Array;
}

/** Block fields an overlay can show (power comes from tile flags instead). */
export const FIELD_OVERLAYS = ['traffic', 'pollution', 'crime', 'landValue', 'popDensity', 'policeCover', 'fireCover', 'growth'] as const;
export type FieldName = (typeof FIELD_OVERLAYS)[number];

export type MainToWorker =
  | ({ type: 'init'; terrain: TerrainOptions; difficulty: DifficultyName } & CityInfo)
  | { type: 'setSpeed'; speed: Speed }
  | { type: 'command'; command: SimCommand }
  /** Send this block field with ticks (null: none). Not a sim command: it changes nothing. */
  | { type: 'subscribeField'; name: FieldName | null }
  | { type: 'requestHistory' }
  /** Start from a save (uncompressed bytes) instead of `init`. */
  | { type: 'load'; bytes: Uint8Array }
  | { type: 'requestSnapshot'; requestId: number }
  /** Generate terrain for the New City preview; changes nothing in the running city. */
  | { type: 'generatePreview'; requestId: number; seed: string; size: MapSize; terrain: TerrainOptions };

export interface TickMessage {
  type: 'tick';
  date: GameDate;
  funds: number;
  speed: Speed;
  census: Census;
  valves: Valves;
  budget: BudgetInfo;
  evaluation: Evaluation | null;
  /** Highest city class reached (an index into CITY_CLASSES); it decides which tools are unlocked. */
  classReached: number;
  /** This month is overcast: solar farms give less, and the sky leans cloudy. */
  overcast: boolean;
  /** Disasters in progress (empty most of the time). */
  disasters: ActiveDisaster[];
  /** The subscribed block field, when it changed (at month end, or on subscribing). */
  field?: { name: FieldName; data: Uint8Array };
  /** The traffic field for visible agents, at each month start and on the first tick. */
  traffic?: Uint8Array;
  chunks: ChunkSlice[];
}

export type WorkerToMain =
  | ({ type: 'ready' } & CityInfo)
  | TickMessage
  | { type: 'event'; event: SimEvent }
  | { type: 'history'; monthly: HistorySample[]; yearly: HistorySample[] }
  | { type: 'snapshot'; requestId: number; bytes: Uint8Array }
  | { type: 'preview'; requestId: number; size: MapSize; heights: Uint8Array; tiles: Uint16Array }
  | { type: 'error'; message: string };
