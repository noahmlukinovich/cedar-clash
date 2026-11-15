import { BUILDINGS } from '../config/buildings';
import { GRID } from '../config/balance';
import { BORDER, occupancy } from './economy';
import type { BuildingInst, GameState, Layout } from './state';

export const LAYOUT_SLOTS = 3;

type Pos = Layout['pos'];

/** Record where every building currently stands. */
export function snapshot(buildings: BuildingInst[]): Pos {
  const pos: Pos = {};
  for (const b of buildings) pos[b.id] = { x: b.x, y: b.y };
  return pos;
}

export function defaultName(slot: number): string {
  return `Layout ${slot + 1}`;
}

/**
 * Split buildings into those the layout can place (in bounds, no overlaps) and
 * those it can't (built after the layout was saved, or otherwise in conflict).
 */
export function resolve(buildings: BuildingInst[], pos: Pos): { placed: Map<number, { x: number; y: number }>; missing: BuildingInst[] } {
  const occ = new Uint8Array(GRID * GRID);
  const placed = new Map<number, { x: number; y: number }>();
  const missing: BuildingInst[] = [];
  for (const b of buildings) {
    const p = pos[b.id];
    const sz = BUILDINGS[b.type].size;
    let ok = !!p && p.x >= BORDER && p.y >= BORDER && p.x + sz <= GRID - BORDER && p.y + sz <= GRID - BORDER;
    if (ok) for (let y = p.y; y < p.y + sz && ok; y++) for (let x = p.x; x < p.x + sz; x++) if (occ[y * GRID + x]) ok = false;
    if (!ok) {
      missing.push(b);
      continue;
    }
    for (let y = p.y; y < p.y + sz; y++) for (let x = p.x; x < p.x + sz; x++) occ[y * GRID + x] = 1;
    placed.set(b.id, { x: p.x, y: p.y });
  }
  return { placed, missing };
}

/** True if the slot holds a layout that places every current building. */
export function isComplete(s: GameState, slot: number): boolean {
  const l = s.layouts[slot];
  return !!l && resolve(s.buildings, l.pos).missing.length === 0;
}

/** Keep the active slot in step with the live campus. */
export function syncActive(s: GameState): void {
  const l = s.layouts[s.activeLayout];
  const pos = snapshot(s.buildings);
  if (l) l.pos = pos;
  else s.layouts[s.activeLayout] = { name: defaultName(s.activeLayout), pos };
}

/** Move the live campus into a complete layout and make it the active slot. */
export function activate(s: GameState, slot: number): boolean {
  const l = s.layouts[slot];
  if (!l) return false;
  const { placed, missing } = resolve(s.buildings, l.pos);
  if (missing.length) return false;
  for (const b of s.buildings) {
    const p = placed.get(b.id)!;
    b.x = p.x;
    b.y = p.y;
  }
  s.activeLayout = slot;
  syncActive(s); // also drops ids of buildings that no longer exist
  relocateFence(s);
  return true;
}

/** If the construction-event fence now sits under a building, shift it to the nearest free 2x2. */
export function relocateFence(s: GameState): void {
  const e = s.events.find((ev) => ev.type === 'construction' && ev.end > s.clock && ev.x !== undefined && ev.y !== undefined);
  if (!e) return;
  const occ = occupancy({ ...s, events: [] });
  const free = (x: number, y: number): boolean =>
    x >= BORDER && y >= BORDER && x + 2 <= GRID - BORDER && y + 2 <= GRID - BORDER &&
    !occ[y * GRID + x] && !occ[y * GRID + x + 1] && !occ[(y + 1) * GRID + x] && !occ[(y + 1) * GRID + x + 1];
  const ex = e.x!;
  const ey = e.y!;
  if (free(ex, ey)) return;
  for (let r = 1; r < GRID; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (free(ex + dx, ey + dy)) {
          e.x = ex + dx;
          e.y = ey + dy;
          return;
        }
      }
    }
  }
  e.end = s.clock; // nowhere to put it: the crew goes home
}

/** Repair layout fields on load so the rest of the game can trust them. */
export function ensureLayouts(s: GameState): void {
  const src = Array.isArray(s.layouts) ? s.layouts : [];
  s.layouts = Array.from({ length: LAYOUT_SLOTS }, (_, i) => {
    const l = src[i];
    return l && typeof l === 'object' && l.pos ? { name: String(l.name || defaultName(i)), pos: l.pos } : null;
  });
  if (!(s.activeLayout >= 0 && s.activeLayout < LAYOUT_SLOTS)) s.activeLayout = 0;
  syncActive(s);
}
