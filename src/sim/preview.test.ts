import { describe, expect, it } from 'vitest';
import { previewTerrain } from './preview';
import { Simulation } from './sim';
import { generateTerrain } from './terrain/generate';

describe('new-city preview', () => {
  it('matches the map the game then starts with', () => {
    const info = { name: 'P', seed: 'preview-seed', size: 128 } as const;
    const terrain = { water: 35, forest: 60, hills: 70 };
    const preview = previewTerrain(info, terrain);
    // The worker's init path.
    const sim = new Simulation(info);
    generateTerrain(sim.state, terrain);
    expect(preview.heights).toEqual(sim.state.heights);
    expect(preview.tiles).toEqual(sim.state.tiles);
  });
});
