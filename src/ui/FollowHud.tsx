import { following } from './store';

interface FollowHudProps {
  onNext: () => void;
  onStop: () => void;
}

/** Shown while the camera rides with a vehicle. */
export function FollowHud({ onNext, onStop }: FollowHudProps) {
  const label = following.value;
  if (label === null) return null;
  return (
    <aside class="follow panel" aria-label="Following">
      <span class="follow-label">
        Following <strong>{label}</strong>
      </span>
      <button type="button" onClick={onNext}>
        Next vehicle <kbd>Tab</kbd>
      </button>
      <button type="button" onClick={onStop}>
        Stop <kbd>Esc</kbd>
      </button>
    </aside>
  );
}
