import { useEffect, useState } from 'preact/hooks';
import { listSaves } from '@/save/saveManager';
import { newCityOpen, savesOpen, settingsOpen } from '../store';

interface TitleProps {
  /** Load a saved city by slot name. */
  onContinue: (slot: string, auto: boolean) => void;
}

/** The front door: the sample city turns slowly behind the menu. */
export function TitleScreen({ onContinue }: TitleProps) {
  const [latest, setLatest] = useState<{ name: string; auto: boolean; label: string } | null>(null);
  useEffect(() => {
    listSaves().then(
      (saves) => {
        const newest = [...saves].sort((a, b) => b.savedAt - a.savedAt)[0];
        if (newest) setLatest({ name: newest.name, auto: newest.auto, label: `${newest.cityName} · ${newest.date}` });
      },
      () => undefined,
    );
  }, []);

  return (
    <div class="title-screen">
      <div class="title-card panel">
        <h1 class="title-logo">Tim City</h1>
        <p class="title-tag">Build a city. Keep it running. Watch it live.</p>
        <nav class="title-menu" aria-label="Main menu">
          <button type="button" class="primary" onClick={() => (newCityOpen.value = true)}>
            New City
          </button>
          <button
            type="button"
            disabled={!latest}
            title={latest ? `Continue ${latest.label}` : 'No saved city yet'}
            onClick={() => {
              if (latest) onContinue(latest.name, latest.auto);
            }}
          >
            Continue{latest ? <span class="title-sub">{latest.label}</span> : null}
          </button>
          <button type="button" onClick={() => (savesOpen.value = true)}>
            Load
          </button>
          <button type="button" onClick={() => (settingsOpen.value = true)}>
            Settings
          </button>
        </nav>
      </div>
    </div>
  );
}
