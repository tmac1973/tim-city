import type { ToolCommand } from '@/shared/protocol';
import type { ScriptAction } from './replay';

const build = (tool: ToolCommand['tool'], x0: number, y0: number, x1 = x0, y1 = y0): ToolCommand => ({
  type: 'tool',
  tool,
  x0,
  y0,
  x1,
  y1,
  brush: 1,
  tunnel: false,
  dryRun: false,
  requestId: 0,
});

/**
 * A small scripted town used by save tests and the committed fixture: a
 * coal plant, power line, road, homes, shops and industry, plus a police
 * station and a park, all on the flat terrain of an ungenerated map.
 */
export const FIXTURE_CITY: ScriptAction[] = [
  { atTick: 0, command: { type: 'setFunds', amount: 50_000 } },
  // Tests built on this town are about growth and saving, not disasters.
  { atTick: 0, command: { type: 'setRandomDisasters', enabled: false } },
  { atTick: 0, command: build('coal', 20, 20) },
  { atTick: 0, command: build('power', 23, 20, 25, 20) },
  { atTick: 0, command: build('road', 26, 24, 60, 24) },
  { atTick: 0, command: build('residential', 27, 21, 39, 21) },
  { atTick: 0, command: build('commercial', 42, 21, 45, 21) },
  { atTick: 0, command: build('industrial', 48, 21, 54, 21) },
  { atTick: 0, command: build('residential', 27, 27, 39, 27) },
  { atTick: 0, command: build('power', 26, 21, 26, 27) },
  { atTick: 40, command: build('police', 58, 21) },
  { atTick: 40, command: build('park', 42, 26, 46, 28) },
];

/**
 * The fixture town with everything version 6 added: density tiers, a wind
 * turbine, a water tower and landfill, landmarks, bus stops along the main
 * road, and a subway out to a district no road reaches.
 */
export const FIXTURE_CITY_V6: ScriptAction[] = [
  // Landmarks and the subway unlock at City; the script grants it.
  { atTick: 0, command: { type: 'setClassReached', cityClass: 2 } },
  ...FIXTURE_CITY,
  // The southern homes become low density.
  { atTick: 50, command: { ...build('residential', 27, 27, 39, 27), tier: 0 } },
  // Water towers by the homes and by the shops and industry, each with a turbine to run it,
  // a landfill central to everything, and a fire station.
  { atTick: 50, command: build('waterTower', 31, 31) },
  { atTick: 50, command: build('wind', 32, 30) },
  { atTick: 50, command: build('waterTower', 50, 31) },
  { atTick: 50, command: build('wind', 51, 30) },
  { atTick: 50, command: build('road', 28, 33, 52, 33) },
  { atTick: 50, command: build('landfill', 41, 36) },
  { atTick: 50, command: build('wind', 44, 36) },
  { atTick: 50, command: build('fire', 37, 37) },
  { atTick: 50, command: build('wind', 63, 30) },
  { atTick: 50, command: build('museum', 70, 30) },
  { atTick: 50, command: build('statue', 64, 26) },
  ...[28, 38, 48, 58].map((x): ScriptAction => ({ atTick: 50, command: build('busStop', x, 25) })),
  // The far district: homes powered by their own turbine, a road and a station.
  { atTick: 50, command: build('road', 90, 62, 100, 62) },
  { atTick: 50, command: build('residential', 93, 60) },
  { atTick: 50, command: build('wind', 91, 60) },
  { atTick: 50, command: build('subwayStation', 96, 63) },
  { atTick: 50, command: build('subwayStation', 60, 25) },
  { atTick: 50, command: build('subway', 60, 25, 96, 63) },
];
