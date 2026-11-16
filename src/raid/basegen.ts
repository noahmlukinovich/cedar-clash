// Rival campus generator. Every base comes from a seed plus three knobs: the
// rival's DMC level, a 0..1 `strength` (how fully built and upgraded it is), and
// an archetype that decides the overall shape of the campus.
import { BUILDINGS, maxCount, maxLevelForDmc } from '../config/buildings';
import { GRID, LOOT_FRACTION, MAX_DMC } from '../config/balance';
import { LAYOUT_INFO, RIVAL_NAMES, RIVAL_TAGLINES } from '../config/humor';
import type { BuildingType } from '../config/types';
import { Rng } from '../core/rng';

export interface BasePiece {
  type: BuildingType;
  level: number;
  x: number;
  y: number;
}

export type Archetype = keyof typeof LAYOUT_INFO;
export const ARCHETYPES = Object.keys(LAYOUT_INFO) as Archetype[];

export interface BaseLayout {
  name: string;
  tagline: string;
  dmc: number;
  pieces: BasePiece[];
  loot: { tuition: number; coffee: number };
  trophiesWin: number;
  trophiesLose: number;
  archetype?: Archetype;
  /** 0 (half-built, under-levelled) .. 1 (maxed for its DMC). */
  strength?: number;
  /** Index into DIFFICULTY_LABELS, relative to the player. Set by matchmaking. */
  difficulty?: number;
}

export interface BaseSpec {
  dmc: number;
  seed: number;
  strength?: number;
  archetype?: Archetype;
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
/** Outer ring kept clear so there is always somewhere to deploy. */
const MARGIN = 3;
const STORAGE: BuildingType[] = ['registrar', 'rinnova'];
const DEFENSES: BuildingType[] = ['ratower', 'safetycart', 'sprayer', 'bibleprof', 'hive'];
const CAMPUS: BuildingType[] = ['admissions', 'coffeecart', 'reshall', 'biblical', 'callan', 'ens', 'health', 'library', 'ssc', 'faculty', 'presidents'];

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Working state while a base is being laid out. */
class Plan {
  occ = new Uint8Array(GRID * GRID);
  pieces: BasePiece[] = [];
  walls: number;
  private wallLevel: number;
  private downChance: number;
  private fewerChance: number;

  constructor(public rng: Rng, public dmc: number, strength: number) {
    this.downChance = 0.75 - 0.6 * strength;
    this.fewerChance = 0.5 - 0.4 * strength;
    this.wallLevel = Math.max(1, maxLevelForDmc('wall', dmc) - (rng.next() < this.downChance - 0.05 ? 1 : 0));
    this.walls = maxCount('wall', dmc);
  }

  free(x: number, y: number, s: number): boolean {
    if (x < MARGIN || y < MARGIN || x + s > GRID - MARGIN || y + s > GRID - MARGIN) return false;
    for (let yy = y; yy < y + s; yy++) for (let xx = x; xx < x + s; xx++) if (this.occ[yy * GRID + xx]) return false;
    return true;
  }

  private level(type: BuildingType): number {
    if (type === 'wall') return this.wallLevel;
    if (type === 'dmc') return this.dmc;
    const m = Math.max(1, maxLevelForDmc(type, this.dmc));
    return Math.max(1, m - (this.rng.next() < this.downChance ? 1 : 0));
  }

  /** How many of this building the rival has built (never more than its DMC allows). */
  count(type: BuildingType): number {
    const m = maxCount(type, this.dmc);
    return Math.max(0, m - (m > 1 && this.rng.next() < this.fewerChance ? 1 : 0));
  }

  list(types: BuildingType[]): BuildingType[] {
    const out: BuildingType[] = [];
    for (const t of types) for (let i = this.count(t); i > 0; i--) out.push(t);
    return out;
  }

  /** Place at an exact tile, or return null if it does not fit. */
  put(type: BuildingType, x: number, y: number): BasePiece | null {
    const s = BUILDINGS[type].size;
    if (!this.free(x, y, s)) return null;
    for (let yy = y; yy < y + s; yy++) for (let xx = x; xx < x + s; xx++) this.occ[yy * GRID + xx] = 1;
    const pc = { type, level: this.level(type), x, y };
    this.pieces.push(pc);
    return pc;
  }

  /** Place somewhere in the ring rMin..rMax around (cx, cy). `pad` keeps that many clear tiles around it. */
  scatter(type: BuildingType, cx: number, cy: number, rMin: number, rMax: number, tries = 300, pad = 0): BasePiece | null {
    const s = BUILDINGS[type].size;
    for (let i = 0; i < tries; i++) {
      const a = this.rng.next() * Math.PI * 2;
      const r = rMin + this.rng.next() * (rMax - rMin);
      const x = Math.round(cx + Math.cos(a) * r - s / 2);
      const y = Math.round(cy + Math.sin(a) * r - s / 2);
      if (pad && !this.free(x - pad, y - pad, s + pad * 2)) continue;
      const pc = this.put(type, x, y);
      if (pc) return pc;
    }
    return null;
  }

  /** Like scatter, but widens the search until the building fits somewhere. */
  must(type: BuildingType, cx: number, cy: number, rMin: number, rMax: number): BasePiece | null {
    return this.scatter(type, cx, cy, rMin, rMax) ?? this.scatter(type, cx, cy, 0, rMax + 6) ?? this.scatter(type, GRID / 2, GRID / 2, 0, 17, 600);
  }

  wall(x: number, y: number): boolean {
    if (this.walls <= 0 || !this.put('wall', x, y)) return false;
    this.walls--;
    return true;
  }

  /** Wall the perimeter of a box. `keep` can veto individual tiles (used for one-sided walls). */
  ring(b: Box, gapChance = 0, keep?: (x: number, y: number) => boolean): void {
    const tiles: [number, number][] = [];
    for (let x = b.x0; x <= b.x1; x++) tiles.push([x, b.y0], [x, b.y1]);
    for (let y = b.y0 + 1; y < b.y1; y++) tiles.push([b.x0, y], [b.x1, y]);
    for (const [x, y] of tiles) {
      if (this.walls <= 0) return;
      if (keep && !keep(x, y)) continue;
      if (gapChance && this.rng.next() < gapChance) continue;
      this.wall(x, y);
    }
  }

  line(x0: number, y0: number, x1: number, y1: number): void {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    const dx = Math.sign(x1 - x0);
    const dy = Math.sign(y1 - y0);
    for (let i = 0; i <= n; i++) this.wall(x0 + dx * i, y0 + dy * i);
  }

  /** Bounding box of everything placed so far, grown by `grow` tiles. */
  bounds(grow = 0): Box {
    const b: Box = { x0: GRID, y0: GRID, x1: 0, y1: 0 };
    for (const pc of this.pieces) {
      const s = BUILDINGS[pc.type].size;
      b.x0 = Math.min(b.x0, pc.x);
      b.y0 = Math.min(b.y0, pc.y);
      b.x1 = Math.max(b.x1, pc.x + s - 1);
      b.y1 = Math.max(b.y1, pc.y + s - 1);
    }
    return { x0: b.x0 - grow, y0: b.y0 - grow, x1: b.x1 + grow, y1: b.y1 + grow };
  }
}

const boxOf = (pc: BasePiece, grow: number): Box => {
  const s = BUILDINGS[pc.type].size;
  return { x0: pc.x - grow, y0: pc.y - grow, x1: pc.x + s - 1 + grow, y1: pc.y + s - 1 + grow };
};
const radiusOf = (b: Box): number => Math.max(b.x1 - b.x0, b.y1 - b.y0) / 2;
/** Splash defenses do the most damage in the middle of a base, so they go first. */
const splashFirst = (defs: BuildingType[]): BuildingType[] => [...defs].sort((a, b) => Number(b === 'sprayer' || b === 'bibleprof') - Number(a === 'sprayer' || a === 'bibleprof'));

function campusAndExtras(p: Plan, cx: number, cy: number, r0: number, r1: number): void {
  for (const t of [...p.list(CAMPUS), 'shed', 'shed'] as BuildingType[]) p.must(t, cx, cy, r0, r1);
}

function traps(p: Plan, cx: number, cy: number, rMax: number): void {
  for (let i = p.count('nest'); i > 0; i--) p.scatter('nest', cx, cy, 2, rMax, 100);
}

function lakes(p: Plan, cx: number, cy: number, rMin: number): void {
  for (let i = p.rng.int(0, 2); i > 0; i--) p.scatter('lake', cx, cy, rMin, 16, 60);
}

// ---------- Archetypes ----------
// Each one places the DMC first, so a base always has exactly one.

/** One compact core around the DMC inside a single brick ring. */
function fortress(p: Plan): void {
  const cx = 20 + p.rng.int(-1, 1);
  const cy = 20 + p.rng.int(-1, 1);
  p.put('dmc', cx - 2, cy - 2);
  const defs = splashFirst(p.list(DEFENSES));
  const inner = defs.slice(0, Math.ceil(defs.length * 0.6));
  for (const t of [...p.list(STORAGE), ...inner]) p.scatter(t, cx, cy, 3, 6.5) ?? p.scatter(t, cx, cy, 3, 10);
  const core = p.bounds(1);
  p.ring(core, p.dmc <= 2 ? 0.12 : 0.03);
  const r0 = radiusOf(core) + 1;
  for (const t of defs.slice(inner.length)) p.scatter(t, cx, cy, r0, r0 + 4) ?? p.scatter(t, cx, cy, r0, r0 + 9);
  campusAndExtras(p, cx, cy, r0 + 1, r0 + 8);
  if (p.walls > 20) {
    const r = Math.round(r0 + 3);
    p.ring({ x0: cx - r, y0: cy - r, x1: cx + r, y1: cy + r }, 0.15);
  }
  traps(p, cx, cy, r0 + 3);
  lakes(p, cx, cy, r0 + 4);
}

/** The DMC in its own box, with the core cut into walled cells around it. */
function compartments(p: Plan): void {
  const cx = 20 + p.rng.int(-1, 1);
  const cy = 20 + p.rng.int(-1, 1);
  const dmc = p.put('dmc', cx - 2, cy - 2)!;
  const box = boxOf(dmc, 1);
  p.ring(box);
  const defs = splashFirst(p.list(DEFENSES));
  const inner = defs.slice(0, Math.ceil(defs.length * 0.7));
  for (const t of [...p.list(STORAGE), ...inner]) p.scatter(t, cx, cy, 4.5, 8) ?? p.scatter(t, cx, cy, 4.5, 11);
  const core = p.bounds(1);
  if (p.walls >= 60) p.ring(core, 0.02);
  // Spokes from the DMC box out to the edge of the core: a tic-tac-toe of walls.
  p.line(box.x0, box.y0 - 1, box.x0, core.y0);
  p.line(box.x1, box.y1 + 1, box.x1, core.y1);
  p.line(box.x1 + 1, box.y0, core.x1, box.y0);
  p.line(box.x0 - 1, box.y1, core.x0, box.y1);
  p.line(box.x1, box.y0 - 1, box.x1, core.y0);
  p.line(box.x0, box.y1 + 1, box.x0, core.y1);
  p.line(box.x1 + 1, box.y1, core.x1, box.y1);
  p.line(box.x0 - 1, box.y0, core.x0, box.y0);
  const r0 = radiusOf(core) + 1;
  for (const t of defs.slice(inner.length)) p.must(t, cx, cy, r0, r0 + 5);
  campusAndExtras(p, cx, cy, r0 + 1, r0 + 8);
  traps(p, cx, cy, r0 + 1);
  lakes(p, cx, cy, r0 + 4);
}

/** Spread across the whole map; walls go into small pens around individual defenses. */
function sprawl(p: Plan): void {
  const cx = 20 + p.rng.int(-2, 2);
  const cy = 20 + p.rng.int(-2, 2);
  const dmc = p.put('dmc', cx - 2, cy - 2)!;
  p.ring(boxOf(dmc, 1), 0.05);
  for (const t of splashFirst(p.list(DEFENSES))) {
    const pc = p.scatter(t, cx, cy, 5, 13, 300, 1) ?? p.must(t, cx, cy, 4, 14);
    if (pc && p.walls >= 12) p.ring(boxOf(pc, 1), 0.08);
  }
  for (const t of p.list(STORAGE)) p.must(t, cx, cy, 4, 11);
  campusAndExtras(p, cx, cy, 6, 15);
  traps(p, cx, cy, 13);
  lakes(p, cx, cy, 9);
}

/** Lakes wrap one flank, so the walls only have to face the other way. */
function lakeside(p: Plan): void {
  const a = (p.rng.int(0, 7) * Math.PI) / 4;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const cx = Math.round(20 + dx * 4);
  const cy = Math.round(20 + dy * 4);
  p.put('dmc', cx - 2, cy - 2);
  const defs = splashFirst(p.list(DEFENSES));
  const inner = defs.slice(0, Math.ceil(defs.length * 0.6));
  for (const t of [...p.list(STORAGE), ...inner]) p.scatter(t, cx, cy, 3, 6.5) ?? p.scatter(t, cx, cy, 3, 10);
  const core = p.bounds(1);
  const r0 = radiusOf(core) + 1;
  // A crescent of water on the side the base leans toward (not limited by the shop's lake count).
  for (const r of [r0 + 1.5, r0 + 4]) {
    const step = 2.1 / r;
    for (let t = -1.25; t <= 1.25; t += step) p.put('lake', Math.round(cx + Math.cos(a + t) * r - 1), Math.round(cy + Math.sin(a + t) * r - 1));
  }
  // Brick only on the side the lakes leave open.
  const open = (x: number, y: number): boolean => (x + 0.5 - cx) * dx + (y + 0.5 - cy) * dy < 1.5;
  p.ring(core, 0.03, open);
  if (p.walls > 20) p.ring({ x0: core.x0 - 3, y0: core.y0 - 3, x1: core.x1 + 3, y1: core.y1 + 3 }, 0.12, open);
  const ox = cx - dx * (r0 + 3);
  const oy = cy - dy * (r0 + 3);
  for (const t of defs.slice(inner.length)) p.must(t, ox, oy, 0, 5);
  campusAndExtras(p, ox, oy, 1, 9);
  traps(p, ox, oy, 7);
}

/** The DMC sits in one corner behind its walls, with the rest of campus out front as a screen. */
function corner(p: Plan): void {
  const sx = p.rng.next() < 0.5 ? -1 : 1;
  const sy = p.rng.next() < 0.5 ? -1 : 1;
  const cx = 20 + sx * 7;
  const cy = 20 + sy * 7;
  p.put('dmc', cx - 2, cy - 2);
  const defs = splashFirst(p.list(DEFENSES));
  const inner = defs.slice(0, Math.ceil(defs.length * 0.5));
  for (const t of [...p.list(STORAGE), ...inner]) p.scatter(t, cx, cy, 3, 6) ?? p.must(t, cx, cy, 3, 9);
  const core = p.bounds(1);
  p.ring(core, 0.03);
  if (p.walls > 20) p.ring({ x0: core.x0 - 2, y0: core.y0 - 2, x1: core.x1 + 2, y1: core.y1 + 2 }, 0.1);
  // Everything else lines the approach from the far corner.
  const mx = 20 - sx * 2;
  const my = 20 - sy * 2;
  for (const t of defs.slice(inner.length)) p.must(t, mx, my, 0, 6);
  campusAndExtras(p, 20 - sx * 5, 20 - sy * 5, 0, 10);
  traps(p, mx, my, 8);
  lakes(p, 20 - sx * 6, 20 - sy * 6, 6);
}

/** Storages and the big defenses in a vault; the DMC is left outside as bait. */
function donut(p: Plan): void {
  const cx = 20 + p.rng.int(-1, 1);
  const cy = 20 + p.rng.int(-1, 1);
  const a = p.rng.next() * Math.PI * 2;
  // Reserve the DMC's lot first so the vault can't crowd it out.
  const dmc = p.put('dmc', Math.round(cx + Math.cos(a) * 11 - 2), Math.round(cy + Math.sin(a) * 11 - 2)) ?? p.must('dmc', cx, cy, 9, 13);
  const start = p.pieces.length;
  const defs = splashFirst(p.list(DEFENSES));
  const inner = defs.slice(0, Math.ceil(defs.length * 0.75));
  for (const t of [...p.list(STORAGE), ...inner]) p.scatter(t, cx, cy, 0, 5.5) ?? p.must(t, cx, cy, 0, 8);
  // Ring only the vault, not the DMC.
  const vault: Box = { x0: GRID, y0: GRID, x1: 0, y1: 0 };
  for (const pc of p.pieces.slice(start)) {
    const b = boxOf(pc, 1);
    vault.x0 = Math.min(vault.x0, b.x0);
    vault.y0 = Math.min(vault.y0, b.y0);
    vault.x1 = Math.max(vault.x1, b.x1);
    vault.y1 = Math.max(vault.y1, b.y1);
  }
  p.ring(vault, 0.02);
  if (p.walls > 30) p.ring({ x0: vault.x0 - 2, y0: vault.y0 - 2, x1: vault.x1 + 2, y1: vault.y1 + 2 }, 0.06);
  const r0 = radiusOf(vault) + 2;
  for (const t of defs.slice(inner.length)) p.must(t, cx, cy, r0, r0 + 5);
  campusAndExtras(p, cx, cy, r0 + 1, r0 + 9);
  // The bait is trapped.
  const bx = dmc ? dmc.x + 2 : cx;
  const by = dmc ? dmc.y + 2 : cy;
  for (let i = p.count('nest'); i > 0; i--) p.scatter('nest', bx, by, 2.5, 5, 100) ?? p.scatter('nest', cx, cy, 2, r0 + 3, 100);
  lakes(p, cx, cy, r0 + 4);
}

const BUILDERS: Record<Archetype, (p: Plan) => void> = { fortress, compartments, sprawl, lakeside, corner, donut };

export function generateBase(spec: BaseSpec): BaseLayout {
  const rng = new Rng(spec.seed);
  const dmc = Math.max(1, Math.min(MAX_DMC, Math.round(spec.dmc)));
  const strength = Math.max(0, Math.min(1, spec.strength ?? 0.5));
  const archetype = spec.archetype ?? rng.pick(ARCHETYPES);
  const plan = new Plan(rng, dmc, strength);
  BUILDERS[archetype](plan);

  // Better-run rivals have fuller storages.
  const rich = 0.75 + 0.5 * strength;
  const loot = {
    tuition: Math.round(BASE_LOOT[dmc] * rng.range(0.7, 1.35) * rich * LOOT_FRACTION * 2),
    coffee: Math.round(BASE_LOOT[dmc] * rng.range(0.7, 1.35) * rich * LOOT_FRACTION * 2),
  };
  return {
    name: rng.pick(RIVAL_NAMES),
    tagline: rng.pick(RIVAL_TAGLINES),
    dmc,
    pieces: plan.pieces,
    loot,
    trophiesWin: rng.int(22, 34),
    trophiesLose: rng.int(10, 18),
    archetype,
    strength,
  };
}
