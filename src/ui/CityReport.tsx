import type { ProblemId } from '@/shared/protocol';
import { evaluation, formatCount, reportOpen } from './store';

export const PROBLEM_LABELS: Record<ProblemId, string> = {
  crime: 'Crime',
  pollution: 'Pollution',
  housing: 'Housing costs',
  taxes: 'Taxes',
  traffic: 'Traffic',
  unemployment: 'Unemployment',
  fires: 'Fire risk',
  water: 'Water',
  garbage: 'Garbage',
};

/** Problems below this score are not worth an advisor's time. */
const ADVISOR_THRESHOLD = 10;

function Gauge({ value }: { value: number }) {
  // A half-circle dial from red (0) through amber to green (100).
  const angle = Math.PI * (1 - value / 100);
  const x = 60 + 46 * Math.cos(angle);
  const y = 60 - 46 * Math.sin(angle);
  const colour = value >= 60 ? '#6ee08a' : value >= 35 ? '#ffcf5a' : '#ff7a6b';
  return (
    <svg viewBox="0 0 120 70" class="gauge" role="img" aria-label={`Approval ${String(value)}%`}>
      <path d="M14 60 A46 46 0 0 1 106 60" fill="none" stroke="rgb(255 255 255 / 12%)" stroke-width="10" stroke-linecap="round" />
      <path
        d={`M14 60 A46 46 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}`}
        fill="none"
        stroke={colour}
        stroke-width="10"
        stroke-linecap="round"
      />
      <text x="60" y="56" text-anchor="middle" class="gauge-value">
        {value}%
      </text>
    </svg>
  );
}

/** The mayor's report: approval, score, class, the opinion poll and the advisors. */
export function CityReport({ onShowMe }: { onShowMe: (x: number, y: number) => void }) {
  const e = evaluation.value;
  if (!reportOpen.value) return null;
  const close = () => (reportOpen.value = false);
  return (
    <div class="modal-backdrop" onClick={(ev) => ev.target === ev.currentTarget && close()}>
      <section class="report panel" role="dialog" aria-label="City report">
        <header>
          <h2>City report</h2>
          <button type="button" aria-label="Close" onClick={close}>
            ×
          </button>
        </header>
        {!e ? (
          <p class="muted">The first report arrives at the end of the first month.</p>
        ) : (
          <div class="report-grid">
            <div>
              <Gauge value={e.approval} />
              <p class="report-caption">Mayor's approval</p>
              <dl class="report-stats">
                <div>
                  <dt>City class</dt>
                  <dd>{e.cityClass}</dd>
                </div>
                <div>
                  <dt>Population</dt>
                  <dd>{formatCount(e.population)}</dd>
                </div>
                <div>
                  <dt>Score</dt>
                  <dd>
                    {e.score}
                    <span class={e.scoreChange >= 0 ? 'up' : 'down'}>
                      {' '}
                      {e.scoreChange >= 0 ? '▲' : '▼'} {Math.abs(e.scoreChange)}
                    </span>
                  </dd>
                </div>
              </dl>
              <h3>What citizens say is wrong</h3>
              {e.problems.slice(0, 4).map((p) => (
                <div class="poll" key={p.id}>
                  <span>{PROBLEM_LABELS[p.id]}</span>
                  <div class="poll-bar">
                    <div style={{ width: `${String(p.percent)}%` }} />
                  </div>
                  <span class="poll-pct">{p.percent}%</span>
                </div>
              ))}
            </div>
            <div>
              <h3>Advisors</h3>
              {e.problems.filter((p) => p.score >= ADVISOR_THRESHOLD).length === 0 && (
                <p class="muted">No serious problems. Keep it up.</p>
              )}
              {e.problems
                .filter((p) => p.score >= ADVISOR_THRESHOLD)
                .slice(0, 4)
                .map((p) => (
                  <article class="advice" key={p.id}>
                    <header>
                      <strong>{PROBLEM_LABELS[p.id]}</strong>
                      <span class="severity" style={{ width: `${String(Math.min(100, p.score))}%` }} />
                    </header>
                    <p>{p.cause}</p>
                    {p.x !== null && p.y !== null && (
                      <button
                        type="button"
                        onClick={() => {
                          close();
                          onShowMe(p.x ?? 0, p.y ?? 0);
                        }}
                      >
                        Show me
                      </button>
                    )}
                  </article>
                ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
