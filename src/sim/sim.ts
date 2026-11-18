import { MONTHS_PER_YEAR, TICKS_PER_MONTH } from '@/shared/constants';
import type { CityInfo, SimCommand, SimEvent } from '@/shared/protocol';
import { CommandQueue, registerCoreCommands } from './commands';
import { Scheduler } from './scheduler';
import { CityState } from './state';
import { triggerDisaster } from './disasters';
import { registerSystems } from './systems';
import { headlineFor } from './systems/news';
import { registerToolCommands } from './tools';
import { queryTile } from './tools/query';

/** The headless simulation. Runs in the worker and, for tests, in Node. */
export class Simulation {
  readonly state: CityState;
  readonly scheduler = new Scheduler();
  readonly commands = new CommandQueue();
  private events: SimEvent[] = [];

  /** A new city from `info`, or one restored from a save when `state` is given. */
  constructor(info: CityInfo, state?: CityState) {
    this.state = state ?? new CityState(info);
    registerCoreCommands(this.commands);
    // Every event may also make the news.
    const emit = (event: SimEvent) => {
      this.events.push(event);
      const news = headlineFor(event, this.state);
      if (news) this.events.push(news);
    };
    registerToolCommands(this.commands, emit);
    // Queries are answered at once by the worker; a queued one (from a replay) still answers.
    this.commands.on('query', (state, { x, y, requestId }) => { emit(queryTile(state, x, y, requestId)); });
    this.commands.on('triggerDisaster', (state, { disaster }) => {
      triggerDisaster(state, disaster, emit);
    });
    registerSystems(this.scheduler, emit);
  }

  enqueue(command: SimCommand): void {
    this.commands.push(command);
  }

  /**
   * Apply queued commands without advancing time, for building while paused.
   * This matches what the next step() would do first, so replays agree.
   */
  applyCommands(): void {
    this.commands.applyAll(this.state);
  }

  /** Advance one tick: commands, then systems, then the date. */
  step(): void {
    this.commands.applyAll(this.state);
    this.scheduler.runTick(this.state, this.state.date.tick);
    this.advanceDate();
  }

  /** Events emitted since the last call, oldest first. */
  drainEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  private advanceDate(): void {
    const date = this.state.date;
    date.tick++;
    if (date.tick < TICKS_PER_MONTH) return;

    date.tick = 0;
    this.events.push({ type: 'monthEnd', year: date.year, month: date.month });
    date.month++;
    if (date.month < MONTHS_PER_YEAR) return;

    date.month = 0;
    this.events.push({ type: 'yearEnd', year: date.year });
    date.year++;
  }
}
