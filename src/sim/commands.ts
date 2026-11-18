import type { SimCommand } from '@/shared/protocol';
import type { CityState } from './state';

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
}
