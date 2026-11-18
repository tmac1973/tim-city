import { pauseOpen, savesOpen, settingsOpen } from '../store';

interface PauseProps {
  onResume: () => void;
  onQuit: () => void;
}

/** Esc in a game: resume, save, load, settings, or back to the title. */
export function PauseMenu({ onResume, onQuit }: PauseProps) {
  if (!pauseOpen.value) return null;
  return (
    <div
      class="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onResume();
      }}
    >
      <section class="pause panel" role="dialog" aria-label="Paused">
        <h2>Paused</h2>
        <nav class="title-menu">
          <button type="button" class="primary" onClick={onResume}>
            Resume
          </button>
          <button type="button" onClick={() => (savesOpen.value = true)}>
            Save
          </button>
          <button type="button" onClick={() => (savesOpen.value = true)}>
            Load
          </button>
          <button type="button" onClick={() => (settingsOpen.value = true)}>
            Settings
          </button>
          <button type="button" onClick={onQuit}>
            Quit to title
          </button>
        </nav>
      </section>
    </div>
  );
}
