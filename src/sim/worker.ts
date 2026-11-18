/// <reference lib="webworker" />
import { SPEED_MS_PER_MONTH, type Speed, TICKS_PER_MONTH } from '@/shared/constants';
import type { MainToWorker, WorkerToMain } from '@/shared/protocol';
import { takeDirtyChunks } from './chunks';
import { Simulation } from './sim';
import { generateTerrain } from './terrain/generate';
import { runTool } from './tools';
import { queryTile } from './tools/query';
import { computeLedger } from './systems/budget';
import { DIFFICULTY } from '@/shared/difficulty';
import type { BudgetInfo } from '@/shared/protocol';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

let sim: Simulation | null = null;
let speed: Speed = 'paused';
let timer: ReturnType<typeof setTimeout> | undefined;

function post(message: WorkerToMain, transfer: Transferable[] = []): void {
  ctx.postMessage(message, transfer);
}

/** Ship dirty chunks and the current date, then any events. */
function publish(current: Simulation): void {
  const chunks = takeDirtyChunks(current.state);
  const transfer = chunks.flatMap((c) => [c.tiles.buffer, c.flags.buffer, c.parts.buffer, c.heights.buffer]);
  post(
    {
      type: 'tick',
      date: { ...current.state.date },
      funds: current.state.funds,
      speed,
      census: current.state.census,
      valves: { ...current.state.valves },
      budget: budgetInfo(current),
      chunks,
    },
    transfer,
  );
  for (const event of current.drainEvents()) post({ type: 'event', event });
}

function budgetInfo(current: Simulation): BudgetInfo {
  const s = current.state;
  return {
    taxRate: s.taxRate,
    funding: { ...s.funding },
    bonds: s.bonds.map((b) => ({ ...b })),
    lastYear: s.lastYear,
    estimate: computeLedger(s),
    constructionThisYear: s.constructionThisYear,
    difficulty: s.difficulty,
    randomDisasters: s.randomDisasters,
    bankrupt: s.bankrupt,
  };
}

function schedule(): void {
  clearTimeout(timer);
  const msPerMonth = SPEED_MS_PER_MONTH[speed];
  if (!sim || msPerMonth === 0) return;
  timer = setTimeout(() => {
    if (!sim) return;
    sim.step();
    publish(sim);
    schedule();
  }, msPerMonth / TICKS_PER_MONTH);
}

function handle(message: MainToWorker): void {
  switch (message.type) {
    case 'init': {
      const { name, seed, size, terrain, difficulty } = message;
      sim = new Simulation({ name, seed, size });
      sim.state.difficulty = difficulty;
      sim.state.funds = DIFFICULTY[difficulty].funds;
      generateTerrain(sim.state, terrain);
      post({ type: 'ready', name, seed, size });
      publish(sim);
      schedule();
      return;
    }
    case 'setSpeed':
      speed = message.speed;
      if (sim) publish(sim);
      schedule();
      return;
    case 'command':
      if (!sim) throw new Error('Command received before init');
      // Dry runs change nothing, so they answer at once instead of waiting
      // for a tick; that keeps the build preview responsive at any speed.
      if (message.command.type === 'tool' && message.command.dryRun) {
        post({ type: 'event', event: runTool(sim.state, message.command) });
        return;
      }
      if (message.command.type === 'query') {
        const { x, y, requestId } = message.command;
        post({ type: 'event', event: queryTile(sim.state, x, y, requestId) });
        return;
      }
      sim.enqueue(message.command);
      // While paused, apply at once so building still works.
      if (speed === 'paused') {
        sim.applyCommands();
        publish(sim);
      }
      return;
  }
}

ctx.onmessage = (e: MessageEvent<MainToWorker>) => {
  try {
    handle(e.data);
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
