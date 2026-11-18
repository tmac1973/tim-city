import { describe, expect, it } from 'vitest';
import { pickTile, type Vec3 } from './picking';
import { HEIGHT_UNIT } from './units';

const SIZE = 64;

/** Height-step grid of (SIZE+1)² corners with an optional raised block. */
function field(base: number, raise?: { x0: number; x1: number; height: number }) {
  return (x: number): number => (raise && x >= raise.x0 && x <= raise.x1 ? raise.height : base);
}

function towards(origin: Vec3, target: Vec3): Vec3 {
  const d = { x: target.x - origin.x, y: target.y - origin.y, z: target.z - origin.z };
  const len = Math.hypot(d.x, d.y, d.z);
  return { x: d.x / len, y: d.y / len, z: d.z / len };
}

describe('pickTile', () => {
  it('hits the tile straight below a vertical ray', () => {
    const hit = pickTile(field(3), SIZE, { x: 10.5, y: 100, z: 20.25 }, { x: 0, y: -1, z: 0 });
    expect(hit && [hit.x, hit.y]).toEqual([10, 20]);
    expect(hit?.point.y).toBeCloseTo(3 * HEIGHT_UNIT);
  });

  it('hits the expected tile from an angled ray on flat ground', () => {
    const origin = { x: -10, y: 50, z: -5 };
    const target = { x: 40.2, y: 3 * HEIGHT_UNIT, z: 30.3 };
    const hit = pickTile(field(3), SIZE, origin, towards(origin, target));
    expect(hit && [hit.x, hit.y]).toEqual([40, 30]);
    expect(hit && [hit.cornerX, hit.cornerY]).toEqual([40, 30]);
  });

  it('stops at the near face of a hill in the way', () => {
    // Corners x = 20…25 are raised to step 15 (y 7.5); x = 19 ramps up to it.
    const origin = { x: 0.5, y: 5, z: 30.5 };
    const hit = pickTile(field(3, { x0: 20, x1: 25, height: 15 }), SIZE, origin, { x: 1, y: 0, z: 0 });
    expect(hit && [hit.x, hit.y]).toEqual([19, 30]);
    // Ramp rises from 1.5 to 7.5 over the tile, so y = 5 is 3.5/6 of the way.
    expect(hit?.point.x).toBeCloseTo(19 + 3.5 / 6, 5);
  });

  it('returns null for rays that miss the map', () => {
    expect(pickTile(field(3), SIZE, { x: -10, y: 50, z: 10 }, { x: -1, y: 0, z: 0 })).toBeNull();
    expect(pickTile(field(3), SIZE, { x: 10, y: 50, z: 10 }, { x: 0, y: 1, z: 0 })).toBeNull();
  });

  it('agrees with the mesh diagonal on a saddle-free sloped tile', () => {
    // One raised corner (NE of tile 5,5): the mesh splits NE–SW, leaving the
    // NW–SW–NE triangle flat at step 3 and the other rising to the corner.
    const corner = (x: number, y: number) => (x === 6 && y === 5 ? 7 : 3);
    const hit = pickTile(corner, SIZE, { x: 5.2, y: 50, z: 5.2 }, { x: 0, y: -1, z: 0 });
    expect(hit && [hit.x, hit.y]).toEqual([5, 5]);
    expect(hit?.point.y).toBeCloseTo(3 * HEIGHT_UNIT);
  });
});
