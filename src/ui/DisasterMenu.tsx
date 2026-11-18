import type { DisasterType, SimCommand } from '@/shared/protocol';
import { budget, census, disastersOpen, watchNext } from './store';

const ENTRIES: { type: DisasterType; name: string; blurb: string }[] = [
  { type: 'fire', name: 'Fire', blurb: 'Spreads between buildings; fire stations slow it and put it out.' },
  { type: 'flood', name: 'Flood', blurb: 'Low ground by the water floods for two months, then recedes.' },
  { type: 'tornado', name: 'Tornado', blurb: 'Wanders across the map, flattening a three-tile path.' },
  { type: 'earthquake', name: 'Earthquake', blurb: 'Topples buildings, starts fires and cracks roads nearby.' },
  { type: 'planeCrash', name: 'Plane crash', blurb: 'A plane comes down near the airport.' },
  { type: 'shipwreck', name: 'Shipwreck', blurb: 'A ship strikes a bridge or the shore near the seaport and spills oil.' },
  { type: 'meltdown', name: 'Meltdown', blurb: 'A nuclear plant contaminates everything within 8 tiles for 50 years.' },
  { type: 'mirebeast', name: 'Mirebeast', blurb: 'A great moss-backed beast rises from the water and heads for the worst pollution.' },
];

/** Why a disaster can't be triggered now, from what the census knows, or null. */
function blocked(type: DisasterType): string | null {
  const c = census.value;
  if (!c) return 'The city is still loading';
  switch (type) {
    case 'flood':
    case 'mirebeast':
      return c.water > 0 ? null : 'Needs water on the map';
    case 'planeCrash':
      return c.landmarks.airport > 0 ? null : 'Needs an airport';
    case 'shipwreck':
      return c.landmarks.seaport > 0 ? null : 'Needs a seaport';
    case 'meltdown':
      return c.plants.nuclear > 0 ? null : 'Needs a nuclear plant';
    case 'fire':
      return c.zones.r + c.zones.c + c.zones.i + Object.values(c.plants).reduce((a, b) => a + b, 0) > 0 ? null : 'Nothing built to burn';
    default:
      return null;
  }
}

/** Trigger any disaster by hand, and switch random disasters on or off. */
export function DisasterMenu({ send }: { send: (command: SimCommand) => void }) {
  if (!disastersOpen.value) return null;
  const close = () => (disastersOpen.value = false);
  const random = budget.value?.randomDisasters ?? true;
  return (
    <div class="modal-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
      <section class="disasters panel" role="dialog" aria-label="Disasters">
        <header>
          <h2>Disasters</h2>
          <button type="button" class="close" aria-label="Close" onClick={close}>
            ×
          </button>
        </header>
        <label class="check">
          <input
            type="checkbox"
            checked={random}
            onChange={(e) => {
              send({ type: 'setRandomDisasters', enabled: e.currentTarget.checked });
            }}
          />
          Random disasters (more often on harder difficulties)
        </label>
        <div class="disaster-list">
          {ENTRIES.map((d) => {
            const reason = blocked(d.type);
            return (
              <div class="disaster" key={d.type}>
                <div>
                  <strong>{d.name}</strong>
                  <p>{reason ?? d.blurb}</p>
                </div>
                <button
                  type="button"
                  class="danger"
                  disabled={reason !== null}
                  onClick={() => {
                    watchNext.value = true;
                    send({ type: 'triggerDisaster', disaster: d.type });
                    close();
                  }}
                >
                  Trigger
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
