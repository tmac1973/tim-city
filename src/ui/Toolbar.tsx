import { useEffect } from 'preact/hooks';
import { COSTS, POWER_SUPPLY } from '@/shared/costs';
import type { BrushSize } from '@/shared/protocol';
import { Icon } from './icons';
import { activeTool, brush, type UiTool } from './store';

interface ToolDef {
  id: UiTool;
  name: string;
  key: string;
  code: string;
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

export function Toolbar() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select')) return;
      if (e.code === 'Escape') {
        activeTool.value = null;
        return;
      }
      if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
        const i = BRUSHES.indexOf(brush.value) + (e.code === 'BracketRight' ? 1 : -1);
        brush.value = BRUSHES[Math.min(BRUSHES.length - 1, Math.max(0, i))] ?? 3;
        return;
      }
      for (const group of GROUPS) {
        const def = group.tools.find((t) => t.code === e.code);
        if (def) activeTool.value = activeTool.value === def.id ? null : def.id;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const current = activeTool.value;
  return (
    <nav class="toolbar panel" aria-label="Tools">
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
                <kbd>{t.key}</kbd>
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
