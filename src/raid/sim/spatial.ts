// Uniform grid over the map (one cell per tile) for "who is near this point?"
// queries. Without it every aura, splash, and separation check compares each
// unit with every other unit.
import { GRID } from '../../config/balance';
import type { RU } from './types';

/** Units drift a little between a rebuild and a query; pad queries to cover it. */
const SLOP = 0.3;

export class UnitGrid {
  private cells: RU[][] = Array.from({ length: GRID * GRID }, () => []);
  private used: number[] = [];

  /** Re-bucket every living unit. */
  rebuild(units: RU[]): void {
    for (const i of this.used) this.cells[i].length = 0;
    this.used.length = 0;
    for (const u of units) {
      if (u.dead) continue;
      const cx = Math.min(GRID - 1, Math.max(0, Math.floor(u.x)));
      const cy = Math.min(GRID - 1, Math.max(0, Math.floor(u.y)));
      const cell = this.cells[cy * GRID + cx];
      if (!cell.length) this.used.push(cy * GRID + cx);
      cell.push(u);
    }
  }

  /**
   * Visit every living unit whose cell touches the box [x0, x1] x [y0, y1].
   * This is a broad phase: callers still check the exact distance.
   */
  forEachInBox(x0: number, y0: number, x1: number, y1: number, fn: (u: RU) => void): void {
    const ax = Math.max(0, Math.floor(x0 - SLOP));
    const ay = Math.max(0, Math.floor(y0 - SLOP));
    const bx = Math.min(GRID - 1, Math.floor(x1 + SLOP));
    const by = Math.min(GRID - 1, Math.floor(y1 + SLOP));
    for (let cy = ay; cy <= by; cy++) {
      for (let cx = ax; cx <= bx; cx++) {
        const cell = this.cells[cy * GRID + cx];
        for (let i = 0; i < cell.length; i++) if (!cell[i].dead) fn(cell[i]);
      }
    }
  }

  forEachNear(x: number, y: number, r: number, fn: (u: RU) => void): void {
    this.forEachInBox(x - r, y - r, x + r, y + r, fn);
  }
}
