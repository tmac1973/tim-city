import { useEffect, useRef, useState } from 'preact/hooks';
import type { MapSize } from '@/shared/constants';
import { DIFFICULTY, type DifficultyName } from '@/shared/difficulty';
import { DEFAULT_TERRAIN, type TerrainOptions } from '@/shared/protocol';
import { PreviewScene } from '@/render/previewScene';
import { formatMoney, newCityOpen } from '../store';

export interface NewCityOptions {
  name: string;
  seed: string;
  size: MapSize;
  difficulty: DifficultyName;
  terrain: TerrainOptions;
}

interface NewCityProps {
  preview: (seed: string, size: MapSize, terrain: TerrainOptions) => Promise<{ size: MapSize; heights: Uint8Array; tiles: Uint16Array }>;
  onStart: (options: NewCityOptions) => void;
}

const WORDS = ['maple', 'harbor', 'cedar', 'summit', 'meadow', 'river', 'granite', 'willow', 'lantern', 'orchard', 'falcon', 'bramble', 'copper', 'tide', 'aspen', 'thistle'];
const randomSeed = () => `${WORDS[Math.floor(Math.random() * WORDS.length)] ?? 'tim'}-${String(Math.floor(Math.random() * 1000))}`;

/** Name, difficulty, size, terrain and seed, with a live turntable preview of the map. */
export function NewCityScreen({ preview, onStart }: NewCityProps) {
  const [name, setName] = useState('New City');
  const [seed, setSeed] = useState(randomSeed);
  const [size, setSize] = useState<MapSize>(128);
  const [difficulty, setDifficulty] = useState<DifficultyName>('medium');
  const [terrain, setTerrain] = useState<TerrainOptions>(DEFAULT_TERRAIN);
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<PreviewScene | null>(null);

  useEffect(() => {
    if (!canvas.current) return;
    scene.current = new PreviewScene(canvas.current);
    return () => {
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);

  // Regenerate the preview a moment after the last change.
  useEffect(() => {
    const timer = setTimeout(() => {
      void preview(seed || 'tim', size, terrain).then((map) => {
        scene.current?.show(map.size, map.heights, map.tiles);
      });
    }, 150);
    return () => {
      clearTimeout(timer);
    };
  }, [seed, size, terrain, preview]);

  const close = () => (newCityOpen.value = false);
  const slider = (key: keyof TerrainOptions, label: string) => (
    <label class="slider">
      <span>
        {label} <b>{terrain[key]}</b>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={terrain[key]}
        aria-label={label}
        onInput={(e) => {
          setTerrain({ ...terrain, [key]: Number(e.currentTarget.value) });
        }}
      />
    </label>
  );

  return (
    <div class="modal-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
      <section class="new-city panel" role="dialog" aria-label="New city">
        <header>
          <h2>New city</h2>
          <button type="button" class="close" aria-label="Close" onClick={close}>
            ×
          </button>
        </header>
        <div class="new-city-body">
          <div class="new-city-form">
            <label class="field">
              <span>Name</span>
              <input type="text" value={name} maxLength={32} aria-label="City name" onInput={(e) => { setName(e.currentTarget.value); }} />
            </label>
            <fieldset class="choice">
              <legend>Difficulty</legend>
              {(['easy', 'medium', 'hard'] as const).map((d) => (
                <button key={d} type="button" aria-pressed={difficulty === d} onClick={() => { setDifficulty(d); }}>
                  {d[0]?.toUpperCase()}
                  {d.slice(1)}
                  <span class="title-sub">{formatMoney(DIFFICULTY[d].funds)}</span>
                </button>
              ))}
            </fieldset>
            <fieldset class="choice">
              <legend>Map size</legend>
              {([128, 256] as const).map((s) => (
                <button key={s} type="button" aria-pressed={size === s} onClick={() => { setSize(s); }}>
                  {s} × {s}
                </button>
              ))}
            </fieldset>
            {slider('water', 'Water')}
            {slider('forest', 'Forest')}
            {slider('hills', 'Hills')}
            <label class="field">
              <span>Seed</span>
              <span class="seed-row">
                <input type="text" value={seed} maxLength={40} aria-label="Seed" onInput={(e) => { setSeed(e.currentTarget.value); }} />
                <button type="button" aria-label="Random seed" title="Random seed" onClick={() => { setSeed(randomSeed()); }}>
                  ⚄
                </button>
              </span>
            </label>
          </div>
          <canvas ref={canvas} class="new-city-preview" aria-label="Map preview" />
        </div>
        <footer>
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            class="primary"
            onClick={() => {
              onStart({ name: name.trim() || 'New City', seed: seed.trim() || 'tim', size, difficulty, terrain });
            }}
          >
            Start
          </button>
        </footer>
      </section>
    </div>
  );
}
