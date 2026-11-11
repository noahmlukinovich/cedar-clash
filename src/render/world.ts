import { BUILDINGS } from '../config/buildings';
import { GRID } from '../config/balance';
import type { BuildingType } from '../config/types';
import { hash2 } from '../core/rng';
import { toWorld } from '../core/iso';
import { getBuildingSprite, type Sprite } from './buildingSprites';
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
      const [x, y] = P(0.1, -0.9, 4);
      const rx = 0.62 * 45;
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
      const [x, y] = P(0, 0, h);
      drawMiniPerson(ctx, x, y, C.navy, a.aim ?? 0, a.t, a.firing ?? 0, 'clipboard', a.stunned);
      break;
    }
    case 'safetycart': {
      const blink = Math.floor(a.t * 4) % 2;
      const [x, y] = P(-0.1, 0, 56);
      ctx.fillStyle = blink ? '#ff3b3b' : '#4a7dff';
      ctx.beginPath();
      ctx.arc(x - 5, y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = blink ? '#4a7dff' : '#ff3b3b';
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
    case 'bibleprof': {
      const h = 48 + L * 6;
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
      drawMiniPerson(ctx, x, y, '#4a2f6b', 0, a.t, 0, 'pray', a.stunned, pr);
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
