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
  /** The Zones flyout is open. */
  zonesOpen?: boolean;
  /** Zone lots held back for want of water (once the rules apply). */
  dry?: number;
  /** Highest traffic on any road block. */
  jam?: number;
  /** Highest city class reached (2 = City). */
  cityClass?: number;
  /** Museums, zoos and amusement parks built. */
  leisure?: number;
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
    text: 'Every city starts with power. Open Power, pick the coal plant, then click flat open ground to build it.',
    anchor: '[data-tools~="coal"]',
    when: (f) => f.plants === 0,
  },
  {
    id: 'road',
    text: 'Now a road: open Transport, pick Road and drag out from near the plant into open land.',
    anchor: '[data-tools~="road"]',
    when: (f) => f.plants > 0 && f.roads === 0,
  },
  {
    id: 'zones',
    text: 'Open Zones and zone homes beside the road (and some industry for jobs). Drag to paint 3×3 lots; they need a road within 3 tiles.',
    anchor: '[data-tools~="residential"]',
    when: (f) => f.roads > 0 && f.zones === 0,
  },
  {
    id: 'lines',
    text: 'Some zones have no power. Open Power and run a power line from the plant until it touches them; zones that touch pass power along.',
    anchor: '[data-tools~="power"]',
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
    id: 'density',
    text: 'Pick low, medium or high density here. Press the zone key again to cycle. Paint over a zone to change its density in place.',
    anchor: '.tier-picker',
    when: (f) => f.zonesOpen === true,
  },
  {
    id: 'water',
    text: 'Some lots need water to grow past level 4. Build a water tower nearby (Utilities).',
    anchor: '[data-category="Utilities"]',
    when: (f) => (f.dry ?? 0) > 0 && f.pop > 0,
  },
  {
    id: 'buses',
    text: 'Traffic is building up. Bus stops along busy roads take cars off them (Transit).',
    anchor: '[data-category="Transit"]',
    when: (f) => (f.jam ?? 0) >= 200,
  },
  {
    id: 'subway',
    text: 'Subways unlocked! Press V to see underground, then drag track between two stations.',
    anchor: '[data-category="Transit"]',
    when: (f) => (f.cityClass ?? 0) >= 2,
  },
  {
    id: 'tourism',
    text: 'Landmarks earn tourism when a road reaches them from the edge of the map.',
    anchor: '[data-category="Landmarks"]',
    when: (f) => (f.leisure ?? 0) > 0,
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
