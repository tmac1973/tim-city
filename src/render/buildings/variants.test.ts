import { describe, expect, it } from 'vitest';
import { MAX_DENSITY, ZoneType } from '@/shared/tiles';
import { coalPlant, nuclearPlant } from './plants';
import { buildVariants, LAND_VALUE_CLASSES, VARIANTS_PER_CELL, variantKey } from './variants';

const variants = buildVariants();

describe('building variants', () => {
  it('has exactly 2 variants for every zone type, density and land-value class', () => {
    expect(variants.size).toBe(3 * MAX_DENSITY * LAND_VALUE_CLASSES * VARIANTS_PER_CELL);
    for (const type of [ZoneType.R, ZoneType.C, ZoneType.I]) {
      for (let d = 1; d <= MAX_DENSITY; d++) {
        for (let lv = 0; lv < LAND_VALUE_CLASSES; lv++) {
          for (let v = 0; v < VARIANTS_PER_CELL; v++) expect(variants.has(variantKey(type, d, lv, v))).toBe(true);
        }
      }
    }
  });

  it('is deterministic', () => {
    const again = buildVariants();
    for (const [key, v] of variants) {
      const a = v.geometry.getAttribute('position').array;
      const b = again.get(key)?.geometry.getAttribute('position').array;
      expect(b && Array.from(b)).toEqual(Array.from(a));
    }
  });

  it('keeps every building inside its 3×3 lot and above ground', () => {
    for (const v of variants.values()) {
      const box = v.geometry.boundingBox;
      expect(box).not.toBeNull();
      if (!box) continue;
      expect(box.min.x).toBeGreaterThanOrEqual(-1.5);
      expect(box.max.x).toBeLessThanOrEqual(1.5);
      expect(box.min.z).toBeGreaterThanOrEqual(-1.5);
      expect(box.max.z).toBeLessThanOrEqual(1.5);
      expect(box.min.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps plants inside their 4×4 lot', () => {
    for (const plant of [coalPlant(), nuclearPlant()]) {
      const box = plant.geometry.boundingBox;
      expect(box && Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z)).toBeLessThanOrEqual(2);
      expect(plant.emitters.length).toBeGreaterThan(0);
    }
  });

  it('stays under the vertex budget', () => {
    let total = 0;
    for (const v of variants.values()) total += v.geometry.getAttribute('position').count;
    expect(total).toBeLessThan(400_000);
  });

  it('gets taller with density', () => {
    const height = (type: ZoneType, d: number) => variants.get(variantKey(type, d, 0, 0))?.height ?? 0;
    for (const type of [ZoneType.R, ZoneType.C, ZoneType.I]) expect(height(type, 8)).toBeGreaterThan(height(type, 1));
  });
});
