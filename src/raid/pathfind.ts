// A* on the tile grid. Walls are passable at high cost (troops break through them
// when going around would be much longer). Other buildings and lakes are impassable.
import { GRID } from '../config/balance';
import { distToRect } from '../core/iso';

export const BLOCKED = 0;
export const FREE = 1;
export const WALL_COST = 9;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

class Heap {
  idx: number[] = [];
  f: number[] = [];
  push(i: number, f: number): void {
    const a = this.idx;
    const b = this.f;
    a.push(i);
    b.push(f);
    let n = a.length - 1;
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (b[p] <= b[n]) break;
      [a[p], a[n]] = [a[n], a[p]];
      [b[p], b[n]] = [b[n], b[p]];
      n = p;
    }
  }
  pop(): number {
    const a = this.idx;
    const b = this.f;
    const top = a[0];
    const li = a.pop()!;
    const lf = b.pop()!;
    if (a.length) {
      a[0] = li;
      b[0] = lf;
      let n = 0;
      for (;;) {
        const l = n * 2 + 1;
        const r = l + 1;
        let m = n;
        if (l < a.length && b[l] < b[m]) m = l;
        if (r < a.length && b[r] < b[m]) m = r;
        if (m === n) break;
        [a[m], a[n]] = [a[n], a[m]];
        [b[m], b[n]] = [b[n], b[m]];
        n = m;
      }
    }
    return top;
  }
  get size(): number {
    return this.idx.length;
  }
}

const N = GRID * GRID;
const gScore = new Float32Array(N);
const came = new Int32Array(N);
const closed = new Uint8Array(N);
const DIRS: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, 1.414],
  [1, -1, 1.414],
  [-1, 1, 1.414],
  [-1, -1, 1.414],
];

/**
 * Find a path from (sx, sy) tile to any tile within `range` of target rect.
 * cost[] holds per-tile cost: 0 blocked, 1 free, WALL_COST for walls.
 * Returns list of tile indices (excluding start), or null.
 */
export function findPath(cost: Uint8Array, sx: number, sy: number, target: Rect, range: number, maxIter = 4000): number[] | null {
  sx = Math.max(0, Math.min(GRID - 1, sx));
  sy = Math.max(0, Math.min(GRID - 1, sy));
  const start = sy * GRID + sx;
  gScore.fill(Infinity);
  closed.fill(0);
  const open = new Heap();
  gScore[start] = 0;
  came[start] = -1;
  const h = (x: number, y: number): number => Math.max(0, distToRect(x + 0.5, y + 0.5, target.x, target.y, target.w, target.h) - range);
  open.push(start, h(sx, sy));
  let iter = 0;
  let best = start;
  let bestH = h(sx, sy);
  while (open.size && iter++ < maxIter) {
    const cur = open.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % GRID;
    const cy = (cur / GRID) | 0;
    const hc = h(cx, cy);
    if (hc <= 0.001 && cost[cur] !== BLOCKED) return rebuild(cur);
    if (hc < bestH) {
      bestH = hc;
      best = cur;
    }
    for (const [dx, dy, dc] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
      const ni = ny * GRID + nx;
      const c = cost[ni];
      if (c === BLOCKED || closed[ni]) continue;
      if (dx && dy) {
        // no corner cutting past blocked/walls
        if (cost[cy * GRID + nx] !== FREE || cost[ny * GRID + cx] !== FREE) continue;
      }
      const g = gScore[cur] + dc * c;
      if (g < gScore[ni]) {
        gScore[ni] = g;
        came[ni] = cur;
        open.push(ni, g + h(nx, ny) * 1.05);
      }
    }
  }
  // fall back to the closest point we reached
  return best !== start ? rebuild(best) : null;
}

function rebuild(end: number): number[] {
  const out: number[] = [];
  let c = end;
  while (c !== -1 && came[c] !== -1) {
    out.push(c);
    c = came[c];
  }
  out.reverse();
  return out;
}
