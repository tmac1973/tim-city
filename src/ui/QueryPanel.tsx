import { queryResult } from './store';

/** What the query tool found on the clicked tile. */
export function QueryPanel() {
  const q = queryResult.value;
  if (!q) return null;
  return (
    <aside class="query panel" aria-label="Tile details">
      <header>
        <strong>{q.title}</strong>
        <button type="button" aria-label="Close" onClick={() => (queryResult.value = null)}>
          ×
        </button>
      </header>
      <dl>
        {q.details.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <span class="query-where">
        Tile {q.x}, {q.y}
      </span>
    </aside>
  );
}
