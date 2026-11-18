import { describe, expect, it } from 'vitest';
import { PARTICLE_CAPACITY, ParticleRing, ParticleSystem } from './particles';
import { Shake } from './quake';

describe('particle ring', () => {
  it('never holds more than its capacity', () => {
    const ring = new ParticleRing(PARTICLE_CAPACITY);
    for (let i = 0; i < PARTICLE_CAPACITY * 3 + 17; i++) {
      const slot = ring.alloc();
      expect(slot).toBeLessThan(PARTICLE_CAPACITY);
    }
    expect(ring.used).toBe(PARTICLE_CAPACITY);
  });

  it('reports the slots written since the last flush', () => {
    const ring = new ParticleRing(10);
    for (let i = 0; i < 8; i++) ring.alloc();
    expect(ring.takeDirty()).toEqual([0, 8]);
    for (let i = 0; i < 5; i++) ring.alloc();
    expect(ring.takeDirty()).toEqual([8, 5]);
    expect(ring.takeDirty()).toBeNull();
  });

  it('emits through a full system without error', () => {
    const system = new ParticleSystem(true);
    for (let i = 0; i < PARTICLE_CAPACITY + 100; i++) {
      system.emit({ x: 0, y: 0, z: 0, life: 1, size0: 1, size1: 0, c0: [1, 1, 1, 1], c1: [1, 1, 1, 0] });
    }
    system.update(0.016);
    expect(system.ring.used).toBe(PARTICLE_CAPACITY);
  });
});

describe('quake shake', () => {
  it('decays to zero', () => {
    const shake = new Shake();
    shake.add(1);
    for (let i = 0; i < 200; i++) shake.update(0.016);
    expect(shake.trauma).toBe(0);
    expect(shake.offset(1).map(Math.abs)).toEqual([0, 0, 0]);
  });

  it('shakes harder with more trauma', () => {
    const a = new Shake();
    const b = new Shake();
    a.add(0.3);
    b.add(0.9);
    a.update(0.1);
    b.update(0.1);
    expect(Math.abs(b.offset(1)[0])).toBeGreaterThan(Math.abs(a.offset(1)[0]));
  });
});
