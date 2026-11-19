import { type QualityName, UI_SCALE_MAX, UI_SCALE_MIN } from '@/shared/settings';
import { effectiveUiScale, settings, settingsOpen, volumes } from '../store';

const KEYS: [string, string][] = [
  ['W A S D / arrows', 'Pan the camera'],
  ['Right-drag', 'Rotate'],
  ['Right-click', 'Bulldoze what is under the pointer'],
  ['Middle-drag', 'Tilt'],
  ['Wheel', 'Zoom'],
  ['Space, 1, 2, 3', 'Pause and game speed'],
  ['Esc', 'Drop the tool, close a window, or open the pause menu'],
  ['[ and ]', 'Brush size for terraforming'],
  ['Shift while dragging', 'Tunnel roads and rail through hills'],
  ['Tab', 'Next vehicle while following one'],
  ['M', 'Mute or unmute'],
  ['Ctrl+S', 'Quick save'],
];

/** Graphics quality, sound levels and controls. */
export function SettingsWindow() {
  if (!settingsOpen.value) return null;
  const s = settings.value;
  const v = volumes.value;
  const close = () => (settingsOpen.value = false);
  const volume = (key: 'master' | 'music' | 'sfx' | 'ambience', label: string) => (
    <label class="slider">
      <span>
        {label} <b>{Math.round(v[key] * 100)}</b>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(v[key] * 100)}
        aria-label={`${label} volume`}
        onInput={(e) => {
          volumes.value = { ...volumes.value, [key]: Number(e.currentTarget.value) / 100 };
        }}
      />
    </label>
  );

  return (
    <div class="modal-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
      <section class="settings panel" role="dialog" aria-label="Settings">
        <header>
          <h2>Settings</h2>
          <button type="button" class="close" aria-label="Close" onClick={close}>
            ×
          </button>
        </header>
        <h3>Graphics</h3>
        <fieldset class="choice">
          <legend>Quality</legend>
          {(['low', 'medium', 'high', 'ultra'] as QualityName[]).map((q) => (
            <button key={q} type="button" aria-pressed={s.quality === q} onClick={() => (settings.value = { ...s, quality: q })}>
              {q[0]?.toUpperCase()}
              {q.slice(1)}
            </button>
          ))}
        </fieldset>
        <label class="slider">
          <span>
            Interface size <b>{Math.round(s.uiScale * 100)}%</b>
            {effectiveUiScale.value < s.uiScale && <em class="muted"> {Math.round(effectiveUiScale.value * 100)}% fits this window</em>}
          </span>
          <input
            type="range"
            min={UI_SCALE_MIN}
            max={UI_SCALE_MAX}
            step={0.05}
            value={s.uiScale}
            aria-label="Interface size"
            onChange={(e) => (settings.value = { ...s, uiScale: Number(e.currentTarget.value) })}
          />
        </label>
        <h3>Sound</h3>
        <label class="check">
          <input type="checkbox" checked={v.muted} onChange={(e) => (volumes.value = { ...v, muted: e.currentTarget.checked })} />
          Mute (M)
        </label>
        {volume('master', 'Master')}
        {volume('music', 'Music')}
        {volume('sfx', 'Effects')}
        {volume('ambience', 'Ambience')}
        <h3>Controls</h3>
        <label class="check">
          <input type="checkbox" checked={s.edgeScroll} onChange={(e) => (settings.value = { ...s, edgeScroll: e.currentTarget.checked })} />
          Pan when the mouse touches the window edge
        </label>
        <label class="slider">
          <span>
            Mouse sensitivity <b>{s.sensitivity.toFixed(1)}×</b>
          </span>
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.1}
            value={s.sensitivity}
            aria-label="Mouse sensitivity"
            onInput={(e) => (settings.value = { ...s, sensitivity: Number(e.currentTarget.value) })}
          />
        </label>
        <label class="check">
          <input type="checkbox" checked={s.tips} onChange={(e) => (settings.value = { ...s, tips: e.currentTarget.checked })} />
          Show tips
        </label>
        <table class="keys">
          <tbody>
            {KEYS.map(([key, what]) => (
              <tr key={key}>
                <th>{key}</th>
                <td>{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <footer>
          <button type="button" class="primary" onClick={close}>
            Done
          </button>
        </footer>
      </section>
    </div>
  );
}
