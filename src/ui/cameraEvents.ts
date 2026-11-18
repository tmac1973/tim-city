import type { DisasterType } from '@/shared/protocol';
import { toast, watchNext } from './store';

const NAMES: Record<DisasterType, string> = {
  fire: 'Fire',
  flood: 'Flood',
  tornado: 'Tornado',
  earthquake: 'Earthquake',
  planeCrash: 'Plane crash',
  shipwreck: 'Shipwreck',
  meltdown: 'Meltdown',
  mirebeast: 'The Mirebeast',
};

/**
 * When a disaster starts: fly straight to one the player triggered from the
 * menu; for a random one, offer a "Watch" button instead of yanking the camera.
 */
export function onDisasterStarted(type: DisasterType, flyTo: () => void): void {
  if (watchNext.value) {
    watchNext.value = false;
    flyTo();
    return;
  }
  toast(`${NAMES[type]}!`, 'error', 9000, { label: 'Watch', run: flyTo });
}
