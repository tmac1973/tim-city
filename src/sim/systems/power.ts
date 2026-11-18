import { POWER_SUPPLY } from '@/shared/costs';
import { MAX_DENSITY, TileFlag, TileKind, zoneOf } from '@/shared/tiles';
import { footprintAt } from '../tools/footprint';
import type { System } from '../scheduler';
import type { CityState } from '../state';

/** Power a zone draws: one unit per density level, at least one for an empty lot. */
export function zoneDemand(density: number): number {
  return Math.max(1, Math.min(MAX_DENSITY, density));
}

function plantSupply(kind: number): number {
  return kind === TileKind.CoalPlant ? POWER_SUPPLY.coal : kind === TileKind.NuclearPlant ? POWER_SUPPLY.nuclear : 0;
}

/**
 * Monthly power flow. Each connected grid (tiles with the CONDUCTIVE flag)
 * pools the supply of its plants, then power spreads outward from the plants
 * in breadth-first order. Each zone takes its demand when first reached; once
 * a zone can't be served the grid is at capacity and everything farther away
 * stays dark.
 */
export function updatePower(state: CityState): { unpowered: number; atCapacity: boolean } {
  const { size, tiles, flags } = state;
  const count = size * size;
  const before = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    before[i] = (flags[i] ?? 0) & TileFlag.POWERED;
    flags[i] = (flags[i] ?? 0) & ~TileFlag.POWERED;
  }

  // Plant top-left tiles, in map order, so grids are processed deterministically.
  const plants: number[] = [];
  for (let i = 0; i < count; i++) {
    const kind = tiles[i] ?? 0;
    if ((kind === TileKind.CoalPlant || kind === TileKind.NuclearPlant) && state.parts[i] === 1) plants.push(i);
  }

  const component = new Int32Array(count).fill(-1);
  const neighbours = (i: number, visit: (n: number) => void) => {
    const x = i % size;
    if (x > 0) visit(i - 1);
    if (x < size - 1) visit(i + 1);
    if (i >= size) visit(i - size);
    if (i < count - size) visit(i + size);
  };
  const conductive = (i: number) => ((flags[i] ?? 0) & TileFlag.CONDUCTIVE) !== 0;

  // Pass 1: label grids and pool each grid's supply.
  const supply: number[] = [];
  for (const p of plants) {
    if (component[p] !== -1) {
      supply[component[p] ?? 0] = (supply[component[p] ?? 0] ?? 0) + plantSupply(tiles[p] ?? 0);
      continue;
    }
    const id = supply.length;
    supply.push(plantSupply(tiles[p] ?? 0));
    const queue = [p];
    component[p] = id;
    for (let q = 0; q < queue.length; q++) {
      neighbours(queue[q] ?? 0, (n) => {
        if (component[n] === -1 && conductive(n)) {
          component[n] = id;
          queue.push(n);
        }
      });
    }
  }

  // Pass 2: per grid, spread power outward from all its plants at once.
  let unpowered = 0;
  let atCapacity = false;
  const served = new Uint8Array(count);
  for (let id = 0; id < supply.length; id++) {
    let remaining = supply[id] ?? 0;
    const seeds = plants.filter((p) => component[p] === id);
    const seen = new Uint8Array(count);
    const queue: number[] = [];
    for (const p of seeds) {
      const plant = footprintAt(state, p % size, Math.floor(p / size));
      if (!plant) continue;
      for (let dy = 0; dy < plant.size; dy++) {
        for (let dx = 0; dx < plant.size; dx++) {
          const t = state.index(plant.x + dx, plant.y + dy);
          if (!seen[t]) {
            seen[t] = 1;
            queue.push(t);
          }
        }
      }
    }
    let exhausted = false;
    for (let q = 0; q < queue.length; q++) {
      const t = queue[q] ?? 0;
      const zone = zoneOf(tiles[t] ?? 0);
      if (zone && !served[t]) {
        const lot = footprintAt(state, t % size, Math.floor(t / size));
        const need = zoneDemand(zone.density);
        if (lot && need > remaining) {
          exhausted = true;
          break;
        }
        remaining -= need;
        if (lot) {
          for (let dy = 0; dy < lot.size; dy++) {
            for (let dx = 0; dx < lot.size; dx++) served[state.index(lot.x + dx, lot.y + dy)] = 1;
          }
        }
      }
      flags[t] = (flags[t] ?? 0) | TileFlag.POWERED;
      neighbours(t, (n) => {
        if (!seen[n] && conductive(n)) {
          seen[n] = 1;
          queue.push(n);
        }
      });
    }
    if (exhausted) atCapacity = true;
    // Zones this grid couldn't reach before capacity ran out keep no power.
  }
  // Light every tile of a served zone, even ones the search hadn't visited.
  for (let i = 0; i < count; i++) if (served[i]) flags[i] = (flags[i] ?? 0) | TileFlag.POWERED;

  for (let i = 0; i < count; i++) {
    const f = flags[i] ?? 0;
    if (f & TileFlag.ZONE_CENTER && !(f & TileFlag.POWERED)) unpowered++;
    // Only tiles whose power changed need to reach the renderer.
    if ((f & TileFlag.POWERED) !== before[i]) state.markDirty(i % size, Math.floor(i / size));
  }
  return { unpowered, atCapacity };
}

export function powerSystem(emit: (event: { type: 'brownout'; unpowered: number }) => void): System {
  return {
    name: 'power',
    phaseTicks: [0],
    run(state) {
      const { unpowered, atCapacity } = updatePower(state);
      // Report a brownout when it starts, not every month it lasts.
      if (atCapacity && !state.brownout) emit({ type: 'brownout', unpowered });
      state.brownout = atCapacity;
    },
  };
}
