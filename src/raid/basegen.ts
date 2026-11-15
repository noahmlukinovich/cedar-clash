import { BUILDINGS, maxCount, maxLevelForDmc } from '../config/buildings';
import { GRID, LOOT_FRACTION } from '../config/balance';
import { RIVAL_NAMES, RIVAL_TAGLINES } from '../config/humor';
import type { BuildingType } from '../config/types';
import { Rng } from '../core/rng';

export interface BasePiece {
  type: BuildingType;
  level: number;
  x: number;
  y: number;
}

export interface BaseLayout {
  name: string;
  tagline: string;
  dmc: number;
  pieces: BasePiece[];
  loot: { tuition: number; coffee: number };
  trophiesWin: number;
  trophiesLose: number;
}

/** Hand-made tutorial base. */
export function rivalStateU(): BaseLayout {
  const p: BasePiece[] = [];
  const add = (type: BuildingType, x: number, y: number, level = 1): void => {
    p.push({ type, x, y, level });
  };
  add('dmc', 19, 19, 2);
  add('registrar', 15, 19);
  add('rinnova', 19, 15);
  add('safetycart', 23, 15);
  add('ratower', 15, 15);
  // partial wall arc on the south-east side (protects the DMC from the front)
  for (let i = 14; i <= 26; i++) add('wall', i, 25);
  for (let i = 14; i <= 24; i++) add('wall', 26, i);
  add('admissions', 27, 19);
  add('coffeecart', 19, 27);
  add('reshall', 9, 20);
  add('biblical', 21, 9);
  add('shed', 12, 12);
  add('nest', 23, 23);
  add('lake', 27, 27);
  return {
    name: 'Rival State U',
    tagline: 'Mascot: a vaguely aggressive bird. Defenses: mostly vibes.',
    dmc: 2,
    pieces: p,
    loot: { tuition: 1500, coffee: 1500 },
    trophiesWin: 30,
    trophiesLose: 5,
  };
}

const BASE_LOOT = [0, 1500, 3500, 7000, 14000, 26000, 45000];

export function generateBase(dmc: number, seed: number): BaseLayout {
  const rng = new Rng(seed);
  const occ = new Uint8Array(GRID * GRID);
  const pieces: BasePiece[] = [];
  const B = 3; // keep outer ring free for deployment
  const free = (x: number, y: number, s: number): boolean => {
    if (x < B || y < B || x + s > GRID - B || y + s > GRID - B) return false;
    for (let yy = y; yy < y + s; yy++) for (let xx = x; xx < x + s; xx++) if (occ[yy * GRID + xx]) return false;
    return true;
  };
  const mark = (x: number, y: number, s: number): void => {
    for (let yy = y; yy < y + s; yy++) for (let xx = x; xx < x + s; xx++) occ[yy * GRID + xx] = 1;
  };
  const wallLevel = Math.max(1, maxLevelForDmc('wall', dmc) - (rng.next() < 0.4 ? 1 : 0));
  const lvl = (type: BuildingType): number => {
    if (type === 'wall') return wallLevel;
    const m = Math.max(1, maxLevelForDmc(type, dmc));
    return Math.max(1, m - (rng.next() < 0.45 ? 1 : 0));
  };
  const place = (type: BuildingType, cx: number, cy: number, rMin: number, rMax: number, tries = 300): BasePiece | null => {
    const s = BUILDINGS[type].size;
    for (let i = 0; i < tries; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = rMin + rng.next() * (rMax - rMin);
      const x = Math.round(cx + Math.cos(a) * r - s / 2);
      const y = Math.round(cy + Math.sin(a) * r - s / 2);
      if (free(x, y, s)) {
        mark(x, y, s);
        const pc = { type, level: lvl(type), x, y };
        pieces.push(pc);
        return pc;
      }
    }
    return null;
  };
  const cx = 20 + rng.int(-1, 1);
  const cy = 20 + rng.int(-1, 1);
  // DMC in the middle
  const dmcPiece = { type: 'dmc' as BuildingType, level: dmc, x: cx - 2, y: cy - 2 };
  pieces.push(dmcPiece);
  mark(dmcPiece.x, dmcPiece.y, 4);

  const count = (t: BuildingType): number => {
    const m = maxCount(t, dmc);
    if (t === 'wall' || t === 'dmc') return m;
    return Math.max(0, m - (m > 1 && rng.next() < 0.3 ? 1 : 0));
  };

  // Inner core: storages + most defenses packed around the DMC
  const core: BuildingType[] = [];
  for (const t of ['registrar', 'rinnova'] as BuildingType[]) for (let i = 0; i < count(t); i++) core.push(t);
  const defs: BuildingType[] = [];
  for (const t of ['ratower', 'safetycart', 'sprayer', 'bibleprof', 'hive'] as BuildingType[]) for (let i = 0; i < count(t); i++) defs.push(t);
  // splash defenses (sprayer, bible prof) love the middle
  defs.sort((a, b) => (a === 'sprayer' || a === 'bibleprof' ? -1 : 0) - (b === 'sprayer' || b === 'bibleprof' ? -1 : 0));
  const innerDefs = defs.slice(0, Math.ceil(defs.length * 0.6));
  const outerDefs = defs.slice(innerDefs.length);
  for (const t of [...core, ...innerDefs]) place(t, cx, cy, 3, 6.5) ?? place(t, cx, cy, 3, 10);

  // Walls around the core bounding box
  let walls = count('wall');
  let minX = GRID;
  let minY = GRID;
  let maxX = 0;
  let maxY = 0;
  for (const pc of pieces) {
    const s = BUILDINGS[pc.type].size;
    minX = Math.min(minX, pc.x);
    minY = Math.min(minY, pc.y);
    maxX = Math.max(maxX, pc.x + s - 1);
    maxY = Math.max(maxY, pc.y + s - 1);
  }
  const ring = (x0: number, y0: number, x1: number, y1: number, gapChance: number): void => {
    const tiles: [number, number][] = [];
    for (let x = x0; x <= x1; x++) tiles.push([x, y0], [x, y1]);
    for (let y = y0 + 1; y < y1; y++) tiles.push([x0, y], [x1, y]);
    for (const [x, y] of tiles) {
      if (walls <= 0) return;
      if (rng.next() < gapChance) continue;
      if (free(x, y, 1)) {
        mark(x, y, 1);
        pieces.push({ type: 'wall', level: lvl('wall'), x, y });
        walls--;
      }
    }
  };
  ring(minX - 1, minY - 1, maxX + 1, maxY + 1, dmc <= 2 ? 0.12 : 0.03);

  // Outer ring: remaining defenses, then economy & army buildings
  const R0 = Math.max(maxX - minX, maxY - minY) / 2 + 2;
  for (const t of outerDefs) place(t, cx, cy, R0, R0 + 4) ?? place(t, cx, cy, R0, R0 + 9);
  const outer: BuildingType[] = [];
  for (const t of ['admissions', 'coffeecart', 'reshall', 'biblical', 'callan', 'ens', 'health', 'library', 'ssc', 'faculty', 'presidents', 'business', 'music'] as BuildingType[]) {
    for (let i = 0; i < count(t); i++) outer.push(t);
  }
  outer.push('shed', 'shed');
  for (const t of outer) place(t, cx, cy, R0 + 1, R0 + 8) ?? place(t, cx, cy, R0, 17);
  // second partial wall ring at higher levels
  if (walls > 20) {
    const r = Math.round(R0 + 3);
    ring(cx - r, cy - r, cx + r, cy + r, 0.15);
  }
  // Traps sprinkled around defenses / gaps
  for (let i = 0; i < count('nest'); i++) place('nest', cx, cy, 2, R0 + 3, 100);
  // Decorative lakes on the outskirts
  const lakes = rng.int(0, 2);
  for (let i = 0; i < lakes; i++) place('lake', cx, cy, R0 + 4, 16, 60);

  const mult = rng.range(0.7, 1.35);
  const loot = {
    tuition: Math.round(BASE_LOOT[dmc] * mult * LOOT_FRACTION * 2),
    coffee: Math.round(BASE_LOOT[dmc] * rng.range(0.7, 1.35) * LOOT_FRACTION * 2),
  };
  return {
    name: rng.pick(RIVAL_NAMES),
    tagline: rng.pick(RIVAL_TAGLINES),
    dmc,
    pieces,
    loot,
    trophiesWin: rng.int(22, 34),
    trophiesLose: rng.int(10, 18),
  };
}
