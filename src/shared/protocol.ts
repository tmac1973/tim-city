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
  | 'largePark'
  | 'stadium'
  | 'seaport'
  | 'airport';
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
  /** Debug and test command: set the treasury. */
  | { type: 'setFunds'; amount: number }
  | { type: 'setTaxRate'; rate: number }
  | { type: 'setFunding'; service: keyof Funding; percent: number }
  | { type: 'issueBond' }
  | { type: 'repayBond'; index: number }
  | { type: 'setRandomDisasters'; enabled: boolean }
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
  /** The year's books closed; the budget window shows them. */
  | { type: 'yearBudget'; year: number; ledger: Ledger; net: number }
  /** Out of money with no bonds left to issue. */
  | { type: 'bankrupt' }
  /** The city reached a new class. */
  | { type: 'milestone'; cityClass: CityClass; population: number }
  /** Yearly verdict: approval and score, with the change since last year. */
  | { type: 'evaluation'; year: number; approval: number; approvalChange: number; score: number; scoreChange: number }
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

export interface Census {
  /** Residents, from residential density. */
  resPop: number;
  comJobs: number;
  indJobs: number;
  zones: { r: number; c: number; i: number };
  plants: { coal: number; nuclear: number };
  /** Powered special buildings. */
  specials: { stadium: number; seaport: number; airport: number };
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
  | ({ type: 'init'; terrain: TerrainOptions; difficulty: DifficultyName } & CityInfo)
  | { type: 'setSpeed'; speed: Speed }
  | { type: 'command'; command: SimCommand };

export interface TickMessage {
  type: 'tick';
  date: GameDate;
  funds: number;
  speed: Speed;
  census: Census;
  valves: Valves;
  budget: BudgetInfo;
  evaluation: Evaluation | null;
  chunks: ChunkSlice[];
}

export type WorkerToMain =
  | ({ type: 'ready' } & CityInfo)
  | TickMessage
  | { type: 'event'; event: SimEvent }
  | { type: 'error'; message: string };
