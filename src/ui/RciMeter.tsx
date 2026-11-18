import { VALVE_LIMIT } from '@/sim/systems/demand';
import { valves } from './store';

const BARS = [
  { key: 'r', label: 'R', name: 'Residential', color: '#5fd36b' },
  { key: 'c', label: 'C', name: 'Commercial', color: '#4da3ff' },
  { key: 'i', label: 'I', name: 'Industrial', color: '#f5c542' },
] as const;

/** Demand for each zone type: bars grow up for demand, down for surplus. */
export function RciMeter() {
  const v = valves.value;
  return (
    <div class="rci panel" role="group" aria-label="Zone demand">
      {BARS.map((bar) => {
        const value = v[bar.key];
        const share = Math.min(1, Math.abs(value) / VALVE_LIMIT);
        const verdict = value > 150 ? 'wanted' : value < -150 ? 'surplus' : 'balanced';
        return (
          <div class="rci-bar" key={bar.key} title={`${bar.name} demand: ${verdict}`}>
            <div class="rci-track">
              <div
                class="rci-fill"
                style={{
                  background: bar.color,
                  height: `${String(share * 50)}%`,
                  [value >= 0 ? 'bottom' : 'top']: '50%',
                }}
              />
            </div>
            <span class="rci-label">{bar.label}</span>
          </div>
        );
      })}
    </div>
  );
}
