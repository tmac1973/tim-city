import { useEffect, useState } from 'preact/hooks';
import {
  activeDisasters,
  budgetOpen,
  cityFacts,
  disastersOpen,
  evaluation,
  graphsOpen,
  pauseOpen,
  reportOpen,
  savesOpen,
  settings,
  settingsOpen,
  uiScale,
} from '../store';
import { currentTip } from './tips';

/**
 * Where the bubble sits, beside its anchor (or at the bottom centre), in
 * #app pixels: the screen's pixels divided by the interface scale.
 */
function placeFor(selector: string | null): { left: number; top: number; arrow: 'left' | 'up' | 'down' } {
  const k = uiScale();
  const w = window.innerWidth / k;
  const h = window.innerHeight / k;
  const el = selector ? document.querySelector(selector) : null;
  if (!el) return { left: w / 2 - 170, top: h - 190, arrow: 'down' };
  const box = el.getBoundingClientRect();
  const r = { left: box.left / k, right: box.right / k, top: box.top / k, bottom: box.bottom / k, width: box.width / k, height: box.height / k };
  // Toolbar buttons sit on the left edge: point at them from the right.
  if (r.left < w / 3) return { left: r.right + 14, top: Math.max(70, r.top + r.height / 2 - 36), arrow: 'left' };
  if (r.top < 90) return { left: Math.min(w - 360, Math.max(12, r.left + r.width / 2 - 170)), top: r.bottom + 14, arrow: 'up' };
  return { left: Math.min(w - 360, Math.max(12, r.left + r.width / 2 - 170)), top: Math.max(70, r.top - 120), arrow: 'down' };
}

/** One dismissible onboarding tip at a time, pointing at what it talks about. */
export function TipBubble() {
  const s = settings.value;
  const facts = {
    ...cityFacts.value,
    budgetOpen: budgetOpen.value,
    problems: evaluation.value?.problems.filter((p) => p.percent > 0).length ?? 0,
    disasters: activeDisasters.value.length,
  };
  const tip = s.tips ? currentTip(facts, s.seenTips) : null;
  const [, setTick] = useState(0);
  // Anchors move as panels open and the window resizes; re-place now and then.
  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 500);
    return () => {
      clearInterval(timer);
    };
  }, []);
  // Out of the way while a menu or window is up.
  const covered = pauseOpen.value || settingsOpen.value || savesOpen.value || budgetOpen.value || reportOpen.value || graphsOpen.value || disastersOpen.value;
  if (!tip || covered) return null;
  const place = placeFor(tip.anchor);
  const dismiss = () => (settings.value = { ...s, seenTips: [...s.seenTips, tip.id] });
  return (
    <aside class={`tip panel tip-${place.arrow}`} style={{ left: `${String(place.left)}px`, top: `${String(place.top)}px` }} role="note" aria-label="Tip">
      <p>{tip.text}</p>
      <footer>
        <button type="button" class="tip-off" onClick={() => (settings.value = { ...s, tips: false })}>
          Don’t show tips
        </button>
        <button type="button" class="primary" onClick={dismiss}>
          Got it
        </button>
      </footer>
    </aside>
  );
}
