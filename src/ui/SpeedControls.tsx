import { useEffect, useRef } from 'preact/hooks';
import type { Speed } from '@/shared/constants';
import { Icon } from './icons';
import { speed } from './store';

const SPEEDS: { id: Speed; label: string; key: string }[] = [
  { id: 'paused', label: 'Pause', key: 'Space' },
  { id: 'slow', label: 'Slow', key: '1' },
  { id: 'normal', label: 'Normal', key: '2' },
  { id: 'fast', label: 'Fast', key: '3' },
];

export function SpeedControls({ onSpeed }: { onSpeed: (speed: Speed) => void }) {
  // Space toggles pause and resumes at the speed it paused from.
  const resumeTo = useRef<Speed>('normal');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select')) return;
      const choice: Speed | null =
        e.code === 'Space'
          ? speed.value === 'paused'
            ? resumeTo.current
            : 'paused'
          : e.code === 'Digit1'
            ? 'slow'
            : e.code === 'Digit2'
              ? 'normal'
              : e.code === 'Digit3'
                ? 'fast'
                : null;
      if (!choice) return;
      e.preventDefault();
      if (speed.value !== 'paused') resumeTo.current = speed.value;
      onSpeed(choice);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onSpeed]);

  return (
    <div class="speed panel" role="group" aria-label="Game speed">
      {SPEEDS.map((s) => (
        <button
          key={s.id}
          type="button"
          class={speed.value === s.id ? 'active' : ''}
          aria-pressed={speed.value === s.id}
          title={`${s.label} (${s.key})`}
          aria-label={s.label}
          onMouseDown={(e) => {
            e.preventDefault();
          }}
          onClick={() => {
            if (speed.value !== 'paused') resumeTo.current = speed.value;
            onSpeed(s.id);
          }}
        >
          <Icon name={s.id} />
        </button>
      ))}
    </div>
  );
}
