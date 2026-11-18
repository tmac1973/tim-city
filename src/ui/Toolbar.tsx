import { useEffect } from 'preact/hooks';
import { COSTS } from '@/shared/costs';
import type { BrushSize, ToolId } from '@/shared/protocol';
import { Icon } from './icons';
import { activeTool, brush } from './store';

interface ToolDef {
  id: ToolId;
  name: string;
  key: string;
  code: string;
  cost: string;
  hint: string;
}

const GROUPS: { label: string; tools: ToolDef[] }[] = [
  {
    label: 'Transport',
    tools: [
      { id: 'road', name: 'Road', key: 'R', code: 'KeyR', cost: `$${String(COSTS.road)}/tile`, hint: 'Drag to build. Hold Shift to tunnel through a hill.' },
      { id: 'rail', name: 'Rail', key: 'T', code: 'KeyT', cost: `$${String(COSTS.rail)}/tile`, hint: 'Drag to build. Hold Shift to tunnel through a hill.' },
    ],
  },
  {
    label: 'Utilities',
    tools: [
      { id: 'power', name: 'Power line', key: 'P', code: 'KeyP', cost: `$${String(COSTS.power)}/tile`, hint: 'Drag to carry power. Crosses roads and rail at right angles.' },
    ],
  },
  {
    label: 'Land',
    tools: [
      { id: 'bulldoze', name: 'Bulldoze', key: 'B', code: 'KeyB', cost: `$${String(COSTS.bulldoze)}/tile`, hint: 'Drag a box to clear trees, rubble and anything built.' },
      { id: 'raise', name: 'Raise land', key: 'U', code: 'KeyU', cost: `$${String(COSTS.terraform)}/step`, hint: 'Click or hold to raise the ground under the brush.' },
      { id: 'lower', name: 'Lower land', key: 'J', code: 'KeyJ', cost: `$${String(COSTS.terraform)}/step`, hint: 'Click or hold to lower the ground. Low ground floods.' },
      { id: 'level', name: 'Level land', key: 'L', code: 'KeyL', cost: `$${String(COSTS.terraform)}/step`, hint: 'Flatten the brush to the height of the tile you click.' },
    ],
  },
];

const TERRAFORM = new Set<ToolId>(['raise', 'lower', 'level']);
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
