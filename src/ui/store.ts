import { signal } from '@preact/signals';
import { type Speed, START_YEAR } from '@/shared/constants';
import type { BrushSize, BudgetInfo, Census, CityInfo, GameDate, QueryResult, ToolId, Valves } from '@/shared/protocol';

/** UI state shared by components and the input controllers. */
export const cityInfo = signal<CityInfo | null>(null);
export const date = signal<GameDate>({ year: START_YEAR, month: 0, tick: 0 });
export const funds = signal(0);
export const speed = signal<Speed>('paused');
export const census = signal<Census | null>(null);
export const valves = signal<Valves>({ r: 0, c: 0, i: 0 });
export const budget = signal<BudgetInfo | null>(null);
export const budgetOpen = signal(false);
/** Shown once the city goes bankrupt, until dismissed. */
export const gameOver = signal(false);

const AUTO_BUDGET_KEY = 'timcity.autoBudget';
function readAutoBudget(): boolean {
  try {
    return localStorage.getItem(AUTO_BUDGET_KEY) !== 'off';
  } catch {
    return true;
  }
}
/** Open the budget window at every year end (a per-player preference). */
export const autoBudget = signal(readAutoBudget());
autoBudget.subscribe((on) => {
  try {
    localStorage.setItem(AUTO_BUDGET_KEY, on ? 'on' : 'off');
  } catch {
    // Storage may be unavailable (private mode); the preference just won't persist.
  }
});

/** The last query tool result, shown in the query panel until closed. */
export const queryResult = signal<QueryResult | null>(null);
/** Construction tools, plus the read-only query tool. */
export type UiTool = ToolId | 'query';
export const activeTool = signal<UiTool | null>(null);
export const brush = signal<BrushSize>(3);

/** Text that follows the mouse while a tool is active: cost or the reason it can't build. */
export const costTag = signal<{ x: number; y: number; text: string; ok: boolean } | null>(null);

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error';
}
export const toasts = signal<Toast[]>([]);

let nextToast = 1;
export function toast(text: string, tone: Toast['tone'] = 'error', ms = 2600): void {
  const id = nextToast++;
  // Repeating the newest message refreshes it instead of stacking copies.
  const others = toasts.value.filter((t) => t.text !== text);
  toasts.value = [...others.slice(-3), { id, text, tone }];
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }, ms);
}

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
export const formatMoney = (value: number): string => money.format(value);
export const formatCount = (value: number): string => value.toLocaleString('en-US');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const formatDate = (d: GameDate): string => `${MONTHS[d.month] ?? ''} ${String(d.year)}`;
