import { skyState } from './store';

const WEATHER_NAMES = { clear: 'Clear', overcast: 'Overcast', rain: 'Rain', storm: 'Storm', snow: 'Snow', fog: 'Fog' } as const;

/** A sun by day, a moon by night. */
function SunMoon({ night }: { night: boolean }) {
  return night ? (
    <path d="M14.5 3.5a7 7 0 1 0 6 9.8A6 6 0 0 1 14.5 3.5z" fill="#c9d4f2" />
  ) : (
    <g stroke="#f6c453" stroke-width="2" stroke-linecap="round">
      <circle cx="12" cy="12" r="4.2" fill="#f6c453" stroke="none" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <line key={a} x1="12" y1="3" x2="12" y2="5.2" transform={`rotate(${String(a)} 12 12)`} />
      ))}
    </g>
  );
}

function WeatherGlyph({ kind }: { kind: keyof typeof WEATHER_NAMES }) {
  if (kind === 'clear') return null;
  const cloud = <path d="M7 17h10a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6 1.4A2.8 2.8 0 0 0 7 17z" fill="#dfe4ea" />;
  return (
    <g transform="translate(9 7) scale(0.62)">
      {kind === 'fog' ? (
        <g stroke="#dfe4ea" stroke-width="2.2" stroke-linecap="round">
          <line x1="4" y1="9" x2="20" y2="9" />
          <line x1="2" y1="14" x2="18" y2="14" />
          <line x1="6" y1="19" x2="22" y2="19" />
        </g>
      ) : (
        cloud
      )}
      {(kind === 'rain' || kind === 'storm') && (
        <g stroke="#7fb6ff" stroke-width="2" stroke-linecap="round">
          <line x1="9" y1="19" x2="8" y2="22" />
          <line x1="13" y1="19" x2="12" y2="22" />
          <line x1="17" y1="19" x2="16" y2="22" />
        </g>
      )}
      {kind === 'storm' && <path d="M13 17l-2.5 4h3l-2 4" stroke="#f6c453" stroke-width="1.8" fill="none" />}
      {kind === 'snow' && (
        <g fill="#ffffff">
          <circle cx="9" cy="21" r="1.3" />
          <circle cx="13" cy="22.5" r="1.3" />
          <circle cx="17" cy="21" r="1.3" />
        </g>
      )}
    </g>
  );
}

/** Time of day and weather, in the top bar. */
export function TimeOfDayBadge() {
  const s = skyState.value;
  if (!s) return null;
  const label = `${s.time} · ${WEATHER_NAMES[s.weather]}`;
  return (
    <span class="sky-badge" title={label} aria-label={label}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <SunMoon night={s.night} />
        <WeatherGlyph kind={s.weather} />
      </svg>
      <span class="sky-time">{s.time}</span>
    </span>
  );
}
