import { costTag, toasts } from './store';

export function Toasts() {
  return (
    <div class="toasts" role="status" aria-live="polite">
      {toasts.value.map((t) => (
        <div key={t.id} class={`toast ${t.tone}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

/** Cost or failure reason next to the mouse while a tool is active. */
export function CostTag() {
  const tag = costTag.value;
  if (!tag) return null;
  return (
    <div
      class={tag.ok ? 'cost-tag ok' : 'cost-tag bad'}
      data-testid="cost-tag"
      style={{ transform: `translate(${String(tag.x + 18)}px, ${String(tag.y + 18)}px)` }}
    >
      {tag.text}
    </div>
  );
}
