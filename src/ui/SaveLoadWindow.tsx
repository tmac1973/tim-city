import { useEffect, useRef, useState } from 'preact/hooks';
import { listSaves } from '@/save/saveManager';
import { cityInfo, currentSlot, formatCount, savesOpen, toast } from './store';

export interface SaveActions {
  save: (slot: string) => Promise<void>;
  load: (slot: string, auto: boolean) => void;
  remove: (slot: string, auto: boolean) => Promise<void>;
  exportCity: () => Promise<void>;
  importCity: (file: File) => Promise<void>;
}

type Listing = Awaited<ReturnType<typeof listSaves>>;

const when = (t: number) => new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Save slots and autosaves: save, load, delete, export and import. */
export function SaveLoadWindow({ actions }: { actions: SaveActions }) {
  // A fresh body on every open, so its state starts from the current city.
  return savesOpen.value ? <SaveLoadBody actions={actions} /> : null;
}

function SaveLoadBody({ actions }: { actions: SaveActions }) {
  const [saves, setSaves] = useState<Listing>([]);
  const [name, setName] = useState(() => currentSlot.value ?? cityInfo.value?.name ?? 'My city');
  const file = useRef<HTMLInputElement>(null);

  // Only the newest listing counts: a slow first read must not overwrite a later one.
  const latest = useRef(0);
  const refresh = () => {
    const ticket = ++latest.current;
    void listSaves().then((list) => {
      if (ticket === latest.current) setSaves(list);
    }, () => {
      toast('Saved games are unavailable in this browser');
    });
  };
  useEffect(refresh, []);

  const close = () => (savesOpen.value = false);
  const run = (task: Promise<void>) => {
    task.then(refresh, (err: unknown) => {
      toast(err instanceof Error ? err.message : String(err));
    });
  };

  return (
    <div class="modal-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
      <section class="saves panel" role="dialog" aria-label="Save and load">
        <header>
          <h2>Save and load</h2>
          <button type="button" class="close" aria-label="Close" onClick={close}>
            ×
          </button>
        </header>
        <form
          class="save-as"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) run(actions.save(name.trim()));
          }}
        >
          <input
            type="text"
            value={name}
            aria-label="Save name"
            maxLength={40}
            onInput={(e) => {
              setName(e.currentTarget.value);
            }}
          />
          <button type="submit" class="primary">
            Save
          </button>
        </form>
        <div class="save-list">
          {saves.length === 0 && <p class="muted">No saved cities yet. Ctrl+S saves at any time.</p>}
          {saves.map((s) => (
            <div class="save-item" key={`${s.auto ? 'a' : 's'}:${s.name}:${String(s.savedAt)}`}>
              {s.thumbnail ? <img src={s.thumbnail} alt="" /> : <div class="no-thumb" />}
              <div class="save-info">
                <strong>{s.name}</strong>
                <span>
                  {s.cityName} · {s.date}
                  {s.population > 0 ? ` · pop. ${formatCount(s.population)}` : ''}
                </span>
                <span class="muted">{when(s.savedAt)}</span>
              </div>
              <button
                type="button"
                class="primary"
                onClick={() => {
                  actions.load(s.name, s.auto);
                }}
              >
                Load
              </button>
              <button type="button" aria-label={`Delete ${s.name}`} onClick={() => { run(actions.remove(s.name, s.auto)); }}>
                Delete
              </button>
            </div>
          ))}
        </div>
        <footer>
          <button type="button" onClick={() => { run(actions.exportCity()); }}>
            Export .timcity file
          </button>
          <button type="button" onClick={() => file.current?.click()}>
            Import file…
          </button>
          <input
            ref={file}
            type="file"
            accept=".timcity"
            hidden
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              if (f) run(actions.importCity(f));
            }}
          />
        </footer>
      </section>
    </div>
  );
}
