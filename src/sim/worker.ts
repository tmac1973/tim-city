/// <reference lib="webworker" />
import { SPEED_MS_PER_MONTH, type Speed, TICKS_PER_MONTH } from '@/shared/constants';
import type { MainToWorker, WorkerToMain } from '@/shared/protocol';
import { takeDirtyChunks } from './chunks';
import { deserialize, serialize } from './serialize';
import { Simulation } from './sim';
import { generateTerrain } from './terrain/generate';
import { runTool } from './tools';
import { queryTile } from './tools/query';
import { computeLedger } from './systems/budget';
import { DIFFICULTY } from '@/shared/difficulty';
import type { BudgetInfo, FieldName } from '@/shared/protocol';
import { previewTerrain } from './preview';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

let sim: Simulation | null = null;
let speed: Speed = 'paused';
let timer: ReturnType<typeof setTimeout> | undefined;
/** The block field the main thread wants, and whether to send it on the next publish. */
let subscribed: FieldName | null = null;
let fieldDue = false;
/** Agents always need traffic; send it with the first tick after (re)starting. */
let trafficDue = true;

function post(message: WorkerToMain, transfer: Transferable[] = []): void {
  ctx.postMessage(message, transfer);
}

/** Ship dirty chunks and the current date, then any events. */
function publish(current: Simulation): void {
  const chunks = takeDirtyChunks(current.state);
  const transfer: Transferable[] = chunks.flatMap((c) => [c.tiles.buffer, c.flags.buffer, c.parts.buffer, c.zoneTier.buffer, c.heights.buffer]);
  // Fields settle by the month's last tick, so that is when an overlay refreshes.
  let field: { name: FieldName; data: Uint8Array } | undefined;
  if (subscribed && (fieldDue || current.state.date.tick === 0)) {
    field = { name: subscribed, data: current.state.field(subscribed).slice() };
    transfer.push(field.data.buffer);
    fieldDue = false;
  }
  let traffic: Uint8Array | undefined;
  if (trafficDue || current.state.date.tick === 0) {
    traffic = current.state.field('traffic').slice();
    transfer.push(traffic.buffer);
    trafficDue = false;
  }
  post(
    {
      type: 'tick',
      date: { ...current.state.date },
      funds: current.state.funds,
      speed,
      census: current.state.census,
      valves: { ...current.state.valves },
      budget: budgetInfo(current),
      evaluation: current.state.evaluation,
      classReached: current.state.classReached,
      disasters: current.state.disasters,
      ...(field ? { field } : {}),
      ...(traffic ? { traffic } : {}),
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

/**
 * Dev builds log each system's average time per tick once a game year.
 * Timing only: it never changes what the sim does.
 */
function profileTick(current: Simulation): void {
  const scheduler = current.scheduler;
  scheduler.timings ??= new Map();
  const { month, tick } = current.state.date;
  if (month !== 0 || tick !== 0) return;
  const ticks = 12 * TICKS_PER_MONTH;
  const report = [...scheduler.timings]
    .sort((a, b) => b[1] - a[1])
    .map(([name, ms]) => `${name} ${(ms / ticks).toFixed(2)}`)
    .join(', ');
  if (report) console.log(`[sim] ms per tick over the year: ${report}`);
  scheduler.timings.clear();
}

function schedule(): void {
  clearTimeout(timer);
  const msPerMonth = SPEED_MS_PER_MONTH[speed];
  if (!sim || msPerMonth === 0) return;
  timer = setTimeout(() => {
    if (!sim) return;
    if (import.meta.env.DEV) profileTick(sim);
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
    case 'load': {
      const state = deserialize(message.bytes);
      sim = new Simulation({ name: state.name, seed: state.seed, size: state.size }, state);
      post({ type: 'ready', name: state.name, seed: state.seed, size: state.size });
      publish(sim);
      schedule();
      return;
    }
    case 'requestSnapshot': {
      if (!sim) throw new Error('Snapshot requested before init');
      const bytes = serialize(sim.state);
      post({ type: 'snapshot', requestId: message.requestId, bytes }, [bytes.buffer]);
      return;
    }
    case 'generatePreview': {
      const { heights, tiles } = previewTerrain({ name: 'Preview', seed: message.seed, size: message.size }, message.terrain);
      post({ type: 'preview', requestId: message.requestId, size: message.size, heights, tiles }, [heights.buffer, tiles.buffer]);
      return;
    }
    case 'subscribeField':
      subscribed = message.name;
      fieldDue = true;
      if (sim) publish(sim);
      return;
    case 'requestHistory':
      if (sim) post({ type: 'history', monthly: sim.state.history.monthly, yearly: sim.state.history.yearly });
      return;
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
