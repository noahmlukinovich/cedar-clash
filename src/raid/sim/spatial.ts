// A uniform grid over the map (one cell per tile) for "which units are near this point?"
// Without it, auras, splash damage, trap triggers and crowd separation compare every unit
// with every other unit, which gets slow with big armies.
//
// Queries return units in uid order (the order they were spawned, which is also their order
// in RaidSim.units), so code that used to scan the whole unit list picks the same unit and
// applies effects in the same order as before: a raid plays out exactly as it did.
import { GRID } from '../../config/balance';
import type { RU } from './types';

/**
 * Units move between a rebuild and a query (the grid is rebuilt twice per tick), so queries are
 * padded by this much. The fastest unit (a Cross Country Runner at full momentum with every buff)
 * covers well under a tile per tick, so a full tile is a safe margin.
 */
const SLOP = 1;

export class UnitGrid {
  private cells: RU[][] = Array.from({ length: GRID * GRID }, () => []);
  private used: number[] = [];

  /** Re-bucket every living unit by the tile it stands on. */
  rebuild(units: RU[]): void {
    for (const i of this.used) this.cells[i].length = 0;
    this.used.length = 0;
    for (const u of units) {
      if (u.dead) continue;
      const i = cellOf(u.y) * GRID + cellOf(u.x);
      const cell = this.cells[i];
      if (!cell.length) this.used.push(i);
      cell.push(u);
    }
  }

  /** Add a unit spawned since the last rebuild, so the rest of this tick can see it. */
  add(u: RU): void {
    const i = cellOf(u.y) * GRID + cellOf(u.x);
    const cell = this.cells[i];
    if (!cell.length) this.used.push(i);
    cell.push(u);
  }

  /**
   * Living units whose cell touches the box [x0, x1] x [y0, y1], in uid order. This is a broad
   * phase: callers still test the exact distance.
   */
  inBox(x0: number, y0: number, x1: number, y1: number): RU[] {
    const out: RU[] = [];
    const ax = cellOf(x0 - SLOP);
    const ay = cellOf(y0 - SLOP);
    const bx = cellOf(x1 + SLOP);
    const by = cellOf(y1 + SLOP);
    for (let cy = ay; cy <= by; cy++) {
      for (let cx = ax; cx <= bx; cx++) {
        const cell = this.cells[cy * GRID + cx];
        for (let i = 0; i < cell.length; i++) if (!cell[i].dead) out.push(cell[i]);
      }
    }
    if (out.length > 1) out.sort(byUid);
    return out;
  }

  /** Living units within the square of half-size `r` around (x, y), in uid order. */
  near(x: number, y: number, r: number): RU[] {
    return this.inBox(x - r, y - r, x + r, y + r);
  }
}

function cellOf(v: number): number {
  const c = Math.floor(v);
  return c < 0 ? 0 : c >= GRID ? GRID - 1 : c;
}

const byUid = (a: RU, b: RU): number => a.uid - b.uid;
