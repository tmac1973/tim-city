import type { SimCommand } from '@/shared/protocol';
import type { CityState } from './state';
import { issueBond, repayBond } from './systems/budget';

type CommandType = SimCommand['type'];
type Handler<T extends CommandType> = (state: CityState, command: Extract<SimCommand, { type: T }>) => void;

/** Queues commands and applies them, in arrival order, at the start of a tick. */
export class CommandQueue {
  private queue: SimCommand[] = [];
  private readonly handlers = new Map<CommandType, (state: CityState, command: SimCommand) => void>();

  on<T extends CommandType>(type: T, handler: Handler<T>): void {
    this.handlers.set(type, handler as (state: CityState, command: SimCommand) => void);
  }

  push(command: SimCommand): void {
    this.queue.push(command);
  }

  get pending(): number {
    return this.queue.length;
  }

  applyAll(state: CityState): void {
    const batch = this.queue;
    this.queue = [];
    for (const command of batch) {
      const handler = this.handlers.get(command.type);
      if (!handler) throw new Error(`No handler for command ${command.type}`);
      handler(state, command);
    }
  }
}

/** Handlers every simulation has. Later phases register tool handlers. */
export function registerCoreCommands(queue: CommandQueue): void {
  queue.on('setTile', (state, { x, y, kind }) => {
    if (!state.inBounds(x, y)) return;
    state.tiles[state.index(x, y)] = kind;
    state.markDirty(x, y);
  });
  queue.on('setFunds', (state, { amount }) => {
    state.funds = amount;
  });
  queue.on('setTaxRate', (state, { rate }) => {
    state.taxRate = Math.min(20, Math.max(0, Math.round(rate)));
  });
  queue.on('setFunding', (state, { service, percent }) => {
    state.funding[service] = Math.min(100, Math.max(0, Math.round(percent)));
  });
  queue.on('issueBond', (state) => {
    issueBond(state);
  });
  queue.on('repayBond', (state, { index }) => {
    repayBond(state, index);
  });
  queue.on('setRandomDisasters', (state, { enabled }) => {
    state.randomDisasters = enabled;
  });
}
