import { headlines } from './store';

/** The latest headline along the bottom; hover for the last few, click one to see where it happened. */
export function NewsTicker({ onShowMe }: { onShowMe: (x: number, y: number) => void }) {
  const list = headlines.value;
  const latest = list[0];
  if (!latest) return null;
  const item = (h: (typeof list)[number]) => (
    <button
      type="button"
      key={h.id}
      class={h.x !== null ? 'headline link' : 'headline'}
      onClick={() => {
        if (h.x !== null && h.y !== null) onShowMe(h.x, h.y);
      }}
    >
      <span class="headline-date">{h.date}</span>
      {h.text}
    </button>
  );
  return (
    <div class="ticker panel" role="log" aria-label="News">
      <div class="ticker-older">{list.slice(1, 6).map(item)}</div>
      {item(latest)}
    </div>
  );
}
