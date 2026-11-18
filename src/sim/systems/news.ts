import type { SimEvent } from '@/shared/protocol';
import type { CityState } from '../state';

type News = Extract<SimEvent, { type: 'news' }>;

const money = (n: number) => `$${Math.abs(n).toLocaleString('en-US')}`;
const ZONE_WORDS = { r: 'Homebuilders', c: 'Shopkeepers', i: 'Factory owners' } as const;

/** Approval must move at least this many points in a year to make the news. */
const SWING = 10;

/** The headline a sim event deserves, if any. */
export function headlineFor(event: SimEvent, state: CityState): News | null {
  const news = (headline: string, x: number | null = null, y: number | null = null): News => ({ type: 'news', headline, x, y });
  switch (event.type) {
    case 'milestone':
      return news(`${state.name} is now a ${event.cityClass}! Population passes ${event.population.toLocaleString('en-US')}`);
    case 'demandCap':
      return news(`${ZONE_WORDS[event.zone]} stop building until the city opens a ${event.needs}`);
    case 'brownout':
      return news(`Brownout! ${String(event.unpowered)} neighbourhoods lose power as plants hit capacity`);
    case 'yearBudget':
      return news(
        event.net >= 0
          ? `${String(event.year)} books close with a ${money(event.net)} surplus`
          : `${String(event.year)} books close ${money(event.net)} in the red`,
      );
    case 'bankrupt':
      return news(`${state.name} declares bankruptcy; construction halts`);
    case 'evaluation':
      if (event.approvalChange >= SWING) return news(`Mayor's approval jumps to ${String(event.approval)}%`);
      if (event.approvalChange <= -SWING) return news(`Mayor's approval slides to ${String(event.approval)}%`);
      return null;
    default:
      return null;
  }
}
