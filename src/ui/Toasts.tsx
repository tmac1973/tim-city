import { costTag, toasts, uiScale } from './store';

export function Toasts() {
  return (
    <div class="toasts" role="status" aria-live="polite">
      {toasts.value.map((t) => (
        <div key={t.id} class={`toast ${t.tone}`}>
          {t.text}
          {t.action && (
            <button
              type="button"
              class="toast-action"
              onClick={() => {
                t.action?.run();
                toasts.value = toasts.value.filter((other) => other.id !== t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/** Cost or failure reason next to the mouse while a tool is active. */
export function CostTag() {
  const tag = costTag.value;
  if (!tag) return null;
  // The mouse is in screen pixels; #app is zoomed by the interface scale.
  const k = uiScale();
  return (
    <div
      class={tag.ok ? 'cost-tag ok' : 'cost-tag bad'}
      data-testid="cost-tag"
      style={{ transform: `translate(${String(tag.x / k + 18)}px, ${String(tag.y / k + 18)}px)` }}
    >
      {tag.text}
    </div>
  );
}
