import { computed, signal } from '@preact/signals';
import type { OverlayName } from '@/render/overlays';
import { type Speed, START_YEAR } from '@/shared/constants';
import type {
  ActiveDisaster,
  BrushSize,
  BudgetInfo,
  Census,
  CityInfo,
  Evaluation,
  GameDate,
  HistorySample,
  QueryResult,
  ToolId,
  Valves,
} from '@/shared/protocol';
import { loadSettings, saveSettings, type Settings } from '@/shared/settings';

/** UI state shared by components and the input controllers. */
export const cityInfo = signal<CityInfo | null>(null);
export const date = signal<GameDate>({ year: START_YEAR, month: 0, tick: 0 });
export const funds = signal(0);
export const speed = signal<Speed>('paused');
export const census = signal<Census | null>(null);
export const valves = signal<Valves>({ r: 0, c: 0, i: 0 });
export const budget = signal<BudgetInfo | null>(null);
export const evaluation = signal<Evaluation | null>(null);
/** Highest city class reached; it decides which tools are unlocked. */
export const classReached = signal(0);
export const reportOpen = signal(false);
export const overlay = signal<OverlayName | null>(null);
export const graphsOpen = signal(false);
export const savesOpen = signal(false);
export const disastersOpen = signal(false);
export const activeDisasters = signal<ActiveDisaster[]>([]);
/** The slot this city was loaded from or last saved to. */
export const currentSlot = signal<string | null>(null);
export const history = signal<{ monthly: HistorySample[]; yearly: HistorySample[] }>({ monthly: [], yearly: [] });

export interface Headline {
  id: number;
  text: string;
  date: string;
  x: number | null;
  y: number | null;
}
/** Newest first, at most 30. */
export const headlines = signal<Headline[]>([]);
let nextHeadline = 1;
export function addHeadline(text: string, date: string, x: number | null, y: number | null): void {
  headlines.value = [{ id: nextHeadline++, text, date, x, y }, ...headlines.value].slice(0, 30);
}
export const budgetOpen = signal(false);
/** Shown once the city goes bankrupt, until dismissed. */
export const gameOver = signal(false);
/** Time of day and weather for the top bar badge (null until the renderer runs). */
export const skyState = signal<{ time: string; night: boolean; weather: 'clear' | 'overcast' | 'rain' | 'storm' | 'snow' | 'fog' } | null>(null);
/** Sound levels, 0–1, kept in this browser. */
function storedVolumes(): { master: number; music: number; sfx: number; ambience: number; muted: boolean } {
  const fallback = { master: 0.8, music: 0.45, sfx: 0.8, ambience: 0.6, muted: false };
  try {
    const raw = localStorage.getItem('timcity.volumes');
    return raw ? { ...fallback, ...(JSON.parse(raw) as Partial<typeof fallback>) } : fallback;
  } catch {
    return fallback;
  }
}
export const volumes = signal(storedVolumes());
volumes.subscribe((v) => {
  try {
    localStorage.setItem('timcity.volumes', JSON.stringify(v));
  } catch {
    // Private mode or blocked storage: the levels just are not remembered.
  }
});

/** Title screen (with the sample city behind it) or a city being played. */
export const screen = signal<'title' | 'game'>('game');
export const newCityOpen = signal(false);
export const settingsOpen = signal(false);
/** Bumped whenever a save, autosave or delete finishes: open save lists re-read. */
export const savesChanged = signal(0);
export const pauseOpen = signal(false);

/** Player settings, saved to this browser whenever they change. */
export const settings = signal<Settings>(loadSettings());
settings.subscribe((s) => {
  saveSettings(s);
});

/** The window size, kept current, for the interface scale. */
const windowSize = signal(typeof window === 'undefined' ? { w: 1920, h: 1080 } : { w: window.innerWidth, h: window.innerHeight });
if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => {
    windowSize.value = { w: window.innerWidth, h: window.innerHeight };
  });
}

/**
 * The interface scale in use: the chosen size, but no larger than leaves the
 * top bar (about 1200 px wide) and the tool panel room to fit the window.
 */
export const effectiveUiScale = computed(() => {
  const chosen = settings.value.uiScale;
  if (chosen <= 1) return chosen;
  const { w, h } = windowSize.value;
  return Math.max(1, Math.min(chosen, w / 1200, h / 700));
});
effectiveUiScale.subscribe((k) => {
  // styles.css zooms #app by this; viewport units divide by it to stay on screen.
  if (typeof document !== 'undefined') document.documentElement.style.setProperty('--ui-scale', String(k));
});

/** Interface scale: CSS pixels on screen per CSS pixel inside #app. */
export const uiScale = (): number => effectiveUiScale.value;

/** Counts the onboarding tips watch, refreshed every couple of seconds. */
export const cityFacts = signal({ roads: 0, lines: 0, zones: 0, plants: 0, unpowered: 0, pop: 0 });

/** Set when the player triggers a disaster from the menu: the camera flies to it. */
export const watchNext = signal(false);
/** The kind of vehicle the camera is riding with, or null. */
export const following = signal<string | null>(null);

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
/** Density tier the zone tools paint (ZoneTier). */
export const zoneTier = signal(1);
/** Zone type the Block tool paints inside its ring (ZoneType), or null for road only. */
export const blockFill = signal<number | null>(null);
/** The toolbar category whose flyout is open. */
export const openCategory = signal<string | null>(null);
/** The tool last picked in each toolbar category, shown on its button. */
export const lastToolByCategory = signal<Record<string, UiTool>>({});

/** Text that follows the mouse while a tool is active: cost or the reason it can't build. */
export const costTag = signal<{ x: number; y: number; text: string; ok: boolean } | null>(null);

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error';
  action?: { label: string; run: () => void };
}
export const toasts = signal<Toast[]>([]);

let nextToast = 1;
export function toast(text: string, tone: Toast['tone'] = 'error', ms = 2600, action?: Toast['action']): void {
  const id = nextToast++;
  // Repeating the newest message refreshes it instead of stacking copies.
  const others = toasts.value.filter((t) => t.text !== text);
  toasts.value = [...others.slice(-3), { id, text, tone, ...(action ? { action } : {}) }];
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }, ms);
}

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
export const formatMoney = (value: number): string => money.format(value);
export const formatCount = (value: number): string => value.toLocaleString('en-US');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const formatDate = (d: GameDate): string => `${MONTHS[d.month] ?? ''} ${String(d.year)}`;
