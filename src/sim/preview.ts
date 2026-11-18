import type { CityInfo, TerrainOptions } from '@/shared/protocol';
import { Simulation } from './sim';
import { generateTerrain } from './terrain/generate';

/**
 * The terrain a new city would start with: the same generator, seed and
 * sliders the worker's `init` uses, so the preview is the map you get.
 */
export function previewTerrain(info: CityInfo, terrain: TerrainOptions): { heights: Uint8Array; tiles: Uint16Array } {
  const sim = new Simulation(info);
  generateTerrain(sim.state, terrain);
  return { heights: sim.state.heights.slice(), tiles: sim.state.tiles.slice() };
}
