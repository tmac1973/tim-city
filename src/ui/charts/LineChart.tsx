import { useState } from 'preact/hooks';

export interface Series {
  name: string;
  color: string;
  values: number[];
  format: (v: number) => string;
}

const W = 640;
const H = 220;
const PAD = 8;

/**
 * Line chart of several series that may have very different units. Each
 * line is scaled to its own maximum (so shapes compare); hovering reads out
 * the real values at that point.
 */
export function LineChart({ series, labels }: { series: Series[]; labels: string[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = labels.length;
  const x = (i: number) => PAD + (n <= 1 ? 0 : (i / (n - 1)) * (W - 2 * PAD));
  const path = (s: Series) => {
    const max = Math.max(1, ...s.values.map(Math.abs));
    return s.values
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${(H - PAD - (Math.max(0, v) / max) * (H - 2 * PAD)).toFixed(1)}`)
      .join(' ');
  };
  const onMove = (e: MouseEvent) => {
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const fx = ((e.clientX - rect.left) / rect.width) * W;
    setHover(n <= 1 ? 0 : Math.min(n - 1, Math.max(0, Math.round(((fx - PAD) / (W - 2 * PAD)) * (n - 1)))));
  };

  if (n === 0) return <p class="muted">History builds up as the months go by.</p>;
  return (
    <div class="chart">
      <svg viewBox={`0 0 ${String(W)} ${String(H)}`} onMouseMove={onMove} onMouseLeave={() => { setHover(null); }} role="img" aria-label="History chart">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={PAD} x2={W - PAD} y1={PAD + f * (H - 2 * PAD)} y2={PAD + f * (H - 2 * PAD)} class="grid" />
        ))}
        {series.map((s) => (
          <path key={s.name} d={path(s)} fill="none" stroke={s.color} stroke-width="2" stroke-linejoin="round" />
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD} y2={H - PAD} class="cursor" />}
      </svg>
      <div class="chart-readout">
        <span class="muted">{labels[hover ?? n - 1]}</span>
        {series.map((s) => (
          <span key={s.name}>
            <i style={{ background: s.color }} />
            {s.name} {s.format(s.values[hover ?? n - 1] ?? 0)}
          </span>
        ))}
      </div>
    </div>
  );
}
