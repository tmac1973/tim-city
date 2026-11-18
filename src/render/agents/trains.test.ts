import { MeshBasicMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { isRail, TileKind } from '@/shared/tiles';
import { CityMirror } from '../mirror';
import { TrainLayer, trainsFor } from './trains';
import { VisualRng } from './visualRng';

describe('trains', () => {
  it('run one per 30 tiles of each network, up to the cap', () => {
    expect(trainsFor([29, 30, 95])).toEqual([0, 1, 3]);
    expect(trainsFor([300, 300], 12).reduce((a, b) => a + b, 0)).toBe(12);
  });

  it('stay on the rails, turning around at the end of a line', () => {
    const m = new CityMirror(128);
    for (let x = 10; x < 50; x++) m.tiles[20 * 128 + x] = TileKind.Rail;
    const layer = new TrainLayer(m, new VisualRng(7), () => 0, new MeshBasicMaterial());
    let reversals = 0;
    let lastX = 0;
    let dir = 0;
    for (let i = 0; i < 2000; i++) {
      layer.update(0.05);
      expect(layer.trains).toHaveLength(1);
      for (const car of layer.trains[0]?.cars ?? []) {
        expect(isRail(m.tile(Math.floor(car.pos.x), Math.floor(car.pos.z)))).toBe(true);
      }
      const x = layer.trains[0]?.cars[0]?.pos.x ?? 0;
      const now = Math.sign(x - lastX);
      if (now !== 0 && dir !== 0 && now !== dir) reversals++;
      if (now !== 0) dir = now;
      lastX = x;
    }
    expect(reversals).toBeGreaterThanOrEqual(2);
  });
});
