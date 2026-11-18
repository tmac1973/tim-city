/** What the tips look at, gathered from the store. */
export interface TipFacts {
  roads: number;
  lines: number;
  zones: number;
  plants: number;
  unpowered: number;
  pop: number;
  budgetOpen: boolean;
  problems: number;
  disasters: number;
}

export interface Tip {
  id: string;
  text: string;
  /** CSS selector of what the bubble points at; null: bottom centre of the screen. */
  anchor: string | null;
  when: (f: TipFacts) => boolean;
}

/**
 * The tips in teaching order. Each shows once, the first time its
 * condition holds, until the player dismisses it.
 */
export const TIPS: Tip[] = [
  {
    id: 'camera',
    text: 'Welcome to Tim City! Pan with W A S D or the arrow keys, right-drag to rotate, middle-drag to tilt, and scroll to zoom.',
    anchor: null,
    when: () => true,
  },
  {
    id: 'power',
    text: 'Every city starts with power. Pick the coal plant, then click flat open ground to build it.',
    anchor: '[data-tool="coal"]',
    when: (f) => f.plants === 0,
  },
  {
    id: 'road',
    text: 'Now a road: pick Road and drag out from near the plant into open land.',
    anchor: '[data-tool="road"]',
    when: (f) => f.plants > 0 && f.roads === 0,
  },
  {
    id: 'zones',
    text: 'Zone homes beside the road (and some industry for jobs). Drag to paint 3×3 lots; they need a road within 3 tiles.',
    anchor: '[data-tool="residential"]',
    when: (f) => f.roads > 0 && f.zones === 0,
  },
  {
    id: 'lines',
    text: 'Some zones have no power. Run a power line from the plant until it touches them; zones that touch pass power along.',
    anchor: '[data-tool="power"]',
    when: (f) => f.plants > 0 && f.zones > 0 && f.unpowered > 0,
  },
  {
    id: 'speed',
    text: 'Ready? Press Play (or 2) and watch the first homes go up. Fast speed is 3.',
    anchor: '[aria-label="Normal"]',
    when: (f) => f.plants > 0 && f.zones > 0 && f.unpowered === 0 && f.pop === 0,
  },
  {
    id: 'growth',
    text: 'People are moving in! These bars show what the city wants next: homes (R), shops (C) or industry (I).',
    anchor: '.rci',
    when: (f) => f.pop > 0,
  },
  {
    id: 'budget',
    text: 'Taxes pay for roads, police and fire. Aim for a small surplus each year; higher taxes slow growth.',
    anchor: '.budget',
    when: (f) => f.budgetOpen,
  },
  {
    id: 'problems',
    text: 'Residents have a complaint. City shows what they care about; the overlays here show where it is worst.',
    anchor: '.overlays',
    when: (f) => f.problems > 0 && f.pop > 500,
  },
  {
    id: 'disaster',
    text: 'Disaster! Fire stations put out fires near them. You can turn random disasters off in the Disasters menu.',
    anchor: '[data-menu="disasters"]',
    when: (f) => f.disasters > 0,
  },
];

/** The tip to show now: the first unseen one whose condition holds. */
export function currentTip(facts: TipFacts, seen: readonly string[]): Tip | null {
  return TIPS.find((t) => !seen.includes(t.id) && t.when(facts)) ?? null;
}
