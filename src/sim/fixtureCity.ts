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
