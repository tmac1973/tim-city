import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { COSTS, POWER_SUPPLY } from '@/shared/costs';
import type { BrushSize, ToolId } from '@/shared/protocol';
import { isUnlocked, lockedMessage, unlockLabel } from '@/shared/unlocks';
import { TIER_CAP, TIER_NAMES, ZoneTier } from '@/shared/tiles';
import { Icon } from './icons';
import {
  activeTool,
  brush,
  budgetOpen,
  classReached,
  disastersOpen,
  gameOver,
  graphsOpen,
  lastToolByCategory,
  openCategory,
  pauseOpen,
  reportOpen,
  savesOpen,
  effectiveUiScale,
  settingsOpen,
  toast,
  zoneTier,
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
      { id: 'wind', name: 'Wind turbine', key: 'E', code: 'KeyE', cost: price(COSTS.windTurbine), hint: `${String(POWER_SUPPLY.wind)} units, ${String(POWER_SUPPLY.wind * 1.5)} on high ground. Clean and small.` },
      { id: 'solar', name: 'Solar farm', key: '', code: '', cost: price(COSTS.solarFarm), hint: `${String(POWER_SUPPLY.solar)} units, less in cloudy months. Clean.` },
      { id: 'gas', name: 'Gas plant', key: '', code: '', cost: price(COSTS.gasPlant), hint: `${String(POWER_SUPPLY.gas)} units. Half the smoke of coal.` },
      { id: 'oil', name: 'Oil plant', key: '', code: '', cost: price(COSTS.oilPlant), hint: `${POWER_SUPPLY.oil.toLocaleString('en-US')} units. Smoky, and it catches fire easily.` },
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

/**
 * Pick a tool (or put it down if it is already active). A locked tool only
 * explains when it unlocks. Returns whether the tool was picked or dropped.
 */
function choose(category: string, def: ToolDef, fromKey = false): boolean {
  if (def.id !== 'query' && !isUnlocked(def.id, classReached.value)) {
    toast(lockedMessage(def.id));
    return false;
  }
  // Pressing an active zone tool's key again cycles its density instead.
  if (fromKey && ZONE_TOOLS.has(def.id) && activeTool.value === def.id) {
    cycleTier();
    return true;
  }
  lastToolByCategory.value = { ...lastToolByCategory.value, [category]: def.id };
  activeTool.value = activeTool.value === def.id ? null : def.id;
  return true;
}

const ZONE_TOOLS = new Set<UiTool>(['residential', 'commercial', 'industrial']);
const TIERS = [ZoneTier.Low, ZoneTier.Medium, ZoneTier.High];
const tierLocked = (tier: number) => tier === ZoneTier.High && !isUnlocked('zoneHigh', classReached.value);

/** Next density tier, skipping locked ones. */
function cycleTier(): void {
  for (let step = 1; step <= TIERS.length; step++) {
    const next = (zoneTier.value + step) % TIERS.length;
    if (!tierLocked(next)) {
      zoneTier.value = next;
      return;
    }
  }
}

/** Low / Medium / High chips at the top of the Zones flyout. */
function TierPicker() {
  return (
    <div class="tier-picker" role="group" aria-label="Density">
      {TIERS.map((tier) => {
        const locked = tierLocked(tier);
        return (
          <button
            key={tier}
            type="button"
            class={`tier-chip${zoneTier.value === tier ? ' active' : ''}${locked ? ' locked' : ''}`}
            aria-pressed={zoneTier.value === tier}
            aria-disabled={locked}
            title={locked ? lockedMessage('zoneHigh') : `${TIER_NAMES[tier]} density: up to level ${String(TIER_CAP[tier])}`}
            onMouseDown={(e) => {
              e.preventDefault();
            }}
            onClick={() => {
              if (locked) toast(lockedMessage('zoneHigh'));
              else zoneTier.value = tier;
            }}
          >
            <TierBars tier={tier} />
            {TIER_NAMES[tier]}
          </button>
        );
      })}
    </div>
  );
}

/** One to three bars showing a density tier. */
function TierBars({ tier }: { tier: number }) {
  return (
    <span class="tier-bars" aria-hidden="true">
      {TIERS.map((t) => (
        <span key={t} class={t <= tier ? 'on' : ''} />
      ))}
    </span>
  );
}

export function Toolbar() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select')) return;
      if (e.code === 'Escape') {
        // Close the flyout, else drop the tool, else close the open window, else pause.
        if (openCategory.value) {
          openCategory.value = null;
          return;
        }
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
        if (def) choose(group.label, def, true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // A click anywhere outside the toolbar closes an open flyout.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (openCategory.value && !(e.target as HTMLElement | null)?.closest('.toolbar')) openCategory.value = null;
    };
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('pointerdown', onDown);
    };
  }, []);

  const fit = useFitHeight(effectiveUiScale.value);
  const current = activeTool.value;
  const open = openCategory.value;
  return (
    <nav ref={fit.ref} class="toolbar panel" aria-label="Tools" style={fit.scale < 1 ? { transform: `scale(${String(fit.scale)})` } : undefined}>
      {GROUPS.map((group) => {
        const single = group.tools.length === 1 ? group.tools[0] : undefined;
        const inGroup = group.tools.find((t) => t.id === current);
        const shown = inGroup ?? group.tools.find((t) => t.id === lastToolByCategory.value[group.label]) ?? group.tools[0];
        if (!shown) return null;
        const isOpen = open === group.label;
        return (
          <div class="tool-category" key={group.label}>
            <button
              type="button"
              class={inGroup ? 'tool active' : 'tool'}
              aria-label={single ? single.name : group.label}
              aria-expanded={single ? undefined : isOpen}
              aria-pressed={single ? current === single.id : undefined}
              data-category={group.label}
              data-active={inGroup ? 'true' : 'false'}
              data-tools={group.tools.map((t) => t.id).join(' ')}
              {...(single ? { 'data-tool': single.id } : {})}
              title={single ? undefined : group.label}
              // Keep focus on the canvas so Space still pauses the game.
              onMouseDown={(e) => {
                e.preventDefault();
              }}
              onClick={() => {
                if (single) {
                  openCategory.value = null;
                  choose(group.label, single);
                } else openCategory.value = isOpen ? null : group.label;
              }}
            >
              <Icon name={shown.id} />
              {group.label === 'Zones' && <TierBars tier={zoneTier.value} />}
              <span class="tool-caption">{group.label}</span>
            </button>
            {isOpen && (
              <div class="flyout panel" role="menu" aria-label={group.label}>
                <span class="group-label">{group.label}</span>
                {group.label === 'Zones' && <TierPicker />}
                {group.tools.map((t) => {
                  const locked = !isUnlocked(t.id as ToolId, classReached.value);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="menuitem"
                      class={`flyout-tool${current === t.id ? ' active' : ''}${locked ? ' locked' : ''}`}
                      aria-pressed={current === t.id}
                      aria-disabled={locked}
                      aria-label={t.name}
                      data-tool={t.id}
                      onMouseDown={(e) => {
                        e.preventDefault();
                      }}
                      onClick={() => {
                        if (choose(group.label, t)) openCategory.value = null;
                      }}
                    >
                      <span class="flyout-icon">
                        <Icon name={locked ? 'lock' : t.id} />
                      </span>
                      <strong>{t.name}</strong>
                      {t.key ? <kbd>{t.key}</kbd> : <span />}
                      <span class="tooltip-cost">{locked ? unlockLabel(t.id as ToolId) : t.cost}</span>
                      <span class="tooltip-hint">{t.hint}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
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
