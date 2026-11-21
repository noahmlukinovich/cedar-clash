import { BUILDINGS } from '../config/buildings';
import { GRID } from '../config/balance';
import type { BuildingType } from '../config/types';
import { hash2 } from '../core/rng';
import { toWorld } from '../core/iso';
import { CATAPULT_AXLE_Z, STINGER_TIP_Z, buildingThemeContext, buildingThemeTier, drawRaTowerCanopy, getBuildingSprite, type Sprite } from './buildingSprites';
import { C, OUT, P, box, poly, roundRect, shade } from './draw';
import { drawBuilder } from './unitSprites';

type Ctx = CanvasRenderingContext2D;

const groundCache = new Map<string, HTMLCanvasElement>();
const GX0 = -GRID * 32 - 40;
const GY0 = -40;
const GW = GRID * 64 + 80;
const GH = GRID * 32 + 80;

/** Static ground is rendered once into an offscreen canvas; only the grid overlay is live. */
export function drawGround(ctx: Ctx, opts: { grid?: boolean; border: number; tint?: string; snow?: boolean }): void {
  const key = `${opts.border}|${opts.tint ?? ''}|${opts.snow ? 1 : 0}`;
  let c = groundCache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    const S = 1.5;
    c.width = GW * S;
    c.height = GH * S;
    const g = c.getContext('2d')!;
    g.scale(S, S);
    g.translate(-GX0, -GY0);
    drawGroundRaw(g, { ...opts, grid: false });
    groundCache.set(key, c);
  }
  ctx.fillStyle = opts.snow ? '#dfe9ef' : '#3f8a2a';
  ctx.fillRect(GX0 - 3000, GY0 - 3000, GW + 6000, GH + 6000);
  drawSurroundings(ctx, !!opts.snow);
  ctx.drawImage(c, GX0, GY0, GW, GH);
  if (opts.grid) {
    ctx.save();
    ctx.transform(32, 16, -32, 16, 0, 0);
    const b = opts.border;
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 0.04;
    ctx.beginPath();
    for (let i = b; i <= GRID - b; i++) {
      ctx.moveTo(i, b);
      ctx.lineTo(i, GRID - b);
      ctx.moveTo(b, i);
      ctx.lineTo(GRID - b, i);
    }
    ctx.stroke();
    ctx.restore();
  }
}

function drawGroundRaw(ctx: Ctx, opts: { grid?: boolean; border: number; tint?: string; snow?: boolean }): void {
  // world-space: apply iso transform for tile rects
  ctx.save();
  ctx.transform(32, 16, -32, 16, 0, 0);
  // outer forest floor
  // map base
  ctx.fillStyle = opts.snow ? '#eef4f7' : C.grass;
  ctx.fillRect(0, 0, GRID, GRID);
  // checker
  ctx.fillStyle = opts.snow ? '#e3ecf1' : '#62b03b';
  for (let y = 0; y < GRID; y++) {
    for (let x = (y & 1); x < GRID; x += 2) ctx.fillRect(x, y, 1, 1);
  }
  // border band (forest edge)
  ctx.fillStyle = opts.snow ? 'rgba(180,200,210,0.35)' : 'rgba(40,90,20,0.28)';
  const b = opts.border;
  ctx.fillRect(0, 0, GRID, b);
  ctx.fillRect(0, GRID - b, GRID, b);
  ctx.fillRect(0, b, b, GRID - 2 * b);
  ctx.fillRect(GRID - b, b, b, GRID - 2 * b);
  if (opts.tint) {
    ctx.fillStyle = opts.tint;
    ctx.fillRect(0, 0, GRID, GRID);
  }
  if (opts.grid) {
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 0.04;
    ctx.beginPath();
    for (let i = b; i <= GRID - b; i++) {
      ctx.moveTo(i, b);
      ctx.lineTo(i, GRID - b);
      ctx.moveTo(b, i);
      ctx.lineTo(GRID - b, i);
    }
    ctx.stroke();
  }
  ctx.restore();
  // map outline
  const corners = [toWorld(0, 0), toWorld(GRID, 0), toWorld(GRID, GRID), toWorld(0, GRID)];
  ctx.strokeStyle = 'rgba(30,60,15,0.6)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  corners.forEach((c, i) => (i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y)));
  ctx.closePath();
  ctx.stroke();
  // grass tufts & flowers (deterministic)
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const h = hash2(x, y);
      if (h < 0.12) {
        const w = toWorld(x + 0.3 + h * 3, y + 0.5);
        ctx.strokeStyle = opts.snow ? '#c9d6dd' : C.grassDark;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(w.x - 3, w.y);
        ctx.lineTo(w.x - 4, w.y - 5);
        ctx.moveTo(w.x, w.y);
        ctx.lineTo(w.x, w.y - 6);
        ctx.moveTo(w.x + 3, w.y);
        ctx.lineTo(w.x + 4, w.y - 5);
        ctx.stroke();
      } else if (h > 0.985 && !opts.snow) {
        const w = toWorld(x + 0.5, y + 0.5);
        ctx.fillStyle = h > 0.993 ? '#fff' : C.gold;
        ctx.beginPath();
        ctx.arc(w.x, w.y - 1, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

// ---------- Trees ----------
const treeCache: Sprite[] = [];
function treeSprite(v: number, snow: boolean): Sprite {
  const key = v + (snow ? 3 : 0);
  if (treeCache[key]) return treeCache[key];
  const S = 2;
  const w = 80;
  const h = 110;
  const c = document.createElement('canvas');
  c.width = w * S;
  c.height = h * S;
  const ctx = c.getContext('2d')!;
  ctx.scale(S, S);
  ctx.translate(w / 2, h - 12);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(4, 0, 20, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.woodDark;
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 2;
  ctx.fillRect(-4, -18, 8, 18);
  ctx.strokeRect(-4, -18, 8, 18);
  if (v === 0) {
    // cedar / evergreen (fitting!)
    const greens = snow ? ['#e8f2f6', '#cfe0e8', '#bcd2dc'] : ['#2f7a3a', '#3b9147', '#4aa857'];
    for (let i = 0; i < 3; i++) {
      const yy = -14 - i * 18;
      const ww = 22 - i * 5;
      ctx.beginPath();
      ctx.moveTo(-ww, yy);
      ctx.lineTo(0, yy - 30);
      ctx.lineTo(ww, yy);
      ctx.closePath();
      ctx.fillStyle = greens[i];
      ctx.fill();
      ctx.stroke();
    }
  } else {
    const g = snow ? '#d9e6ec' : v === 1 ? '#4caf50' : '#6cc04a';
    for (const [x, y, r] of [
      [-10, -30, 14],
      [10, -32, 14],
      [0, -46, 16],
    ] as [number, number, number][]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.arc(-4, -52, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  const s = { canvas: c, ax: (w / 2) * S, ay: (h - 12) * S, scale: S };
  treeCache[key] = s;
  return s;
}

export interface TreeSpot {
  x: number;
  y: number;
  v: number;
}

export function borderTrees(border: number): TreeSpot[] {
  const out: TreeSpot[] = [];
  for (let y = -3; y < GRID + 3; y++) {
    for (let x = -3; x < GRID + 3; x++) {
      const inside = x >= border && y >= border && x < GRID - border && y < GRID - border;
      if (inside) continue;
      const onMap = x >= 0 && y >= 0 && x < GRID && y < GRID;
      const h = hash2(x + 100, y + 57);
      if (h < (onMap ? 0.28 : 0.55)) out.push({ x: x + 0.5, y: y + 0.5, v: Math.floor(hash2(x, y + 9) * 3) });
    }
  }
  return out;
}

export function drawTree(ctx: Ctx, t: TreeSpot, snow = false): void {
  const sp = treeSprite(t.v, snow);
  const w = toWorld(t.x, t.y);
  ctx.drawImage(sp.canvas, w.x - sp.ax / sp.scale, w.y - sp.ay / sp.scale, sp.canvas.width / sp.scale, sp.canvas.height / sp.scale);
}

// ---------- Landscape beyond campus ----------
// World-anchored tiles are cached, so panning never reshuffles scenery or redraws
// thousands of trees every frame. Nothing here enters game state or pathfinding.
const LAND_TILE = 512;
const LAND_SCALE = 0.8;
const landscapeCache = new Map<string, HTMLCanvasElement>();
let landscapeView: { key: string; canvas: HTMLCanvasElement; x: number; y: number } | undefined;
type LandscapePoint = { x: number; y: number };

function campusMargin(x: number, y: number): number {
  const gx = x / 64 + y / 32, gy = y / 32 - x / 64;
  return Math.max(-gx, -gy, gx - GRID, gy - GRID);
}

const landscapeRivers: { points: LandscapePoint[]; width: number }[] = (() => {
  const center = GRID / 2;
  const ringPoint = (a: number, extra = 0): LandscapePoint => {
    const r = GRID * 0.98 + 3.5 * Math.sin(a * 3 + 0.4) + 2 * Math.cos(a * 7) + extra;
    return toWorld(center + Math.cos(a) * r, center + Math.sin(a) * r);
  };
  // An open river bends past the campus and continues into the landscape at
  // both ends, rather than enclosing the campus in an artificial moat.
  const points = [
    ...Array.from({ length: 81 }, (_, i) => ringPoint(2.6 + Math.sin(i / 19) * 0.07, (80 - i) * 2)),
    ...Array.from({ length: 241 }, (_, i) => ringPoint(2.6 + i / 240 * 4.7)),
    ...Array.from({ length: 81 }, (_, i) => ringPoint(7.3 + Math.sin(i / 19) * 0.07, i * 2)),
  ];
  const rivers = [{ points, width: 76 }];
  for (const a of [0.4, 4.8]) {
    const branch = Array.from({ length: 101 }, (_, i) => ringPoint(a + Math.sin(i / 13) * Math.min(0.13, i / 160), i * 1.1));
    rivers.push({ points: branch, width: 23 });
  }
  return rivers;
})();

// Index nearby river segments once; generating a forest tile should not scan
// the entire river system for each tree or rock candidate.
const riverSegments = (() => {
  type Segment = { x: number; y: number; dx: number; dy: number; length2: number; half: number };
  const cells = new Map<string, Segment[]>();
  for (const river of landscapeRivers) for (let i = 1; i < river.points.length; i++) {
    const a = river.points[i - 1], b = river.points[i], dx = b.x - a.x, dy = b.y - a.y;
    const s = { x: a.x, y: a.y, dx, dy, length2: dx * dx + dy * dy || 1, half: river.width / 2 };
    const pad = 220 + s.half;
    for (let y = Math.floor((Math.min(a.y, b.y) - pad) / LAND_TILE); y <= (Math.max(a.y, b.y) + pad) / LAND_TILE; y++) {
      for (let x = Math.floor((Math.min(a.x, b.x) - pad) / LAND_TILE); x <= (Math.max(a.x, b.x) + pad) / LAND_TILE; x++) {
        const key = `${x},${y}`, list = cells.get(key) ?? [];
        list.push(s); cells.set(key, list);
      }
    }
  }
  return cells;
})();

function riverDistance(x: number, y: number): number {
  let nearest = 220;
  for (const s of riverSegments.get(`${Math.floor(x / LAND_TILE)},${Math.floor(y / LAND_TILE)}`) ?? []) {
    const t = Math.max(0, Math.min(1, ((x - s.x) * s.dx + (y - s.y) * s.dy) / s.length2));
    nearest = Math.min(nearest, Math.hypot(x - s.x - t * s.dx, y - s.y - t * s.dy) - s.half);
  }
  return nearest;
}

function drawLandscapeTile(ctx: Ctx, left: number, top: number, snow: boolean): void {
  ctx.fillStyle = snow ? '#dfe9ef' : '#4c9635';
  ctx.fillRect(left, top, LAND_TILE, LAND_TILE);
  // Broad, softly varying ground facets avoid a second checkerboard outside campus.
  for (let j = Math.floor(top / 120) - 1; j <= (top + LAND_TILE) / 120 + 1; j++) {
    for (let i = Math.floor(left / 200) - 1; i <= (left + LAND_TILE) / 200 + 1; i++) {
      const x = i * 200 + (j % 2) * 100, y = j * 120;
      const h = hash2(i + 83, j - 71);
      poly(ctx, [[x - 100, y], [x, y - 60], [x + 100, y], [x, y + 60]], snow ? (h < 0.5 ? '#e4edf2' : '#d9e6eb') : (h < 0.5 ? '#4e9836' : '#4b9534'), false);
    }
  }
  // Low faceted knolls: scenery stays isometric, with no painted sky or horizon.
  for (let j = Math.floor(top / 310) - 2; j <= (top + LAND_TILE) / 310 + 2; j++) {
    for (let i = Math.floor(left / 400) - 2; i <= (left + LAND_TILE) / 400 + 2; i++) {
      const h = hash2(i - 16, j + 270);
      const x = i * 400 + h * 190, y = j * 310 + hash2(i + 74, j) * 130;
      if (h > 0.68 || campusMargin(x, y) < 5 || riverDistance(x, y) < 130) continue;
      const w = 155 + h * 150, height = 30 + h * 65;
      poly(ctx, [[x - w, y], [x - 10, y - height - 55], [x + w, y - 15], [x + 30, y + 55]], snow ? '#d0e0e8' : '#62aa3b', false);
      poly(ctx, [[x - w, y], [x - 10, y - height - 55], [x + 30, y + 55]], snow ? '#eaf3f7' : '#79bc44', false);
    }
  }
  // Lay every bank first, then every water surface, so tributary mouths merge.
  for (let layer = 0; layer < 2; layer++) for (const river of landscapeRivers) {
    ctx.beginPath();
    river.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.lineJoin = ctx.lineCap = 'round';
    const strokes: [number, string][] = layer === 0
      ? [[river.width + 13, '#294a36'], [river.width + 9, snow ? '#c4d9df' : '#cdb46d']]
      : [[river.width, snow ? '#98c9e0' : '#2996ce'], [Math.max(4, river.width - 13), snow ? '#b7dfef' : '#40ade0']];
    for (const [width, color] of strokes) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    }
    // Small current marks are static, so even low-power devices get the full scene.
    if (layer === 0) continue;
    ctx.strokeStyle = snow ? '#e5f7ff' : '#91d5ef';
    ctx.lineWidth = 1.5;
    for (let i = 2; i < river.points.length; i += 4) {
      const p = river.points[i], q = river.points[i - 1];
      if (p.x < left - 30 || p.x > left + LAND_TILE + 30 || p.y < top - 30 || p.y > top + LAND_TILE + 30) continue;
      ctx.beginPath(); ctx.moveTo(p.x - 7, p.y + 2); ctx.quadraticCurveTo(p.x, p.y + 5, p.x + (p.x - q.x) * 0.3 + 7, p.y + (p.y - q.y) * 0.3); ctx.stroke();
    }
  }
  // Interleave trees and rocks in screen-depth order. Overscan ensures sprites
  // straddling cache boundaries are rendered identically on both tiles.
  for (let j = Math.floor((top - 45) / 55); j <= (top + LAND_TILE + 260) / 55; j++) {
    for (let i = Math.floor((left - 300) / 57); i <= (left + LAND_TILE + 300) / 57; i++) {
      const h = hash2(i + 521, j - 821);
      const x = i * 57 + hash2(i, j + 417) * 55, y = j * 55 + hash2(i - 57, j) * 52;
      const margin = campusMargin(x, y);
      if (margin < 1.8) continue;
      const bank = riverDistance(x, y);
      const grove = (Math.sin(x / 190 + Math.cos(y / 270)) + Math.cos(y / 150 - x / 360)) / 2;
      if (bank > 30 && h < 0.52 + grove * 0.32) {
        const gx = x / 64 + y / 32, gy = y / 32 - x / 64;
        drawTree(ctx, { x: gx, y: gy, v: Math.floor(hash2(i - 81, j + 19) * 3) }, snow);
      } else if (h > 0.9 && bank > 9) {
        const mountain = h > 0.995 && margin > 24 && bank > 200;
        const size = mountain ? 100 + hash2(i + 1, j) * 85 : 13 + hash2(i + 1, j) * 19;
        const height = mountain ? size * 1.15 : size * 0.65;
        const pts: [number, number][] = [[x - size, y - 5], [x - size * 0.45, y - height * 0.78], [x + size * 0.05, y - height], [x + size * 0.57, y - height * 0.66], [x + size, y - 4], [x + size * 0.25, y + size * 0.27]];
        poly(ctx, pts, snow ? '#c0d0dc' : '#87979d', true, mountain ? 2 : 1.5);
        poly(ctx, [pts[0], pts[1], pts[2], pts[5]], snow ? '#e1eaf0' : '#b1bec0', false);
        poly(ctx, [pts[2], pts[3], pts[4], pts[5], [x + size * 0.23, y - height * 0.55]], snow ? '#9eb4c4' : '#637583', false);
        if (mountain) poly(ctx, [pts[2], [x + size * 0.24, y - height * 0.8], [x + size * 0.08, y - height * 0.84], [x - size * 0.16, y - height * 0.72]], snow ? '#fff' : '#d7e1df', false);
      } else if (h > 0.72 && h < 0.8 && bank > 14 && !snow) {
        ctx.fillStyle = h > 0.76 ? '#f5db61' : '#e5efbf';
        for (let f = 0; f < 3; f++) { ctx.beginPath(); ctx.ellipse(x + f * 5 - 5, y - (f % 2) * 3, 2, 1.4, 0, 0, Math.PI * 2); ctx.fill(); }
      }
    }
  }
}

function drawSurroundings(ctx: Ctx, snow: boolean): void {
  const m = ctx.getTransform();
  const x0 = Math.floor((-m.e / m.a) / LAND_TILE), y0 = Math.floor((-m.f / m.d) / LAND_TILE);
  const x1 = Math.floor(((ctx.canvas.width - m.e) / m.a) / LAND_TILE), y1 = Math.floor(((ctx.canvas.height - m.f) / m.d) / LAND_TILE);
  const viewKey = `${x0},${y0},${x1},${y1},${snow ? 1 : 0}`;
  if (landscapeView?.key === viewKey) {
    ctx.drawImage(landscapeView.canvas, landscapeView.x, landscapeView.y, (x1 - x0 + 1) * LAND_TILE, (y1 - y0 + 1) * LAND_TILE);
    return;
  }
  const view = document.createElement('canvas');
  view.width = Math.ceil((x1 - x0 + 1) * LAND_TILE * LAND_SCALE);
  view.height = Math.ceil((y1 - y0 + 1) * LAND_TILE * LAND_SCALE);
  const g = view.getContext('2d')!;
  g.scale(view.width / ((x1 - x0 + 1) * LAND_TILE), view.height / ((y1 - y0 + 1) * LAND_TILE));
  g.translate(-x0 * LAND_TILE, -y0 * LAND_TILE);
  // Clip all exterior scenery away from the complete campus diamond. The inner
  // playable tiles and existing perimeter forest remain exactly where they were.
  g.beginPath();
  g.rect(x0 * LAND_TILE, y0 * LAND_TILE, (x1 - x0 + 1) * LAND_TILE, (y1 - y0 + 1) * LAND_TILE);
  const corners = [toWorld(0, 0), toWorld(GRID, 0), toWorld(GRID, GRID), toWorld(0, GRID)];
  corners.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y));
  g.closePath(); g.clip('evenodd');
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    // Entirely interior chunks need no exterior render or memory allocation.
    if ([[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]].every(([a, b]) => campusMargin(a * LAND_TILE, b * LAND_TILE) < -1)) continue;
    const key = `${x},${y},${snow ? 1 : 0}`;
    let tile = landscapeCache.get(key);
    if (!tile) {
      tile = document.createElement('canvas'); tile.width = tile.height = Math.ceil(LAND_TILE * LAND_SCALE);
      const g = tile.getContext('2d')!; g.scale(tile.width / LAND_TILE, tile.height / LAND_TILE); g.translate(-x * LAND_TILE, -y * LAND_TILE);
      drawLandscapeTile(g, x * LAND_TILE, y * LAND_TILE, snow);
    } else landscapeCache.delete(key);
    landscapeCache.set(key, tile);
    g.drawImage(tile, x * LAND_TILE, y * LAND_TILE, LAND_TILE, LAND_TILE);
  }
  landscapeView = { key: viewKey, canvas: view, x: x0 * LAND_TILE, y: y0 * LAND_TILE };
  ctx.drawImage(view, x0 * LAND_TILE, y0 * LAND_TILE, (x1 - x0 + 1) * LAND_TILE, (y1 - y0 + 1) * LAND_TILE);
  // Bounded LRU cache, including both seasonal palettes; roughly 52 MiB maximum.
  while (landscapeCache.size > 80) landscapeCache.delete(landscapeCache.keys().next().value!);
}

// ---------- Buildings ----------

export interface BuildingDrawArgs {
  type: BuildingType;
  level: number;
  x: number;
  y: number;
  variant?: number;
  squash?: number; // 0..1 animation phase
  alpha?: number;
  ghost?: 'ok' | 'bad';
  t: number;
  fill?: number; // storage/collector fill 0..1
  upgrading?: number; // progress 0..1 if upgrading
  aim?: number; // aim angle for towers
  charge?: number; // sprayer charge
  multi?: boolean; // stinger statue in multi mode
  praying?: number; // bible prof pray glow 0..1
  firing?: number; // muzzle flash 0..1
  selected?: boolean;
  frozen?: boolean;
  stunned?: boolean;
  hidden?: boolean;
}

export function drawBuildingAt(ctx: Ctx, a: BuildingDrawArgs): void {
  const size = BUILDINGS[a.type].size;
  const c = toWorld(a.x + size / 2, a.y + size / 2);
  if (a.selected) drawSelection(ctx, c.x, c.y, size, a.t);
  if (a.ghost) drawFootprint(ctx, a.x, a.y, size, a.ghost === 'ok' ? 'rgba(80,255,120,0.45)' : 'rgba(255,60,60,0.5)');
  const sp = getBuildingSprite(a.type, a.level, a.variant ?? 0);
  ctx.save();
  ctx.translate(c.x, c.y);
  if (a.alpha !== undefined) ctx.globalAlpha = a.alpha;
  if (a.squash && a.squash > 0) {
    const k = Math.sin(a.squash * Math.PI * 3) * a.squash * 0.18;
    ctx.scale(1 + k, 1 - k);
  }
  ctx.drawImage(sp.canvas, -sp.ax / sp.scale, -sp.ay / sp.scale, sp.canvas.width / sp.scale, sp.canvas.height / sp.scale);
  if (a.level > 0) drawDynamic(ctx, a, size);
  ctx.restore();
  if (a.upgrading !== undefined && a.level > 0) {
    // scaffolding poles overlay
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.strokeStyle = C.woodDark;
    ctx.lineWidth = 2.5;
    const s = size / 2 - 0.15;
    for (const [u, v] of [
      [-s, s],
      [s, s],
      [s, -s],
    ] as [number, number][]) {
      const p0 = P(u, v, 0);
      const p1 = P(u, v, 30 + size * 6);
      ctx.beginPath();
      ctx.moveTo(p0[0], p0[1]);
      ctx.lineTo(p1[0], p1[1]);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (a.upgrading !== undefined) {
    const bp = toWorld(a.x + size, a.y + size * 0.5);
    drawBuilder(ctx, bp.x - 6, bp.y, a.t);
  }
  if (a.frozen) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.globalAlpha = 0.45;
    const s = size / 2;
    poly(ctx, [P(-s, -s, 0), P(s, -s, 0), P(s, s, 0), P(-s, s, 0)], '#bfe9ff', false);
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

function drawDynamic(ctx: Ctx, a: BuildingDrawArgs, size: number): void {
  ctx = buildingThemeContext(ctx, a.type, a.level);
  const L = a.level;
  switch (a.type) {
    case 'admissions':
    case 'coffeecart': {
      // overflowing pile when filling up
      const f = a.fill ?? 0;
      if (f > 0.05) {
        const isT = a.type === 'admissions';
        const n = Math.ceil(f * 6);
        for (let i = 0; i < n; i++) {
          const [x, y] = P(1.05 + (i % 3) * 0.15, -0.6 + Math.floor(i / 3) * 0.35, 4);
          ctx.beginPath();
          ctx.ellipse(x, y - 3, 6, 3.5, 0, 0, Math.PI * 2);
          ctx.fillStyle = isT ? C.gold : C.coffee;
          ctx.fill();
          ctx.strokeStyle = OUT;
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }
      }
      if (a.type === 'coffeecart') {
        // steam
        for (let i = 0; i < 2; i++) {
          const ph = (a.t * 0.7 + i * 0.5) % 1;
          ctx.fillStyle = `rgba(255,255,255,${0.6 * (1 - ph)})`;
          ctx.beginPath();
          const [x, y] = P(0, 0, 50 + ph * 26);
          ctx.arc(x + Math.sin(ph * 6 + i) * 4, y, 3 + ph * 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case 'registrar': {
      const f = a.fill ?? 0;
      const h = 30 + L * 5;
      if (f > 0.02) {
        const k = 0.35 + f * 0.5;
        box(ctx, -0.05 - k, -0.1 - k, -0.05 + k, -0.1 + k, h + 4, h + 6 + f * 10, C.gold, { top: '#ffe066', stroke: true });
      }
      break;
    }
    case 'rinnova': {
      const f = a.fill ?? 0;
      const h = 30 + L * 4;
      const th = h + 22 + L * 3;
      const [x, y] = P(0.85, -0.85, 4);
      const rx = 0.5 * 45;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - rx * 0.35, y - th + 6, rx * 0.7, th - 10);
      ctx.fillStyle = 'rgba(30,20,10,0.5)';
      ctx.fill();
      const fh = (th - 10) * f;
      ctx.fillStyle = '#7a4520';
      ctx.fillRect(x - rx * 0.35, y - 4 - fh, rx * 0.7, fh);
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - rx * 0.35, y - th + 6, rx * 0.7, th - 10);
      ctx.restore();
      break;
    }
    case 'ratower': {
      const h = 42 + L * 5 + 6;
      const covered = L >= 2;
      const [x, y] = P(covered ? 0.25 : 0, covered ? 0.65 : 0, h);
      ctx.save();
      ctx.translate(x, y);
      if (covered) ctx.scale(0.68, 0.68);
      drawMiniPerson(ctx, 0, 0, buildingThemeTier(a.type, L) === 8 ? '#262c35' : C.navy, a.aim ?? 0, a.t, a.firing ?? 0, 'clipboard', a.stunned);
      ctx.restore();
      // The cached tower is behind dynamic actors. Repaint its canopy in front of the RA.
      if (covered) drawRaTowerCanopy(ctx, L);
      break;
    }
    case 'safetycart': {
      const blink = Math.floor(a.t * 4) % 2;
      const [x, y] = P(-0.1, 0, 56);
      ctx.fillStyle = blink ? '#d8efff' : '#4a7dff';
      ctx.beginPath();
      ctx.arc(x - 5, y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = blink ? '#4a7dff' : '#d8efff';
      ctx.beginPath();
      ctx.arc(x + 5, y, 3, 0, Math.PI * 2);
      ctx.fill();
      if (a.firing && a.firing > 0) {
        ctx.fillStyle = `rgba(255,240,180,${a.firing})`;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a.aim ?? 0) * 20, y + 20 + Math.sin(a.aim ?? 0) * 10, 8 * a.firing + 2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'sprayer': {
      const ch = a.charge ?? 0;
      const top = 44 + L * 3;
      const [x, y] = P(0, 0, top);
      // water arcs
      for (let i = 0; i < 6; i++) {
        const ang = a.t * 2 + (i * Math.PI) / 3;
        const ex = x + Math.cos(ang) * 42;
        const ey = y + 40 + Math.sin(ang) * 20;
        ctx.strokeStyle = `rgba(140,210,255,${0.55})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo((x + ex) / 2, y - 22, ex, ey);
        ctx.stroke();
      }
      if (ch > 0) {
        ctx.fillStyle = `rgba(190,240,255,${0.3 + ch * 0.6})`;
        ctx.beginPath();
        ctx.arc(x, y - 4, 5 + ch * 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      break;
    }
    case 'stinger': {
      // chrome glint + charge glow at the stinger tip
      const [x, y] = P(0, 0, STINGER_TIP_Z);
      const ch = a.charge ?? 0;
      const idle = L >= 3 ? 0.25 + 0.15 * Math.sin(a.t * 3) : 0;
      const k = Math.max(ch, idle);
      if (k > 0 && !a.frozen && !a.stunned) {
        const r = 6 + k * 14;
        const g = ctx.createRadialGradient(x, y, 1, x, y, r);
        g.addColorStop(0, `rgba(235,248,255,${0.5 + k * 0.5})`);
        g.addColorStop(0.4, `rgba(90,175,255,${0.35 + k * 0.5})`);
        g.addColorStop(1, 'rgba(70,160,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (a.multi && !a.frozen && !a.stunned) {
        // multi mode: three little sparks circling the tip
        ctx.fillStyle = '#bfe4ff';
        for (let i = 0; i < 3; i++) {
          const an = a.t * 2.4 + (i * Math.PI * 2) / 3;
          ctx.beginPath();
          ctx.arc(x + Math.cos(an) * 11, y + Math.sin(an) * 5, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      const tw = (a.t * 0.7 + (a.x * 7 + a.y * 13) * 0.1) % 3;
      if (tw < 0.35) {
        const s = Math.sin((tw / 0.35) * Math.PI) * 5;
        const [gx, gy] = P(0, 0, STINGER_TIP_Z - 22);
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(gx - 7 - s, gy - 3);
        ctx.lineTo(gx - 7 + s, gy - 3);
        ctx.moveTo(gx - 7, gy - 3 - s);
        ctx.lineTo(gx - 7, gy - 3 + s);
        ctx.stroke();
      }
      break;
    }
    case 'catapult': {
      // throwing arm: cocked back with a tray loaded, flung forward just after a shot
      const [px, py] = P(0, 0, CATAPULT_AXLE_Z);
      const f = a.frozen || a.stunned ? 0 : (a.firing ?? 0);
      const ang = 2.55 - f * 3.9; // radians, screen space: rest points back-left, fired points up
      const len = 46 + L * 2;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const ex = px + ca * len;
      const ey = py + sa * len;
      const bx = px - ca * 16;
      const by = py - sa * 16;
      ctx.lineCap = 'round';
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.strokeStyle = L >= 2 ? '#7a5230' : '#b98652';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.lineCap = 'butt';
      // Rope-wrapped wooden counterweight crate, stocked with dining-hall supplies.
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.2;
      ctx.fillStyle = '#9a8253'; ctx.fillRect(bx-9,by-5,18,17);ctx.strokeRect(bx-9,by-5,18,17);
      ctx.strokeStyle='#4b422f';ctx.lineWidth=0.8;
      for(let k=-6;k<=6;k+=4){ctx.beginPath();ctx.moveTo(bx+k,by-4);ctx.lineTo(bx+k,by+11);ctx.stroke();}
      ctx.strokeRect(bx-10,by-1,20,3);ctx.strokeRect(bx-10,by+7,20,3);
      ctx.fillStyle='#e9dfb8';ctx.fillRect(bx+1,by-13,6,9);ctx.strokeRect(bx+1,by-13,6,9);
      ctx.fillStyle='#6f9250';ctx.fillRect(bx-7,by-9,5,5);ctx.strokeRect(bx-7,by-9,5,5);
      ctx.strokeStyle='#d0bd8a';ctx.lineWidth=1;
      for(const t of [0.15,0.42,0.75]) {
        const rx=bx+(ex-bx)*t,ry=by+(ey-by)*t;
        for(let k=-2;k<=2;k++){ctx.beginPath();ctx.moveTo(rx-sa*3+ca*k*1.5,ry+ca*3+sa*k*1.5);ctx.lineTo(rx+sa*3+ca*k*1.5,ry-ca*3+sa*k*1.5);ctx.stroke();}
      }
      // Broad silver casserole pan; load disappears on the existing firing phase.
      ctx.strokeStyle=OUT;ctx.lineWidth=1.3;ctx.fillStyle='#abb3b9';
      ctx.beginPath();ctx.ellipse(ex,ey+2,13,6,0,0,Math.PI);ctx.lineTo(ex-13,ey-3);ctx.ellipse(ex,ey-3,13,5,0,Math.PI,Math.PI*2);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.fillStyle='#626d77';ctx.beginPath();ctx.ellipse(ex,ey-3,12,4.5,0,0,7);ctx.fill();ctx.stroke();
      for(const dx of [-14,14]){ctx.beginPath();ctx.ellipse(ex+dx,ey-2,3,1.5,0,0,7);ctx.stroke();}
      if (f < 0.3) {
        ctx.fillStyle='#f4b43b';ctx.beginPath();ctx.ellipse(ex,ey-4,10.8,4.4,0,0,7);ctx.fill();
        for(const [dx,dy] of [[-6,-1],[0,-2],[6,0],[-2,1]]){ctx.fillStyle='#de872b';ctx.beginPath();ctx.arc(ex+dx,ey-4+dy,1.8,0,7);ctx.fill();ctx.fillStyle='#628a3c';ctx.fillRect(ex+dx+1,ey-4+dy,1.5,1.5);}
      }

      break;
    }
    case 'bibleprof': {
      const h = 84 + L * 6; // matches the taller visual platform; combat stats are unchanged
      const [x, y] = P(0, 0, h);
      const pr = a.praying ?? 0;
      if (pr > 0) {
        const g = ctx.createRadialGradient(x, y - 20, 2, x, y - 20, 40);
        g.addColorStop(0, `rgba(255,240,170,${0.9 * pr})`);
        g.addColorStop(1, 'rgba(255,240,170,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y - 20, 40, 0, Math.PI * 2);
        ctx.fill();
      }
      drawMiniPerson(ctx, x, y, '#233f61', 0, a.t, 0, 'pray', a.stunned, pr);
      break;
    }
    case 'dmc':
    case 'presidents':
    case 'library':
    case 'reshall':
    case 'biblical':
    case 'health':
    case 'ens':
    case 'callan': {
      break;
    }
    case 'hive': {
      // tiny bees around
      for (let i = 0; i < 3; i++) {
        const ang = a.t * (2 + i) + i * 2;
        const [x, y] = P(0, 0, 50);
        ctx.fillStyle = C.gold;
        ctx.beginPath();
        ctx.arc(x + Math.cos(ang) * 30, y + Math.sin(ang * 1.3) * 12, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'ssc': {
      const ph = (a.t * 1.3) % 1;
      const [x, y] = P(0, 0, 28 + L * 6 + 34);
      ctx.fillStyle = `rgba(255,140,200,${1 - ph})`;
      ctx.beginPath();
      ctx.arc(x + Math.sin(ph * 9) * 3, y - ph * 20, 2 + ph * 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
}

function drawMiniPerson(
  ctx: Ctx,
  x: number,
  y: number,
  color: string,
  aim: number,
  t: number,
  firing: number,
  pose: 'clipboard' | 'pray',
  stunned?: boolean,
  pray = 0,
): void {
  const face = Math.cos(aim) >= 0 ? 1 : -1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(face, 1);
  ctx.fillStyle = color;
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 1.8;
  roundRect(ctx, -6, -18, 12, 14, 4);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -23, 6, 0, Math.PI * 2);
  ctx.fillStyle = C.skin;
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = OUT;
  ctx.fillRect(1, -24, 1.6, 2.2);
  ctx.fillRect(4, -24, 1.6, 2.2);
  if (pose === 'clipboard') {
    ctx.fillStyle = '#c9a26a';
    ctx.fillRect(4, -16 - firing * 4, 8, 10);
    ctx.strokeRect(4, -16 - firing * 4, 8, 10);
    ctx.fillStyle = '#fff';
    ctx.fillRect(5, -14 - firing * 4, 6, 7);
    // RA lanyard color
    ctx.fillStyle = C.gold;
    ctx.fillRect(-1, -17, 2, 6);
  } else {
    // hands raised in prayer, halo when praying
    ctx.fillStyle = color;
    const raise = pray > 0 ? 6 : 0;
    ctx.fillRect(-9, -18 - raise, 3, 9);
    ctx.fillRect(6, -18 - raise, 3, 9);
    ctx.fillStyle = '#d8d8d8';
    ctx.beginPath();
    ctx.arc(0, -26, 6, Math.PI, Math.PI * 1.7);
    ctx.fill();
    if (pray > 0.1) {
      ctx.strokeStyle = `rgba(255,220,90,${pray})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(0, -33, 7, 2.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  if (stunned) {
    ctx.fillStyle = C.gold;
    ctx.font = '9px sans-serif';
    ctx.fillText('?', -3 + Math.sin(t * 6) * 4, -34);
  }
  ctx.restore();
}

export function drawFootprint(ctx: Ctx, x: number, y: number, size: number, color: string): void {
  const a = toWorld(x, y);
  const b = toWorld(x + size, y);
  const c = toWorld(x + size, y + size);
  const d = toWorld(x, y + size);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawSelection(ctx: Ctx, cx: number, cy: number, size: number, t: number): void {
  const s = size / 2 + 0.15 + Math.sin(t * 5) * 0.04;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 6]);
  ctx.lineDashOffset = -t * 30;
  const pts = [P(-s, -s), P(s, -s), P(s, s), P(-s, s)];
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

export function drawBar(ctx: Ctx, x: number, y: number, w: number, frac: number, color: string, bg = 'rgba(0,0,0,0.55)'): void {
  const h = 6;
  roundRect(ctx, x - w / 2 - 1, y - 1, w + 2, h + 2, 3);
  ctx.fillStyle = OUT;
  ctx.fill();
  ctx.fillStyle = bg;
  ctx.fillRect(x - w / 2, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, frac)), h);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, frac)), 2);
}

// ---------- Name plates ----------
const PLATES_KEY = 'cedarville-clash-nameplates';
let platesOn: boolean | undefined;

/** Display preference for this device: floating name plates over hovered and selected buildings. */
export function namePlatesOn(): boolean {
  if (platesOn === undefined) {
    try {
      platesOn = localStorage.getItem(PLATES_KEY) !== 'off';
    } catch {
      platesOn = true;
    }
  }
  return platesOn;
}

export function setNamePlates(on: boolean): void {
  platesOn = on;
  try {
    localStorage.setItem(PLATES_KEY, on ? 'on' : 'off');
  } catch {
    // private window: the choice lasts for this visit only
  }
}

/** "Rinnova · Lv 3". No level for single-level buildings; "Building" while first being built. */
export function plateText(type: BuildingType, level: number, name?: string): string {
  const d = BUILDINGS[type];
  const n = name ?? d.name;
  if (level < 1) return `${n} · Building`;
  return d.levels.length > 1 ? `${n} · Lv ${level}` : n;
}

const spriteTops = new WeakMap<HTMLCanvasElement, number>();
/** How far the drawn building rises above its anchor, in world pixels (first non-empty sprite row). */
function spriteTop(sp: { canvas: HTMLCanvasElement; ay: number; scale: number }): number {
  let top = spriteTops.get(sp.canvas);
  if (top === undefined) {
    const { width, height } = sp.canvas;
    let row = 0;
    try {
      const data = sp.canvas.getContext('2d')!.getImageData(0, 0, width, height).data;
      scan: for (; row < height; row++) for (let x = 0; x < width; x += 2) if (data[(row * width + x) * 4 + 3] > 40) break scan;
    } catch {
      row = 0;
    }
    top = (sp.ay - row) / sp.scale;
    spriteTops.set(sp.canvas, top);
  }
  return top;
}

/** A navy plate floating above a building. Same size on screen at any zoom; kept below `minY` (world). */
export function drawNamePlate(ctx: Ctx, b: { type: BuildingType; level: number; x: number; y: number }, text: string, zoom: number, minY: number): void {
  const size = BUILDINGS[b.type].size;
  const c = toWorld(b.x + size / 2, b.y + size / 2);
  const top = spriteTop(getBuildingSprite(b.type, b.level, 0));
  ctx.save();
  ctx.translate(c.x, Math.max(minY, c.y - top - 16 / zoom));
  ctx.scale(1 / zoom, 1 / zoom);
  ctx.font = '900 13px "Trebuchet MS", system-ui, sans-serif';
  const w = ctx.measureText(text).width + 18;
  const h = 24;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, 6);
  ctx.fillStyle = '#1f2f5c';
  ctx.fill();
  ctx.lineWidth = 4.5;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = '#f4ead2';
  ctx.stroke();
  ctx.fillStyle = '#fbf7ea';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 1);
  ctx.restore();
}

export function drawLabel(ctx: Ctx, x: number, y: number, text: string, color = '#fff', size = 12): void {
  ctx.font = `900 ${size}px "Trebuchet MS", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = OUT;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

export function drawConstructionFence(ctx: Ctx, x: number, y: number, t: number): void {
  const c = toWorld(x + 1, y + 1);
  ctx.save();
  ctx.translate(c.x, c.y);
  poly(ctx, [P(-1, -1, 0), P(1, -1, 0), P(1, 1, 0), P(-1, 1, 0)], '#b89466', false);
  // dirt pile
  ctx.fillStyle = '#8a6a44';
  ctx.beginPath();
  ctx.ellipse(0, 0, 18, 9, 0, Math.PI, 0);
  ctx.fill();
  // fence posts around
  const edges: [number, number, number, number][] = [
    [-0.95, -0.95, 0.95, -0.95],
    [0.95, -0.95, 0.95, 0.95],
    [-0.95, 0.95, 0.95, 0.95],
    [-0.95, -0.95, -0.95, 0.95],
  ];
  for (const [u0, v0, u1, v1] of edges) {
    poly(ctx, [P(u0, v0, 4), P(u1, v1, 4), P(u1, v1, 16), P(u0, v0, 16)], 'rgba(255,128,20,0.85)', true, 1.5);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    for (let k = 1; k < 4; k++) {
      const p = P(u0 + ((u1 - u0) * k) / 4, v0 + ((v1 - v0) * k) / 4, 4);
      const q = P(u0 + ((u1 - u0) * k) / 4, v0 + ((v1 - v0) * k) / 4, 16);
      ctx.beginPath();
      ctx.moveTo(p[0], p[1]);
      ctx.lineTo(q[0], q[1]);
      ctx.stroke();
    }
  }
  // blinking light
  if (Math.floor(t * 2) % 2) {
    const [lx, ly] = P(0.95, 0.95, 20);
    ctx.fillStyle = '#ffb300';
    ctx.beginPath();
    ctx.arc(lx, ly, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export { shade };
