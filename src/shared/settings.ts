export type QualityName = 'low' | 'medium' | 'high' | 'ultra';

export interface QualityPreset {
  /** Shadow map size; 0 turns shadows off. */
  shadowMap: number;
  /** Redraw shadows every Nth frame (1: every frame). */
  shadowEvery: number;
  bloom: boolean;
  tiltShift: boolean;
  smaa: boolean;
  /** Most device pixels per CSS pixel. */
  pixelRatio: number;
  /** Agent caps and particle emission, relative to High. */
  agents: number;
  particles: number;
}

export const QUALITY: Record<QualityName, QualityPreset> = {
  low: { shadowMap: 0, shadowEvery: 1, bloom: false, tiltShift: false, smaa: false, pixelRatio: 1, agents: 0.25, particles: 0.25 },
  medium: { shadowMap: 1024, shadowEvery: 2, bloom: true, tiltShift: true, smaa: false, pixelRatio: 1, agents: 0.5, particles: 0.5 },
  high: { shadowMap: 2048, shadowEvery: 1, bloom: true, tiltShift: true, smaa: true, pixelRatio: 2, agents: 1, particles: 1 },
  ultra: { shadowMap: 4096, shadowEvery: 1, bloom: true, tiltShift: true, smaa: true, pixelRatio: 2, agents: 1.5, particles: 1.5 },
};

export interface Settings {
  quality: QualityName;
  /** Pan when the mouse touches the window edge. */
  edgeScroll: boolean;
  /** Rotate and tilt speed multiplier, 0.5–2. */
  sensitivity: number;
  /** Size of the interface relative to its design size, 0.75–2. */
  uiScale: number;
  /** Show onboarding tips. */
  tips: boolean;
  /** Tips already shown and dismissed. */
  seenTips: string[];
}

export const DEFAULT_SETTINGS: Settings = { quality: 'high', edgeScroll: true, sensitivity: 1, uiScale: 1, tips: true, seenTips: [] };

const KEY = 'timcity.settings';

/** Read settings, falling back to defaults when storage is blocked or the value is bad. */
export function loadSettings(storage: Pick<Storage, 'getItem'> | null = safeStorage()): Settings {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const quality = parsed.quality && parsed.quality in QUALITY ? parsed.quality : DEFAULT_SETTINGS.quality;
    const sensitivity = typeof parsed.sensitivity === 'number' ? Math.min(2, Math.max(0.5, parsed.sensitivity)) : 1;
    const uiScale = typeof parsed.uiScale === 'number' ? clampUiScale(parsed.uiScale) : 1;
    return {
      quality,
      edgeScroll: parsed.edgeScroll ?? DEFAULT_SETTINGS.edgeScroll,
      sensitivity,
      uiScale,
      tips: parsed.tips ?? true,
      seenTips: Array.isArray(parsed.seenTips) ? parsed.seenTips.filter((t) => typeof t === 'string') : [],
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export const UI_SCALE_MIN = 0.75;
export const UI_SCALE_MAX = 2;

export function clampUiScale(scale: number): number {
  return Number.isFinite(scale) ? Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, scale)) : 1;
}

export function saveSettings(settings: Settings, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try {
    storage?.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Blocked storage: settings last for this visit only.
  }
}

/** localStorage, or null where touching it throws (some private modes). */
function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
