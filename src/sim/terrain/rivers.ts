/** Minimal binary min-heap of node ids keyed by an external priority array. */
class MinHeap {
  private readonly items: number[] = [];
  constructor(private readonly key: Float64Array) {}

  get size(): number {
    return this.items.length;
  }

  push(node: number): void {
    const items = this.items;
    items.push(node);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.k(items[parent]) <= this.k(items[i])) break;
      [items[parent], items[i]] = [items[i] ?? 0, items[parent] ?? 0];
      i = parent;
    }
  }

  pop(): number {
    const items = this.items;
    const top = items[0] ?? 0;
    const last = items.pop() ?? 0;
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < items.length && this.k(items[l]) < this.k(items[m])) m = l;
        if (r < items.length && this.k(items[r]) < this.k(items[m])) m = r;
        if (m === i) break;
        [items[m], items[i]] = [items[i] ?? 0, items[m] ?? 0];
        i = m;
      }
    }
    return top;
  }

  private k(node: number | undefined): number {
    return this.key[node ?? 0] ?? Infinity;
  }
}

/**
 * Cost-to-sink field over the (side × side) corner grid. Entering a corner
 * costs more the higher it is, plus a smooth extra cost, so paths that follow
 * the field downhill bend through valleys like rivers do. (Per-corner random
 * jitter would average out and leave the paths straight.)
 */
export function costToSink(
  heights: Int16Array,
  side: number,
  isSink: (corner: number) => boolean,
  extraCost: Float32Array,
): Float64Array {
  const count = side * side;
  const dist = new Float64Array(count).fill(Infinity);
  const heap = new MinHeap(dist);
  for (let i = 0; i < count; i++) {
    if (isSink(i)) {
      dist[i] = 0;
      heap.push(i);
    }
  }

  const done = new Uint8Array(count);
  while (heap.size > 0) {
    const v = heap.pop();
    if (done[v]) continue;
    done[v] = 1;
    const x = v % side;
    const y = (v - x) / side;
    const base = dist[v] ?? Infinity;
    // 8-neighbour steps weighted by length, so paths approximate straight-line
    // distance instead of tying across every axis-aligned staircase.
    for (const [dx, dy, len] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= side || ny >= side) continue;
      const u = ny * side + nx;
      if (done[u]) continue;
      const d = base + len * (1 + 3 * (heights[u] ?? 0) + (extraCost[u] ?? 0));
      if (d < (dist[u] ?? Infinity)) {
        dist[u] = d;
        heap.push(u);
      }
    }
  }
  return dist;
}

const NEIGHBOURS: readonly (readonly [number, number, number])[] = [
  [-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1],
  [-1, -1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [1, 1, Math.SQRT2],
];

/**
 * Follow the field from a source corner down to a sink; returns corner ids.
 * Diagonal steps get an extra corner beside them, so the carved tiles always
 * share an edge.
 */
export function tracePath(dist: Float64Array, side: number, source: number): number[] {
  const path = [source];
  let current = source;
  while ((dist[current] ?? 0) > 0) {
    const x = current % side;
    const y = (current - x) / side;
    let best = current;
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= side || ny >= side) continue;
      const u = ny * side + nx;
      if ((dist[u] ?? Infinity) < (dist[best] ?? Infinity)) best = u;
    }
    if (best === current) break;
    const bx = best % side;
    if (bx !== x && best - bx !== current - x) path.push(y * side + bx);
    current = best;
    path.push(current);
  }
  return path;
}
