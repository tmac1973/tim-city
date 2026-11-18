import type { Speed } from '@/shared/constants';
import type { DifficultyName } from '@/shared/difficulty';
import type {
  CityInfo,
  MainToWorker,
  SimCommand,
  SimEvent,
  TerrainOptions,
  TickMessage,
  WorkerToMain,
} from '@/shared/protocol';

type Listener<T> = (value: T) => void;

/** Main-thread handle on the sim worker. */
export class SimBridge {
  private readonly worker: Worker;
  private readonly tickListeners = new Set<Listener<TickMessage>>();
  private readonly eventListeners = new Set<Listener<SimEvent>>();
  private pendingInit: { resolve: Listener<CityInfo>; reject: Listener<Error> } | null = null;

  constructor() {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<WorkerToMain>) => {
      this.receive(e.data);
    };
    this.worker.onerror = (e) => {
      this.fail(new Error(`Sim worker failed: ${e.message}`));
    };
  }

  init(info: CityInfo, terrain: TerrainOptions, difficulty: DifficultyName = 'medium'): Promise<CityInfo> {
    return new Promise((resolve, reject) => {
      this.pendingInit = { resolve, reject };
      this.send({ type: 'init', ...info, terrain, difficulty });
    });
  }

  setSpeed(speed: Speed): void {
    this.send({ type: 'setSpeed', speed });
  }

  command(command: SimCommand): void {
    this.send({ type: 'command', command });
  }

  /** Returns an unsubscribe function. */
  onTick(listener: Listener<TickMessage>): () => void {
    this.tickListeners.add(listener);
    return () => this.tickListeners.delete(listener);
  }

  onEvent(listener: Listener<SimEvent>): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  private send(message: MainToWorker): void {
    this.worker.postMessage(message);
  }

  private receive(message: WorkerToMain): void {
    switch (message.type) {
      case 'ready':
        this.pendingInit?.resolve({ name: message.name, seed: message.seed, size: message.size });
        this.pendingInit = null;
        return;
      case 'tick':
        for (const listener of this.tickListeners) listener(message);
        return;
      case 'event':
        for (const listener of this.eventListeners) listener(message.event);
        return;
      case 'error':
        this.fail(new Error(message.message));
        return;
    }
  }

  private fail(error: Error): void {
    console.error(error.message);
    this.pendingInit?.reject(error);
    this.pendingInit = null;
  }
}
