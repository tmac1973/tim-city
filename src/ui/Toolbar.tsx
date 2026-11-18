import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { COSTS, POWER_SUPPLY } from '@/shared/costs';
import type { BrushSize } from '@/shared/protocol';
import { Icon } from './icons';
import {
  activeTool,
  brush,
  budgetOpen,
  disastersOpen,
  gameOver,
  graphsOpen,
  pauseOpen,
  reportOpen,
  savesOpen,
  settings,
  settingsOpen,
  type UiTool,
  uiScale,
} from './store';

interface ToolDef {
  id: UiTool;
  name: string;
  key: string;
  code: string;
  /** Shortcut needs Shift held. */
  shift?: boolean;
  cost: string;
  hint: string;
}

const price = (n: number, unit = '') => `$${n.toLocaleString('en-US')}${unit}`;

const GROUPS: { label: string; tools: ToolDef[] }[] = [
  {
    label: 'Zones',
    tools: [
      { id: 'residential', name: 'Residential zone', key: 'Z', code: 'KeyZ', cost: price(COSTS.zone, ' per lot'), hint: 'Homes. Drag to paint 3×3 lots. Needs power and a road within 3 tiles.' },
      { id: 'commercial', name: 'Commercial zone', key: 'X', code: 'KeyX', cost: price(COSTS.zone, ' per lot'), hint: 'Shops and offices. Grows when residents need services.' },
      { id: 'industrial', name: 'Industrial zone', key: 'C', code: 'KeyC', cost: price(COSTS.zone, ' per lot'), hint: 'Factories. Provides jobs and exports.' },
    ],
  },
  {
    label: 'Transport',
    tools: [
      { id: 'road', name: 'Road', key: 'R', code: 'KeyR', cost: price(COSTS.road, '/tile'), hint: 'Drag to build. Slopes are graded for you. Hold Shift to tunnel through a hill.' },
      { id: 'rail', name: 'Rail', key: 'T', code: 'KeyT', cost: price(COSTS.rail, '/tile'), hint: 'Drag to build. Slopes are graded for you. Hold Shift to tunnel through a hill.' },
    ],
  },
  {
    label: 'Power',
    tools: [
      { id: 'power', name: 'Power line', key: 'P', code: 'KeyP', cost: price(COSTS.power, '/tile'), hint: 'Drag to carry power. Zones that touch each other share it.' },
      { id: 'coal', name: 'Coal plant', key: 'G', code: 'KeyG', cost: price(COSTS.coalPlant), hint: `${String(POWER_SUPPLY.coal)} units of power. Cheap but dirty.` },
      { id: 'nuclear', name: 'Nuclear plant', key: 'N', code: 'KeyN', cost: price(COSTS.nuclearPlant), hint: `${String(POWER_SUPPLY.nuclear)} units of power. Clean, with a small risk.` },
    ],
  },
  {
    label: 'Services',
    tools: [
      { id: 'police', name: 'Police station', key: 'O', code: 'KeyO', cost: price(COSTS.policeStation), hint: 'Cuts crime within 20 tiles. Needs power and a road for full strength.' },
      { id: 'fire', name: 'Fire station', key: 'F', code: 'KeyF', cost: price(COSTS.fireStation), hint: 'Protects buildings within 20 tiles from fire.' },
      { id: 'park', name: 'Park', key: 'K', code: 'KeyK', cost: price(COSTS.park, '/tile'), hint: 'Drag a box of small parks. Raises land value and cleans the air.' },
      { id: 'largePark', name: 'Large park', key: '⇧K', code: 'KeyK', shift: true, cost: price(COSTS.largePark), hint: 'A 3×3 park with a pond. A bigger boost to land value.' },
    ],
  },
  {
    label: 'Landmarks',
    tools: [
      { id: 'stadium', name: 'Stadium', key: '', code: '', cost: price(COSTS.stadium), hint: 'Homes stop growing past 50,000 residents without one. 4×4.' },
      { id: 'seaport', name: 'Seaport', key: '', code: '', cost: price(COSTS.seaport), hint: 'Industry stops growing past 7,000 jobs without one. Place along open water. 4×4.' },
      { id: 'airport', name: 'Airport', key: '', code: '', cost: price(COSTS.airport), hint: 'Commerce stops growing past 10,000 jobs without one. Needs flat ground. 6×6.' },
    ],
  },
  {
    label: 'Land',
    tools: [
      { id: 'bulldoze', name: 'Bulldoze', key: 'B', code: 'KeyB', cost: price(COSTS.bulldoze, '/tile'), hint: 'Drag a box to clear trees, rubble and anything built.' },
      { id: 'raise', name: 'Raise land', key: 'U', code: 'KeyU', cost: price(COSTS.terraform, '/step'), hint: 'Click or hold to raise the ground under the brush.' },
      { id: 'lower', name: 'Lower land', key: 'J', code: 'KeyJ', cost: price(COSTS.terraform, '/step'), hint: 'Click or hold to lower the ground. Low ground floods.' },
      { id: 'level', name: 'Level land', key: 'L', code: 'KeyL', cost: price(COSTS.terraform, '/step'), hint: 'Flatten the brush to the height of the tile you click.' },
    ],
  },
  {
    label: 'Info',
    tools: [{ id: 'query', name: 'Query', key: 'Q', code: 'KeyQ', cost: 'Free', hint: 'Click any tile to see what is there.' }],
  },
];

const TERRAFORM = new Set<UiTool>(['raise', 'lower', 'level']);
const BRUSHES: BrushSize[] = [1, 3, 5];

/**
 * Shrinks the toolbar when it would run off the bottom of the window, as it
 * does on short windows or at a large interface size.
 */
function useFitHeight(interfaceScale: number) {
  const ref = useRef<HTMLElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const measure = () => {
      const el = ref.current;
      if (!el) return;
      const box = el.getBoundingClientRect();
      const current = Number(el.style.transform.match(/scale\(([\d.]+)\)/)?.[1] ?? 1);
      const natural = box.height / current;
      const room = window.innerHeight - box.top - 12 * uiScale();
      setScale(Math.min(1, Math.floor((room / natural) * 100) / 100));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
    };
  }, [interfaceScale]);
  return { ref, scale };
}

export function Toolbar() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select')) return;
      if (e.code === 'Escape') {
        // Drop the tool, else close the open window, else pause.
        if (activeTool.value) {
          activeTool.value = null;
          return;
        }
        const open = [settingsOpen, savesOpen, graphsOpen, reportOpen, disastersOpen].find((w) => w.value);
        if (open) {
          open.value = false;
          return;
        }
        if (!budgetOpen.value && !gameOver.value) pauseOpen.value = !pauseOpen.value;
        return;
      }
      if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
        const i = BRUSHES.indexOf(brush.value) + (e.code === 'BracketRight' ? 1 : -1);
        brush.value = BRUSHES[Math.min(BRUSHES.length - 1, Math.max(0, i))] ?? 3;
        return;
      }
      for (const group of GROUPS) {
        const def = group.tools.find((t) => t.code !== '' && t.code === e.code && (t.shift ?? false) === e.shiftKey);
        if (def) activeTool.value = activeTool.value === def.id ? null : def.id;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const fit = useFitHeight(settings.value.uiScale);
  const current = activeTool.value;
  return (
    <nav ref={fit.ref} class="toolbar panel" aria-label="Tools" style={fit.scale < 1 ? { transform: `scale(${String(fit.scale)})` } : undefined}>
      {GROUPS.map((group) => (
        <div class="tool-group" key={group.label}>
          <span class="group-label">{group.label}</span>
          {group.tools.map((t) => (
            <button
              key={t.id}
              type="button"
              class={current === t.id ? 'tool active' : 'tool'}
              aria-pressed={current === t.id}
              aria-label={t.name}
              data-tool={t.id}
              // Keep focus on the canvas so Space still pauses the game.
              onMouseDown={(e) => {
                e.preventDefault();
              }}
              onClick={() => (activeTool.value = current === t.id ? null : t.id)}
            >
              <Icon name={t.id} />
              <span class="tooltip">
                <strong>{t.name}</strong>
                {t.key ? <kbd>{t.key}</kbd> : <span />}
                <span class="tooltip-cost">{t.cost}</span>
                <span class="tooltip-hint">{t.hint}</span>
              </span>
            </button>
          ))}
        </div>
      ))}
      {current && TERRAFORM.has(current) && (
        <div class="brush" role="group" aria-label="Brush size">
          <span class="group-label">Brush [ ]</span>
          <div class="brush-buttons">
            {BRUSHES.map((b) => (
              <button
                key={b}
                type="button"
                class={brush.value === b ? 'active' : ''}
                onMouseDown={(e) => {
                  e.preventDefault();
                }}
                onClick={() => (brush.value = b)}
              >
                {b}
              </button>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}
