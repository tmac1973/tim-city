import { useEffect, useState } from 'preact/hooks';
import type { HistorySample } from '@/shared/protocol';
import { LineChart, type Series } from './charts/LineChart';
import { formatCount, formatMoney, graphsOpen, history } from './store';

const SERIES: { key: keyof HistorySample; name: string; color: string; format: (v: number) => string }[] = [
  { key: 'population', name: 'Population', color: '#6ee08a', format: formatCount },
  { key: 'comJobs', name: 'Commerce jobs', color: '#4da3ff', format: formatCount },
  { key: 'indJobs', name: 'Industry jobs', color: '#f5c542', format: formatCount },
  { key: 'funds', name: 'Funds', color: '#e0e0e0', format: formatMoney },
  { key: 'crime', name: 'Crime', color: '#ff7a6b', format: (v) => String(v) },
  { key: 'pollution', name: 'Pollution', color: '#b58cff', format: (v) => String(v) },
  { key: 'traffic', name: 'Traffic', color: '#ff9f43', format: (v) => String(v) },
  { key: 'landValue', name: 'Land value', color: '#2ecc71', format: (v) => String(v) },
  { key: 'approval', name: 'Approval', color: '#ffcf5a', format: (v) => `${String(v)}%` },
  { key: 'score', name: 'Score', color: '#7fd1ff', format: (v) => String(v) },
];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** History charts: the last ten years by month, or up to 120 years by year. */
export function GraphsWindow({ request }: { request: () => void }) {
  const [range, setRange] = useState<'monthly' | 'yearly'>('monthly');
  const [shown, setShown] = useState<Set<keyof HistorySample>>(new Set(['population', 'comJobs', 'indJobs']));
  const open = graphsOpen.value;
  useEffect(() => {
    if (open) request();
  }, [open, request]);
  if (!open) return null;

  const samples = history.value[range];
  const labels = samples.map((s) => (range === 'monthly' ? `${MONTHS[s.month] ?? ''} ${String(s.year)}` : String(s.year)));
  const series: Series[] = SERIES.filter((s) => shown.has(s.key)).map((s) => ({
    name: s.name,
    color: s.color,
    format: s.format,
    values: samples.map((x) => x[s.key]),
  }));
  const toggle = (key: keyof HistorySample) => {
    const next = new Set(shown);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setShown(next);
  };
  const close = () => (graphsOpen.value = false);

  return (
    <div class="modal-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
      <section class="graphs panel" role="dialog" aria-label="Graphs">
        <header>
          <h2>Graphs</h2>
          <div class="segmented" role="group" aria-label="Range">
            <button type="button" class={range === 'monthly' ? 'active' : ''} onClick={() => { setRange('monthly'); }}>
              10 years
            </button>
            <button type="button" class={range === 'yearly' ? 'active' : ''} onClick={() => { setRange('yearly'); }}>
              120 years
            </button>
          </div>
          <button type="button" aria-label="Close" class="close" onClick={close}>
            ×
          </button>
        </header>
        <div class="chips">
          {SERIES.map((s) => (
            <button
              type="button"
              key={s.key}
              class={shown.has(s.key) ? 'chip on' : 'chip'}
              aria-pressed={shown.has(s.key)}
              onClick={() => { toggle(s.key); }}
            >
              <i style={{ background: s.color }} />
              {s.name}
            </button>
          ))}
        </div>
        <LineChart series={series} labels={labels} />
      </section>
    </div>
  );
}
