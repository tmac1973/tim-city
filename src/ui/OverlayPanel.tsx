import { useEffect, useRef } from 'preact/hooks';
import { OVERLAYS, overlayDef } from '@/render/overlays';
import { overlay } from './store';

/** Minimap, overlay buttons (F1–F9) and the active overlay's legend. */
export function OverlayPanel({ bindMinimap }: { bindMinimap: (canvas: HTMLCanvasElement) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvas.current) bindMinimap(canvas.current);
  }, [bindMinimap]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = /^F([1-9])$/.exec(e.key);
      if (!n || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      const def = OVERLAYS[Number(n[1]) - 1];
      if (def) overlay.value = overlay.value === def.id ? null : def.id;
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const active = overlay.value ? overlayDef(overlay.value) : undefined;
  const legend = active
    ? `linear-gradient(90deg, ${[0, 64, 128, 192, 255]
        .map((v) => {
          const [r, g, b, a] = active.ramp(v);
          return `rgba(${String(r)},${String(g)},${String(b)},${String(Math.max(0.35, a / 255))})`;
        })
        .join(', ')})`
    : '';

  return (
    <aside class="overlays panel" aria-label="Map overlays">
      <canvas ref={canvas} class="minimap" aria-label="Minimap" />
      <div class="overlay-buttons" role="group" aria-label="Overlay">
        {OVERLAYS.map((o, i) => (
          <button
            type="button"
            key={o.id}
            class={overlay.value === o.id ? 'active' : ''}
            aria-pressed={overlay.value === o.id}
            title={`${o.label} (F${String(i + 1)})`}
            onMouseDown={(e) => {
              e.preventDefault();
            }}
            onClick={() => (overlay.value = overlay.value === o.id ? null : o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {active && (
        <div class="legend">
          <div class="legend-bar" style={{ background: active.id === 'power' ? 'linear-gradient(90deg, #ffd73c 50%, #e63232 50%)' : legend }} />
          <div class="legend-labels">
            <span>{active.low}</span>
            <span>{active.high}</span>
          </div>
        </div>
      )}
    </aside>
  );
}
