// Procedural building art, cached per (type, level, variant) into offscreen canvases.
import { BUILDINGS } from '../config/buildings';
import type { BuildingType } from '../config/types';
import {
  C,
  OUT,
  P,
  box,
  cross,
  cylinder,
  dome,
  door,
  flag,
  gable,
  groundShadow,
  pad,
  poly,
  pyramid,
  shade,
  sign,
  star5,
  windowsL,
  windowsR,
} from './draw';

type Ctx = CanvasRenderingContext2D;

export interface Sprite {
  canvas: HTMLCanvasElement;
  ax: number; // anchor in canvas px (scaled)
  ay: number;
  scale: number;
}

const SCALE = 2;
const cache = new Map<string, Sprite>();

export function getBuildingSprite(type: BuildingType, level: number, variant = 0): Sprite {
  const key = `${type}:${level}:${variant}`;
  let s = cache.get(key);
  if (s) return s;
  const size = BUILDINGS[type].size;
  const w = size * 64 + 48;
  // headroom above the footprint, by footprint size (the DMC steeple is the tallest thing on campus)
  const top = type === 'dmc' ? 240 : size === 1 ? 46 : size === 2 ? 80 : size === 3 ? 150 : 140;
  const h = size * 32 + top + 12;
  const canvas = document.createElement('canvas');
  canvas.width = w * SCALE;
  canvas.height = h * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);
  const ax = w / 2;
  const ay = top + size * 16;
  ctx.translate(ax, ay);
  drawBuilding(ctx, type, level, variant);
  s = { canvas, ax: ax * SCALE, ay: ay * SCALE, scale: SCALE };
  cache.set(key, s);
  return s;
}

// ---------- The level ladder ----------
// Every building tells its level the same way, so it reads at a glance on campus, in raids
// and when visiting:
//   1 temporary    wood siding on a dirt lot
//   2 established  brick, concrete pad, a chimney, a shrub
//   3 renovated    stone foundation, white cornice, awning, flowerbeds
//   4 donor-funded gold cornice, rooftop cupola, lamp post, flag
//   5+ flagship    gold finial, navy-and-gold banners, pale stone lot
const WOOD = '#b98652';
/** Cream stone used for parapets, cornices, columns and window frames. */
const CREAM = '#f1e4c6';
/** A lighter cream for columns and top-level parapets (a hex literal: box() shades hex colours only). */
const CREAM_LIGHT = '#f8f0dc';
const SLATE = '#4f5262';
const LIT = '#ffd870';

function line(ctx: Ctx, a: [number, number], b: [number, number]): void {
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
}

/** The lot a building stands on. `color` is kept for buildings with their own paving. */
function site(ctx: Ctx, L: number, size: number, color?: string): void {
  const base = color ?? (L <= 1 ? '#c9b48a' : L >= 5 ? '#e6dfd0' : C.concrete);
  pad(ctx, size, base);
  const s = size / 2 - 0.06;
  if (L >= 2 && !color) {
    // paver tiles
    ctx.strokeStyle = 'rgba(90,70,40,0.13)';
    ctx.lineWidth = 1;
    for (let k = -s + 0.5; k < s - 0.01; k += 0.5) {
      line(ctx, P(k, -s, 4), P(k, s, 4));
      line(ctx, P(-s, k, 4), P(s, k, 4));
    }
  }
  if (L >= 3) {
    // cream border course
    const i = s - 0.12;
    ctx.strokeStyle = color ? 'rgba(0,0,0,0.16)' : shade(CREAM, -0.12);
    ctx.lineWidth = color ? 1.2 : 2;
    ctx.beginPath();
    const pts = [P(-i, -i, 4), P(i, -i, 4), P(i, i, 4), P(-i, i, 4)];
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const q of pts) ctx.lineTo(q[0], q[1]);
    ctx.closePath();
    ctx.stroke();
  }
  if (L >= 5) {
    // gold edging along the two front edges
    ctx.strokeStyle = C.gold;
    ctx.lineWidth = 2;
    line(ctx, P(-s, s, 4), P(s, s, 4));
    line(ctx, P(s, s, 4), P(s, -s, 4));
  }
  // Trees at the back corners go in with the lot, so the building is drawn in front of them.
  const half = size / 2;
  const k = size >= 4 ? 1 : 0.85;
  if (L >= 3) tree(ctx, -half + 0.3, -half + 0.3, k);
  if (L >= 5) tree(ctx, half - 0.3, -half + 0.3, k);
}

/** Main walls in the level's material: wood planks at Lv1, coursed masonry after, stone base from Lv3. */
function walls(ctx: Ctx, L: number, u0: number, v0: number, u1: number, v1: number, z0: number, h: number, base: string): void {
  box(ctx, u0, v0, u1, v1, z0, h, L <= 1 ? WOOD : base);
  ctx.strokeStyle = L <= 1 ? 'rgba(60,35,10,0.3)' : 'rgba(0,0,0,0.14)';
  ctx.lineWidth = 1;
  if (L <= 1) {
    const nu = Math.max(2, Math.round((u1 - u0) / 0.22));
    for (let i = 1; i < nu; i++) {
      const u = u0 + ((u1 - u0) * i) / nu;
      line(ctx, P(u, v1, z0), P(u, v1, h));
    }
    const nv = Math.max(2, Math.round((v1 - v0) / 0.22));
    for (let i = 1; i < nv; i++) {
      const v = v0 + ((v1 - v0) * i) / nv;
      line(ctx, P(u1, v, z0), P(u1, v, h));
    }
  } else {
    for (let z = z0 + 7; z < h - 3; z += 7) {
      line(ctx, P(u0, v1, z), P(u1, v1, z));
      line(ctx, P(u1, v1, z), P(u1, v0, z));
    }
  }
  if (L >= 3) {
    poly(ctx, [P(u0, v1, z0), P(u1, v1, z0), P(u1, v1, z0 + 6), P(u0, v1, z0 + 6)], C.stone, true, 1.4);
    poly(ctx, [P(u1, v1, z0), P(u1, v0, z0), P(u1, v0, z0 + 6), P(u1, v1, z0 + 6)], C.stoneDark, true, 1.4);
    // cream pilasters on the three corners you can see
    const w = Math.min(0.09, (u1 - u0) * 0.08);
    poly(ctx, [P(u0, v1, z0 + 6), P(u0 + w, v1, z0 + 6), P(u0 + w, v1, h), P(u0, v1, h)], CREAM, true, 1.2);
    poly(ctx, [P(u1 - w, v1, z0 + 6), P(u1, v1, z0 + 6), P(u1, v1, h), P(u1 - w, v1, h)], CREAM, true, 1.2);
    poly(ctx, [P(u1, v1, z0 + 6), P(u1, v1 - w, z0 + 6), P(u1, v1 - w, h), P(u1, v1, h)], shade(CREAM, -0.18), true, 1.2);
    poly(ctx, [P(u1, v0 + w, z0 + 6), P(u1, v0, z0 + 6), P(u1, v0, h), P(u1, v0 + w, h)], shade(CREAM, -0.18), true, 1.2);
  }
}

/**
 * Flat roof with a cream parapet and, from Lv2, a rooftop unit: the look of a finished campus
 * building. At Lv1 it is a plain tar-paper lid.
 */
function flatRoof(ctx: Ctx, L: number, u0: number, v0: number, u1: number, v1: number, h: number, unit = true): void {
  if (L <= 1) {
    box(ctx, u0 - 0.04, v0 - 0.04, u1 + 0.04, v1 + 0.04, h, h + 3, '#6b5a48');
    return;
  }
  const o = 0.05;
  box(ctx, u0 - o, v0 - o, u1 + o, v1 + o, h, h + 5, L >= 4 ? CREAM_LIGHT : CREAM);
  const i = 0.1;
  poly(ctx, [P(u0 + i, v0 + i, h + 5), P(u1 - i, v0 + i, h + 5), P(u1 - i, v1 - i, h + 5), P(u0 + i, v1 - i, h + 5)], SLATE, true, 1.4);
  if (unit) {
    const cu = (u0 + u1) / 2 + (u1 - u0) * 0.12;
    const cv = (v0 + v1) / 2 - (v1 - v0) * 0.12;
    box(ctx, cu - 0.16, cv - 0.16, cu + 0.16, cv + 0.16, h + 5, h + 12, '#c9cdd3');
  }
  if (L >= 4) {
    // gold coping line on the two front edges
    ctx.strokeStyle = C.gold;
    ctx.lineWidth = 1.6;
    line(ctx, P(u0 - o, v1 + o, h + 5), P(u1 + o, v1 + o, h + 5));
    line(ctx, P(u1 + o, v1 + o, h + 5), P(u1 + o, v0 - o, h + 5));
  }
}

/** Framed windows with mullions on the left face ('L', along u) or right face ('R', along v). Some are lit. */
function panes(ctx: Ctx, face: 'L' | 'R', a0: number, a1: number, fixed: number, z0: number, z1: number, cols: number, rows: number, lit = 3): void {
  const d = (a1 - a0) / cols;
  const dz = (z1 - z0) / rows;
  const pt = (a: number, z: number): [number, number] => (face === 'L' ? P(a, fixed, z) : P(fixed, a, z));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p0 = a0 + d * c + d * 0.2;
      const p1 = a0 + d * (c + 1) - d * 0.2;
      const q0 = z0 + dz * r + dz * 0.2;
      const q1 = z0 + dz * (r + 1) - dz * 0.14;
      const e = d * 0.07;
      poly(ctx, [pt(p0 - e, q0 - 1.5), pt(p1 + e, q0 - 1.5), pt(p1 + e, q1 + 1.2), pt(p0 - e, q1 + 1.2)], face === 'L' ? CREAM : shade(CREAM, -0.18), true, 1.3);
      const on = lit > 0 && (c * 5 + r * 3 + cols) % lit === 0;
      const glass = on ? LIT : C.glass;
      poly(ctx, [pt(p0, q0), pt(p1, q0), pt(p1, q1), pt(p0, q1)], face === 'L' ? glass : shade(glass, -0.22), false);
      ctx.strokeStyle = 'rgba(30,27,43,0.55)';
      ctx.lineWidth = 1;
      line(ctx, pt((p0 + p1) / 2, q0), pt((p0 + p1) / 2, q1));
      line(ctx, pt(p0, (q0 + q1) / 2), pt(p1, (q0 + q1) / 2));
    }
  }
}

/** A glass curtain wall: one sheet of glazing with a grid of frames and a few lit bays. */
function glassWall(ctx: Ctx, face: 'L' | 'R', a0: number, a1: number, fixed: number, z0: number, z1: number, cols: number, rows: number): void {
  const pt = (a: number, z: number): [number, number] => (face === 'L' ? P(a, fixed, z) : P(fixed, a, z));
  const glass = face === 'L' ? '#7cc4ea' : shade('#7cc4ea', -0.25);
  poly(ctx, [pt(a0, z0), pt(a1, z0), pt(a1, z1), pt(a0, z1)], glass, true, 1.6);
  const d = (a1 - a0) / cols;
  const dz = (z1 - z0) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if ((c * 3 + r * 2) % 5 !== 0) continue;
      poly(ctx, [pt(a0 + d * c, z0 + dz * r), pt(a0 + d * (c + 1), z0 + dz * r), pt(a0 + d * (c + 1), z0 + dz * (r + 1)), pt(a0 + d * c, z0 + dz * (r + 1))], face === 'L' ? LIT : shade(LIT, -0.2), false);
    }
  }
  ctx.strokeStyle = 'rgba(30,27,43,0.6)';
  ctx.lineWidth = 1.1;
  for (let c = 1; c < cols; c++) line(ctx, pt(a0 + d * c, z0), pt(a0 + d * c, z1));
  for (let r = 1; r < rows; r++) line(ctx, pt(a0, z0 + dz * r), pt(a1, z0 + dz * r));
}

/** Navy wall plaque with cream lettering and a cream edge. `light` flips it to cream with dark letters. */
function plaque(ctx: Ctx, x: number, y: number, text: string, size = 8, light = false): void {
  ctx.font = `900 ${size}px "Trebuchet MS", system-ui, sans-serif`;
  const w = ctx.measureText(text).width + 10;
  const h = size + 7;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, 3);
  ctx.fillStyle = light ? CREAM : C.navy;
  ctx.fill();
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = light ? shade(CREAM, -0.25) : CREAM;
  ctx.stroke();
  ctx.fillStyle = light ? OUT : CREAM;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5);
  ctx.textBaseline = 'alphabetic';
}

/** A row of cream columns along the left face, standing on a step, carrying a beam at height `h`. */
function colonnade(ctx: Ctx, u0: number, u1: number, v: number, depth: number, h: number, n: number): void {
  box(ctx, u0 - 0.05, v, u1 + 0.05, v + depth, 4, 7, C.stone);
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? (u0 + u1) / 2 : u0 + ((u1 - u0) * i) / (n - 1);
    box(ctx, u - 0.055, v + depth - 0.15, u + 0.055, v + depth - 0.04, 7, h, CREAM_LIGHT);
  }
  box(ctx, u0 - 0.08, v, u1 + 0.08, v + depth, h, h + 5, CREAM);
}

function tree(ctx: Ctx, u: number, v: number, k = 1): void {
  const [x, y] = P(u, v, 4);
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 3.2;
  line(ctx, [x, y], [x, y - 9 * k]);
  ctx.strokeStyle = C.woodDark;
  ctx.lineWidth = 1.6;
  line(ctx, [x, y], [x, y - 9 * k]);
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 1.6;
  for (const [dx, dy, r, col] of [
    [-5, -13, 7, C.grassDark],
    [5, -13, 7, C.grassDark],
    [0, -19, 8, '#5fae3c'],
  ] as [number, number, number, string][]) {
    ctx.beginPath();
    ctx.arc(x + dx * k, y + dy * k, r * k, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = '#8fd66a';
  ctx.beginPath();
  ctx.arc(x - 2 * k, y - 21 * k, 2.6 * k, 0, Math.PI * 2);
  ctx.fill();
}

/** Lamp post; with `banner` it carries a navy pennant with a gold star. */
function lamp(ctx: Ctx, u: number, v: number, banner: boolean): void {
  const [x, y] = P(u, v, 4);
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 2.4;
  line(ctx, [x, y], [x, y - 26]);
  if (banner) {
    ctx.fillStyle = C.navy;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.rect(x + 1.5, y - 22, 7, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.gold;
    ctx.beginPath();
    ctx.arc(x + 5, y - 16, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(x, y - 29, 7, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,233,168,0.35)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y - 29, 3.6, 0, Math.PI * 2);
  ctx.fillStyle = '#ffe9a8';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = OUT;
  ctx.stroke();
}


/** Cornice under the roofline: white from Lv3, gold from Lv4. */
function trim(ctx: Ctx, level: number, u0: number, v0: number, u1: number, v1: number, z: number): void {
  if (level >= 3) {
    const gold = level >= 4;
    poly(ctx, [P(u0, v1, z - 4), P(u1, v1, z - 4), P(u1, v1, z), P(u0, v1, z)], gold ? C.gold : C.white, true, 1.4);
    poly(ctx, [P(u1, v1, z - 4), P(u1, v0, z - 4), P(u1, v0, z), P(u1, v1, z)], gold ? C.goldDark : shade(C.white, -0.2), true, 1.4);
  }
}

/** Something on the roof that changes the outline: a chimney (Lv2-3), then a cupola (Lv4), with a gold finial (Lv5+). */
function roofTop(ctx: Ctx, L: number, u: number, v: number, z: number): void {
  if (L < 2) return;
  if (L < 4) {
    box(ctx, u - 0.09, v - 0.09, u + 0.09, v + 0.09, z - 8, z + 9, C.brickDark);
    box(ctx, u - 0.11, v - 0.11, u + 0.11, v + 0.11, z + 9, z + 12, C.stone);
    return;
  }
  box(ctx, u - 0.17, v - 0.17, u + 0.17, v + 0.17, z - 8, z + 9, C.white);
  poly(ctx, [P(u - 0.09, v + 0.17, z - 1), P(u + 0.09, v + 0.17, z - 1), P(u + 0.09, v + 0.17, z + 6), P(u - 0.09, v + 0.17, z + 6)], '#ffe9a8', true, 1.2);
  pyramid(ctx, u - 0.21, v - 0.21, u + 0.21, v + 0.21, z + 9, 11, C.roofBlue);
  if (L >= 5) finial(ctx, u, v, z + 20, L);
}

/** Gold ball on a short pole; a star at Lv6. */
function finial(ctx: Ctx, u: number, v: number, z: number, L: number): void {
  const [x, y] = P(u, v, z);
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 1.8;
  line(ctx, [x, y], [x, y - 7]);
  if (L >= 6) star5(ctx, x, y - 11, 5, C.gold);
  else {
    ctx.beginPath();
    ctx.arc(x, y - 9, 3, 0, Math.PI * 2);
    ctx.fillStyle = C.gold;
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
}

/** Front door on the left face: a step from Lv2, an awning from Lv3, banners from Lv5. */
function entry(ctx: Ctx, L: number, u: number, v: number, w: number, h: number, color: string = C.woodDark): void {
  if (L >= 2) box(ctx, u - w / 2 - 0.06, v, u + w / 2 + 0.06, v + 0.13, 4, 6, C.stone);
  door(ctx, u, v, w, h, color);
  if (L >= 2) {
    const [kx, ky] = P(u + w * 0.28, v, h * 0.45);
    ctx.fillStyle = C.gold;
    ctx.beginPath();
    ctx.arc(kx, ky, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  if (L >= 3) {
    const a = u - w / 2 - 0.07;
    const b = u + w / 2 + 0.07;
    poly(ctx, [P(a, v, h + 5), P(b, v, h + 5), P(b, v + 0.24, h - 3), P(a, v + 0.24, h - 3)], L >= 5 ? C.gold : C.navy, true, 1.5);
  }
  if (L >= 5) {
    for (const bu of [u - w / 2 - 0.24, u + w / 2 + 0.24]) {
      poly(ctx, [P(bu - 0.07, v, h - 2), P(bu + 0.07, v, h - 2), P(bu + 0.07, v, h + 16), P(bu - 0.07, v, h + 16)], C.navy, true, 1.3);
      const [gx, gy] = P(bu, v, h + 7);
      ctx.fillStyle = C.gold;
      ctx.beginPath();
      ctx.arc(gx, gy, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function shrub(ctx: Ctx, u: number, v: number, flowers: boolean): void {
  const [x, y] = P(u, v, 4);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = OUT;
  for (const [dx, dy, r] of [
    [-5, -3, 5],
    [5, -3, 5],
    [0, -7, 6],
  ]) {
    ctx.beginPath();
    ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
    ctx.fillStyle = C.grassDark;
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = '#7fd05a';
  ctx.beginPath();
  ctx.arc(x - 1, y - 8, 2.5, 0, Math.PI * 2);
  ctx.fill();
  if (flowers) {
    for (const [dx, dy, col] of [
      [-6, -4, '#ff8fb8'],
      [4, -2, C.gold],
      [1, -9, '#fff'],
    ] as [number, number, string][]) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x + dx, y + dy, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * Landscaping around the lot, drawn last so it sits in front of the walls: shrubs at Lv2, hedge
 * rows from Lv3 and banner lamp posts from Lv4 (the trees go in with the lot). The middle of the
 * front edge is left clear so doors and signs stay visible.
 */
function grounds(ctx: Ctx, L: number, size: number): void {
  const s = size / 2;
  if (L < 2) return;
  if (L === 2) {
    shrub(ctx, -s + 0.3, s - 0.17, false);
    return;
  }
  // hedge rows on both front edges, skipping the middle third of the left-front edge
  const step = 0.36;
  for (let u = -s + 0.28; u <= s - 0.5; u += step) {
    if (Math.abs(u + 0.05) < size * 0.27) continue;
    shrub(ctx, u, s - 0.17, (Math.round(u * 10) & 1) === 0);
  }
  for (let v = s - 0.55; v >= -s + 0.6; v -= step * 1.35) shrub(ctx, s - 0.17, v, false);
  if (L >= 4) {
    lamp(ctx, s - 0.16, s - 0.16, true);
    if (size >= 4) lamp(ctx, -s + 0.16, s - 0.16, true);
  }
}

function levelFlags(ctx: Ctx, level: number, u: number, v: number, z: number): void {
  if (level >= 4) {
    const [x, y] = P(u, v, z);
    flag(ctx, x, y, 22, level >= 6 ? C.gold : C.roofBlue);
  }
}

export function drawBuilding(ctx: Ctx, type: BuildingType, level: number, variant = 0): void {
  const size = BUILDINGS[type].size;
  if (type !== 'wall' && type !== 'lake' && type !== 'nest') groundShadow(ctx, size);
  if (level === 0) {
    drawScaffold(ctx, size);
    return;
  }
  const L = Math.max(1, level);
  switch (type) {
    case 'dmc':
      return dmc(ctx, L);
    case 'shed':
      return shed(ctx);
    case 'library':
      return library(ctx, L);
    case 'hive':
      return hive(ctx, L);
    case 'admissions':
      return admissions(ctx, L);
    case 'coffeecart':
      return coffeeCart(ctx, L);
    case 'registrar':
      return registrar(ctx, L);
    case 'rinnova':
      return rinnova(ctx, L);
    case 'reshall':
      return reshall(ctx, L);
    case 'biblical':
      return academic(ctx, L, C.brick, '#4a2f6b', 'BIBLE', 'book');
    case 'callan':
      return callan(ctx, L);
    case 'business':
      return academic(ctx, L, '#d9cdb8', '#2f6f4f', 'BUSINESS', 'coin');
    case 'music':
      return academic(ctx, L, C.brick, '#b23a6f', 'MUSIC', 'note');
    case 'ens':
      return ens(ctx, L);
    case 'health':
      return academic(ctx, L, '#eef0f2', C.teal, 'HEALTH', 'plus');
    case 'ssc':
      return ssc(ctx, L);
    case 'faculty':
      return faculty(ctx, L);
    case 'presidents':
      return presidents(ctx, L);
    case 'ratower':
      return raTower(ctx, L);
    case 'safetycart':
      return safetyCart(ctx, L);
    case 'sprayer':
      return sprayer(ctx, L);
    case 'bibleprof':
      return bibleProf(ctx, L);
    case 'nest':
      return nest(ctx, L);
    case 'wall':
      return wall(ctx, L, variant);
    case 'lake':
      return lake(ctx);
  }
}

function drawScaffold(ctx: Ctx, size: number): void {
  pad(ctx, size, '#c9b48a');
  const s = size / 2 - 0.3;
  const h = 24 + size * 6;
  // crates
  box(ctx, -s + 0.1, -s + 0.1, -s + 0.7, -s + 0.7, 4, 16, C.wood);
  box(ctx, -0.5, -0.4, 0.4, 0.4, 4, 4 + h * 0.6, '#dfd6c2');
  // poles
  ctx.strokeStyle = C.woodDark;
  ctx.lineWidth = 3;
  const corners: [number, number][] = [
    [-s, s],
    [s, s],
    [s, -s],
  ];
  for (const [u, v] of corners) {
    const a = P(u, v, 4);
    const b = P(u, v, h);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }
  ctx.lineWidth = 2.5;
  for (const z of [h * 0.45, h]) {
    const a = P(-s, s, z);
    const b = P(s, s, z);
    const c = P(s, -s, z);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.lineTo(c[0], c[1]);
    ctx.stroke();
  }
  // orange tarp
  poly(ctx, [P(-s, s, h * 0.45), P(0, s, h * 0.45), P(0, s, h), P(-s, s, h)], 'rgba(255,138,31,0.85)', true, 1.5);
  // cone
  const [x, y] = P(s - 0.1, s + 0.15, 4);
  ctx.beginPath();
  ctx.moveTo(x - 6, y);
  ctx.lineTo(x, y - 16);
  ctx.lineTo(x + 6, y);
  ctx.closePath();
  ctx.fillStyle = C.orange;
  ctx.fill();
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.fillRect(x - 3, y - 9, 6, 3);
}

// ---------- Screen-facing blocks ----------
// Boxes on the tile grid always show two slanted faces meeting at a front corner. To draw a
// building that faces the viewer, plans here are given in (p, d): p runs left to right across the
// screen and d runs from the back toward the viewer. A wall along p is flat to the screen.

type PD = [number, number];

/** (p, d, height) to sprite pixels. */
function Q(p: number, d: number, z = 0): [number, number] {
  return P(d + p, d - p, z);
}

/** The sides of an outline that face the viewer, far to near, with how far each leans left (-1) or right (+1). */
function frontEdges(plan: PD[]): { a: PD; b: PD; lean: number }[] {
  let area = 0;
  for (let i = 0; i < plan.length; i++) {
    const a = plan[i];
    const b = plan[(i + 1) % plan.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const sign = area > 0 ? 1 : -1;
  const out: { a: PD; b: PD; lean: number }[] = [];
  for (let i = 0; i < plan.length; i++) {
    const a = plan[i];
    const b = plan[(i + 1) % plan.length];
    const nx = (b[1] - a[1]) * sign;
    const nd = -(b[0] - a[0]) * sign;
    if (nd <= 0.001) continue; // faces away
    out.push({ a, b, lean: nx / Math.hypot(nx, nd) });
  }
  return out.sort((e, f) => e.a[1] + e.b[1] - (f.a[1] + f.b[1]));
}

/** An extruded block with any outline: the sides facing the viewer, shaded by which way they lean, then the top. */
function prism(ctx: Ctx, plan: PD[], z0: number, z1: number, color: string, top?: string): void {
  for (const e of frontEdges(plan)) {
    poly(ctx, [Q(e.a[0], e.a[1], z0), Q(e.b[0], e.b[1], z0), Q(e.b[0], e.b[1], z1), Q(e.a[0], e.a[1], z1)], shade(color, -0.2 - 0.11 * e.lean));
  }
  poly(ctx, plan.map(([pp, dd]) => Q(pp, dd, z1)), top ?? shade(color, 0.12));
}

/** A brick block with a screen-facing outline: level wall texture, cream parapet and a dark inset roof. */
function block45(ctx: Ctx, L: number, plan: PD[], z0: number, h: number, base: string): void {
  prism(ctx, plan, z0, h, L <= 1 ? WOOD : base);
  ctx.strokeStyle = L <= 1 ? 'rgba(60,35,10,0.3)' : 'rgba(0,0,0,0.14)';
  ctx.lineWidth = 1;
  for (const e of frontEdges(plan)) {
    if (L <= 1) {
      const n = Math.max(2, Math.round(Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]) / 0.16));
      for (let i = 1; i < n; i++) {
        const k = i / n;
        const pp = e.a[0] + (e.b[0] - e.a[0]) * k;
        const dd = e.a[1] + (e.b[1] - e.a[1]) * k;
        line(ctx, Q(pp, dd, z0), Q(pp, dd, h));
      }
    } else {
      for (let z = z0 + 6; z < h - 2; z += 6) line(ctx, Q(e.a[0], e.a[1], z), Q(e.b[0], e.b[1], z));
    }
  }
  if (L <= 1) {
    prism(ctx, plan, h, h + 3, '#6b5a48');
    return;
  }
  prism(ctx, plan, h, h + 4, L >= 5 ? CREAM_LIGHT : CREAM);
  const cp = plan.reduce((s, q) => s + q[0], 0) / plan.length;
  const cd = plan.reduce((s, q) => s + q[1], 0) / plan.length;
  poly(ctx, plan.map(([pp, dd]) => Q(cp + (pp - cp) * 0.86, cd + (dd - cd) * 0.8, h + 4)), SLATE, true, 1.3);
  if (L >= 5) {
    ctx.strokeStyle = C.gold;
    ctx.lineWidth = 1.5;
    for (const e of frontEdges(plan)) line(ctx, Q(e.a[0], e.a[1], h + 4), Q(e.b[0], e.b[1], h + 4));
  }
}

/** A plain rectangular plan. */
function rectPD(p0: number, p1: number, d0: number, d1: number): PD[] {
  return [
    [p0, d1],
    [p1, d1],
    [p1, d0],
    [p0, d0],
  ];
}

/** Windows on a wall that is flat to the screen at depth d: cream frames, some lit. `dark` gives slit windows with no frame. */
function frontWindows(ctx: Ctx, p0: number, p1: number, d: number, z0: number, z1: number, cols: number, rows: number, lit = 3, dark = false): void {
  const w = (p1 - p0) / cols;
  const hz = (z1 - z0) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = Q(p0 + w * c + w * 0.2, d, z0 + hz * r + hz * 0.18);
      const b = Q(p0 + w * (c + 1) - w * 0.2, d, z0 + hz * (r + 1) - hz * 0.14);
      const on = lit > 0 && (c * 5 + r * 3 + cols) % lit === 0;
      ctx.beginPath();
      ctx.rect(a[0], b[1], b[0] - a[0], a[1] - b[1]);
      ctx.fillStyle = on ? LIT : dark ? '#27314f' : C.glass;
      ctx.fill();
      ctx.lineWidth = dark ? 1.2 : 2.6;
      ctx.strokeStyle = dark ? OUT : CREAM;
      ctx.stroke();
      if (!dark) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = OUT;
        ctx.stroke();
      }
    }
  }
}

/** A sheet of dark-blue glazing on a wall that is flat to the screen, with a grid of frames. */
function frontGlass(ctx: Ctx, p0: number, p1: number, d: number, z0: number, z1: number, cols: number, rows: number, lit = 0): void {
  const a = Q(p0, d, z0);
  const b = Q(p1, d, z1);
  ctx.beginPath();
  ctx.rect(a[0], b[1], b[0] - a[0], a[1] - b[1]);
  ctx.fillStyle = '#2c4a86';
  ctx.fill();
  const w = (b[0] - a[0]) / cols;
  const hz = (a[1] - b[1]) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = (c * 3 + r * 2) % 7;
      if (lit && k % lit === 0) ctx.fillStyle = LIT;
      else if (k === 1 || k === 4) ctx.fillStyle = '#3b63a8';
      else continue;
      ctx.fillRect(a[0] + w * c, b[1] + hz * r, w, hz);
    }
  }
  ctx.strokeStyle = 'rgba(20,26,50,0.75)';
  ctx.lineWidth = 1;
  for (let c = 1; c < cols; c++) line(ctx, [a[0] + w * c, b[1]], [a[0] + w * c, a[1]]);
  for (let r = 1; r < rows; r++) line(ctx, [a[0], b[1] + hz * r], [b[0], b[1] + hz * r]);
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 1.8;
  ctx.strokeRect(a[0], b[1], b[0] - a[0], a[1] - b[1]);
}

/** A round cream column standing at (p, d). */
function column(ctx: Ctx, p: number, d: number, z0: number, z1: number): void {
  const [x, y] = Q(p, d, z0);
  const hgt = z1 - z0;
  const g = ctx.createLinearGradient(x - 3, 0, x + 3, 0);
  g.addColorStop(0, '#fbf5e4');
  g.addColorStop(1, '#d6c59b');
  ctx.beginPath();
  ctx.roundRect(x - 2.8, y - hgt, 5.6, hgt, 1.5);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  // base
  ctx.beginPath();
  ctx.roundRect(x - 3.8, y - 2.5, 7.6, 3, 1);
  ctx.fillStyle = CREAM;
  ctx.fill();
  ctx.stroke();
}

/**
 * The Dixon Ministry Center, facing the viewer: a wide, low entrance under a long name band and
 * a brick gable, a cluster of flat-roofed brick blocks of different heights behind it, and a
 * square brick tower in the middle with a slate cap, a mast and a white ball.
 * It is built up by level: wooden hall (1), brick hall and tower (2), the entrance and the tall
 * glass block (3), the stepped side blocks (4), the last blocks and gold trim (5), a gold ball (6).
 */
function dmc(ctx: Ctx, L: number): void {
  site(ctx, L, 4);
  const hh = L <= 1 ? 26 : 40; // entrance hall wall height
  const roof = hh + (L <= 1 ? 3 : 4);
  const fd = 0.8; // depth of the hall's front wall

  // 1-2. blocks behind the hall
  if (L >= 3) {
    block45(ctx, L, rectPD(-1.0, -0.12, -0.92, -0.3), 4, 90, C.brick);
    frontGlass(ctx, -0.9, -0.24, -0.3, 52, 84, 4, 3);
    if (L >= 4) {
      const [fx, fy] = Q(-0.9, -0.82, 94);
      flag(ctx, fx, fy, 16, L >= 6 ? C.gold : C.roofBlue);
    }
  }
  if (L >= 5) {
    block45(ctx, L, rectPD(0.24, 1.02, -0.88, -0.3), 4, 76, C.brick);
    frontWindows(ctx, 0.34, 0.92, -0.3, 58, 70, 3, 1, 2, true);
  }

  // 5. the entrance hall: straight across the front, ends angling back
  const hall: PD[] = [
    [-0.76, fd],
    [0.76, fd],
    [1.5, fd - 0.74],
    [1.2, fd - 1.04],
    [-1.2, fd - 1.04],
    [-1.5, fd - 0.74],
  ];
  block45(ctx, L, hall, 4, hh, C.brick);
  // windows on the angled ends (these are ordinary tile-aligned walls)
  if (L >= 2) {
    panes(ctx, 'L', -1.36, 0.0, 1.56, 9, hh - 5, 3, 1, 2);
    panes(ctx, 'R', -1.36, 0.0, 1.56, 9, hh - 5, 3, 1, 3);
  } else {
    windowsL(ctx, -1.36, 0.0, 1.56, 8, hh - 4, 3, 1);
    windowsR(ctx, -1.36, 0.0, 1.56, 8, hh - 4, 3, 1);
  }

  // 4. stepped blocks standing on the hall roof
  if (L >= 4) {
    block45(ctx, L, rectPD(-1.14, -0.46, -0.2, 0.34), roof, roof + 21, C.brick);
    frontWindows(ctx, -1.06, -0.54, 0.34, roof + 6, roof + 16, 4, 1, 0, true);
    block45(ctx, L, rectPD(0.46, 1.14, -0.2, 0.3), roof, roof + 15, C.brick);
    frontWindows(ctx, 0.54, 1.06, 0.3, roof + 4, roof + 11, 3, 1, 0, true);
  }

  // 3. the tower: a square brick shaft with its corner toward the viewer
  {
    const th = L <= 1 ? roof + 18 : 100 + L * 4;
    const u0 = -0.36;
    const u1 = 0.36;
    const v0 = -0.46;
    const v1 = 0.26;
    if (L <= 1) {
      box(ctx, u0 + 0.06, v0 + 0.06, u1 - 0.06, v1 - 0.06, roof, th, WOOD);
      pyramid(ctx, u0, v0, u1, v1, th, 14, C.roofBlue);
    } else {
      walls(ctx, 2, u0, v0, u1, v1, roof, th, C.brick);
      // slate cap: a dark V down the front corner, under a low dark roof
      const drop = 26 + L;
      poly(ctx, [P(u0, v1, th), P(u1, v1, th), P(u1, v1, th - drop)], shade(SLATE, 0.1), true, 1.8);
      poly(ctx, [P(u1, v1, th), P(u1, v0, th), P(u1, v1, th - drop)], shade(SLATE, -0.25), true, 1.8);
      box(ctx, u0 - 0.04, v0 - 0.04, u1 + 0.04, v1 + 0.04, th, th + 3, L >= 5 ? C.gold : CREAM);
      pyramid(ctx, u0 - 0.04, v0 - 0.04, u1 + 0.04, v1 + 0.04, th + 3, 15, SLATE);
    }
    const [x, y] = P((u0 + u1) / 2, (v0 + v1) / 2, th + (L <= 1 ? 14 : 18));
    const mast = L <= 1 ? 7 : 17;
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2.4;
    line(ctx, [x, y + 2], [x, y - mast - 6]);
    ctx.beginPath();
    ctx.arc(x, y - mast, L <= 1 ? 3.5 : 7.5, 0, Math.PI * 2);
    ctx.fillStyle = L >= 6 ? C.gold : '#f7f8f5';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.stroke();
    if (L >= 2) {
      // highlight on the ball
      ctx.beginPath();
      ctx.arc(x - 2, y - mast - 2, 1.8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fill();
    }
  }

  // a small lit block stepping down at the right front
  if (L >= 5) {
    block45(ctx, L, rectPD(0.52, 1.02, 0.3, 0.5), roof, roof + 8, C.brick);
    frontWindows(ctx, 0.58, 0.96, 0.5, roof + 1.5, roof + 6.5, 3, 1, 1, true);
  }

  // doors across the front of the hall
  if (L >= 2) frontGlass(ctx, -0.68, 0.68, fd, 5, hh - 19, 9, 1, 3);
  else {
    const a = Q(-0.12, fd, 4);
    ctx.fillStyle = '#3a3346';
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 1.8;
    ctx.fillRect(a[0], a[1] - 14, 16, 14);
    ctx.strokeRect(a[0], a[1] - 14, 16, 14);
    frontWindows(ctx, -0.68, -0.2, fd, 9, 21, 2, 1, 0);
    frontWindows(ctx, 0.2, 0.68, fd, 9, 21, 2, 1, 0);
  }

  // 6-7. the entrance: columns, the name band, and the brick gable over the middle
  const od = fd + 0.28; // outer line of the porch
  if (L >= 3) {
    const porch: PD[] = [
      [-0.86, od],
      [0.86, od],
      [1.16, od - 0.3],
      [0.92, fd - 0.16],
      [0.76, fd],
      [-0.76, fd],
      [-0.92, fd - 0.16],
      [-1.16, od - 0.3],
    ];
    prism(ctx, porch, 4, 6, C.stone);
    const colTop = hh - 18;
    const n = L >= 5 ? 6 : 5;
    column(ctx, 1.06, od - 0.3, 6, colTop);
    column(ctx, -1.06, od - 0.3, 6, colTop);
    for (let i = 0; i < n; i++) column(ctx, -0.78 + (1.56 * i) / (n - 1), od - 0.07, 6, colTop);
    // name band
    prism(ctx, porch, colTop, colTop + 12, CREAM, CREAM_LIGHT);
    const [tx, ty] = Q(0, od, colTop + 6);
    ctx.fillStyle = OUT;
    ctx.font = '900 7.6px "Trebuchet MS", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('DIXON MINISTRY CENTER', tx, ty + 0.5);
    ctx.textBaseline = 'alphabetic';
    // brick gable with a cream edge
    const g0 = Q(-0.7, od, colTop + 12);
    const g1 = Q(0.7, od, colTop + 12);
    const gt = Q(0, od, colTop + 12 + 21);
    poly(ctx, [g0, g1, gt], C.brick, true, 2);
    ctx.strokeStyle = CREAM;
    ctx.lineWidth = 2.2;
    line(ctx, [g0[0] + 3, g0[1] - 1.5], [gt[0], gt[1] + 2.5]);
    line(ctx, [g1[0] - 3, g1[1] - 1.5], [gt[0], gt[1] + 2.5]);
    if (L >= 5) star5(ctx, gt[0], gt[1] + 10, 3.6, C.gold);
  } else {
    const [sx, sy] = Q(0, fd, hh - 8);
    plaque(ctx, sx, sy, 'DMC', 10);
  }

  // forecourt: round bushes at the ends of the wings, lamp posts by the entrance
  const at = (pp: number, dd: number): [number, number] => [dd + pp, dd - pp];
  if (L >= 2) {
    for (const s of [-1, 1]) {
      const [bu, bv] = at(s * 1.66, 0.14);
      shrub(ctx, bu, bv, L >= 3);
    }
  }
  if (L >= 3) {
    for (const s of [-1, 1]) {
      for (const [pp, dd] of [
        [1.42, 0.42],
        [1.18, 0.68],
      ]) {
        const [bu, bv] = at(s * pp, dd);
        shrub(ctx, bu, bv, s > 0);
      }
    }
  }
  if (L >= 4) {
    for (const s of [-1, 1]) {
      const [lu, lv] = at(s * 1.0, 0.92);
      lamp(ctx, lu, lv, true);
    }
  }
}

function shed(ctx: Ctx): void {
  pad(ctx, 2, '#c9b48a');
  box(ctx, -0.7, -0.6, 0.6, 0.65, 4, 26, C.wood);
  // planks
  ctx.strokeStyle = C.woodDark;
  ctx.lineWidth = 1;
  for (let i = 1; i < 5; i++) {
    const u = -0.7 + i * 0.26;
    const a = P(u, 0.65, 4);
    const b = P(u, 0.65, 26);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }
  gable(ctx, -0.8, -0.7, 0.7, 0.75, 26, 16, C.orange);
  door(ctx, -0.1, 0.65, 0.45, 18, C.woodDark);
  // shovel
  const [x, y] = P(0.75, 0.5, 4);
  ctx.strokeStyle = C.woodDark;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + 3, y - 26);
  ctx.stroke();
  ctx.fillStyle = '#9aa3ad';
  ctx.beginPath();
  ctx.ellipse(x - 1, y - 2, 4, 6, 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = OUT;
  ctx.stroke();
}

function library(ctx: Ctx, L: number): void {
  site(ctx, L, 3);
  const h = 34 + L * 5;
  walls(ctx, L, -1.2, -1.2, 1.2, 1.1, 4, h, C.brick);
  windowsR(ctx, -1.0, 0.9, 1.2, 10, h - 6, 3, 2);
  // columns porch on left face
  box(ctx, -1.1, 1.1, 1.1, 1.35, 4, 8, C.white);
  for (let i = 0; i < 5; i++) {
    const u = -0.95 + i * 0.47;
    box(ctx, u - 0.07, 1.15, u + 0.07, 1.29, 8, h - 4, C.white, { stroke: true });
  }
  poly(ctx, [P(-1.15, 1.35, h - 4), P(1.15, 1.35, h - 4), P(0, 1.35, h + 12)], C.white);
  trim(ctx, L, -1.2, -1.2, 1.2, 1.1, h);
  pyramid(ctx, -1.25, -1.25, 1.25, 1.15, h, 18 + L * 2, C.roofBlue);
  // book sign
  const [x, y] = P(0, 1.35, h + 2);
  ctx.fillStyle = C.gold;
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - 10, y - 4);
  ctx.quadraticCurveTo(x - 5, y - 8, x, y - 4);
  ctx.quadraticCurveTo(x + 5, y - 8, x + 10, y - 4);
  ctx.lineTo(x + 10, y + 3);
  ctx.quadraticCurveTo(x + 5, y - 1, x, y + 3);
  ctx.quadraticCurveTo(x - 5, y - 1, x - 10, y + 3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (L >= 3) finial(ctx, 0, -0.05, h + 18 + L * 2, L >= 5 ? 6 : 5);
  levelFlags(ctx, L, 1.1, 1.0, h);
  grounds(ctx, L, 3);
}

function hive(ctx: Ctx, L: number): void {
  site(ctx, L, 3, '#3b3b4a');
  const layers = 4 + Math.min(2, Math.floor(L / 2));
  const [x, y0] = P(0, 0, 4);
  for (let i = 0; i < layers; i++) {
    const r = 44 - i * (30 / layers);
    const y = y0 - i * 12;
    ctx.beginPath();
    ctx.ellipse(x, y - 6, r, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 ? C.black : C.gold;
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = OUT;
    ctx.stroke();
  }
  // door hole
  ctx.fillStyle = '#1a1420';
  ctx.beginPath();
  ctx.ellipse(x - 4, y0 - 6, 9, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  // HIVE sign
  sign(ctx, x, y0 - layers * 12 - 18, 'THE HIVE', C.black, C.gold, 10);
  // foam finger
  ctx.save();
  ctx.translate(x + 34, y0 - 20);
  ctx.rotate(0.3);
  ctx.fillStyle = C.gold;
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 1.6;
  ctx.fillRect(-5, -22, 10, 26);
  ctx.strokeRect(-5, -22, 10, 26);
  ctx.fillRect(-2, -34, 5, 14);
  ctx.strokeRect(-2, -34, 5, 14);
  ctx.restore();
  if (L >= 2) {
    // pennants strung off the top, more with each level
    for (let i = 0; i < Math.min(4, L); i++) {
      const px = x - 30 - i * 9;
      const py = y0 - layers * 12 + 14 + i * 9;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + 8, py + 1);
      ctx.lineTo(px + 3, py + 9);
      ctx.closePath();
      ctx.fillStyle = i % 2 ? C.navy : C.gold;
      ctx.fill();
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }
}

/** Admissions: a welcome office with a columned, pedimented front that gets grander by level. */
function admissions(ctx: Ctx, L: number): void {
  site(ctx, L, 3);
  const h = 28 + L * 4;
  walls(ctx, L, -1.1, -1.1, 0.9, 0.85, 4, h, C.brick);
  if (L >= 2) {
    panes(ctx, 'L', -1.02, -0.5, 0.85, 9, h - 6, 1, L >= 4 ? 2 : 1, 2);
    panes(ctx, 'L', 0.3, 0.82, 0.85, 9, h - 6, 1, L >= 4 ? 2 : 1, 2);
    panes(ctx, 'R', -1.0, 0.75, 0.9, 9, h - 6, 3, L >= 4 ? 2 : 1);
  } else {
    windowsL(ctx, -1.0, 0.8, 0.85, 8, h - 6, 3, 1);
    windowsR(ctx, -1.0, 0.8, 0.9, 8, h - 6, 2, 1);
  }
  trim(ctx, L, -1.1, -1.1, 0.9, 0.85, h);
  flatRoof(ctx, L, -1.1, -1.1, 0.9, 0.85, h);
  const ph = Math.min(h - 6, 24);
  entry(ctx, L, -0.1, 0.85, 0.42, ph - 6, C.navy);
  if (L >= 2) {
    colonnade(ctx, -0.5, 0.3, 0.85, 0.38, ph, L >= 4 ? 4 : 2);
    // pediment over the columns
    poly(ctx, [P(-0.6, 1.23, ph + 5), P(0.4, 1.23, ph + 5), P(-0.1, 1.23, ph + 19)], CREAM, true, 1.8);
    if (L >= 4) {
      const [gx, gy] = P(-0.1, 1.23, ph + 10);
      star5(ctx, gx, gy, 4, C.gold);
    }
  }
  levelFlags(ctx, L, 0.85, 0.8, h + 5);
  grounds(ctx, L, 3);
  const [x, y] = P(-0.1, L >= 2 ? 1.23 : 0.85, L >= 2 ? ph + 1 : h - 6);
  plaque(ctx, x, y + (L >= 2 ? 4 : 0), 'ADMISSIONS', 7, L >= 2);
}

function coffeeCart(ctx: Ctx, L: number): void {
  site(ctx, L, 3, '#c8a77e');
  // cart body
  box(ctx, -0.8, -0.5, 0.8, 0.6, 12, 34, '#5a3a24');
  poly(ctx, [P(-0.8, 0.6, 14), P(0.8, 0.6, 14), P(0.8, 0.6, 30), P(-0.8, 0.6, 30)], '#7b4d2c', true);
  // wheels
  for (const u of [-0.5, 0.5]) {
    const [x, y] = P(u, 0.62, 10);
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#333';
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#aaa';
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // espresso machine
  box(ctx, -0.3, -0.3, 0.3, 0.2, 34, 48, '#c0c6cc');
  // umbrella
  const [ux, uy] = P(0, 0, 48);
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(ux, uy);
  ctx.lineTo(ux, uy - 30);
  ctx.stroke();
  const ur = 52 + L * 3;
  for (let i = 0; i < 6; i++) {
    const a0 = Math.PI + (i * Math.PI) / 6;
    const a1 = Math.PI + ((i + 1) * Math.PI) / 6;
    ctx.beginPath();
    ctx.moveTo(ux, uy - 52);
    ctx.lineTo(ux + Math.cos(a0) * ur, uy - 30 + Math.sin(a0) * 6 + 6);
    ctx.lineTo(ux + Math.cos(a1) * ur, uy - 30 + Math.sin(a1) * 6 + 6);
    ctx.closePath();
    ctx.fillStyle = i % 2 ? C.gold : C.roofBlue;
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }
  // cup sign
  const [cx, cy] = P(-0.2, 0.6, 26);
  ctx.fillStyle = C.white;
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(cx - 6, cy - 8);
  ctx.lineTo(cx + 6, cy - 8);
  ctx.lineTo(cx + 4, cy + 6);
  ctx.lineTo(cx - 4, cy + 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C.coffee;
  ctx.fillRect(cx - 5, cy - 3, 10, 3);
  if (L >= 2) {
    // chalk menu board
    const [mx, my] = P(-1.15, 1.2, 4);
    ctx.fillStyle = '#2d4a3a';
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(mx - 7, my);
    ctx.lineTo(mx - 5, my - 20);
    ctx.lineTo(mx + 5, my - 20);
    ctx.lineTo(mx + 7, my);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    for (const dy of [-15, -11, -7]) line(ctx, [mx - 3, my + dy], [mx + 3, my + dy]);
  }
  if (L >= 3) {
    // bistro table and stools
    const [tx, ty] = P(1.05, 1.05, 4);
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2;
    line(ctx, [tx, ty], [tx, ty - 10]);
    ctx.beginPath();
    ctx.ellipse(tx, ty - 11, 9, 4.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = C.white;
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.stroke();
    for (const dx of [-13, 13]) {
      ctx.beginPath();
      ctx.ellipse(tx + dx, ty - 4, 4, 2.2, 0, 0, Math.PI * 2);
      ctx.fillStyle = L >= 5 ? C.gold : C.roofBlue;
      ctx.fill();
      ctx.stroke();
    }
  }
  if (L >= 4) {
    // string lights from the umbrella pole
    const [lx, ly] = P(0, 0, 48);
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(lx, ly - 30);
    ctx.quadraticCurveTo(lx + 30, ly - 6, lx + 62, ly - 2);
    ctx.stroke();
    for (let i = 1; i <= 5; i++) {
      const k = i / 6;
      const bx = lx + 62 * k;
      const by = ly - 30 + 28 * k + Math.sin(k * Math.PI) * 9;
      ctx.beginPath();
      ctx.arc(bx, by, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 ? '#ffe9a8' : '#ff8fb8';
      ctx.fill();
    }
  }
}

/** Registrar: the Tuition vault. The roof is an open coin bin (filled in by the live overlay). */
function registrar(ctx: Ctx, L: number): void {
  site(ctx, L, 3);
  const h = 30 + L * 5;
  walls(ctx, L, -1.15, -1.15, 1.1, 1.0, 4, h, C.brick);
  if (L >= 2) panes(ctx, 'R', -1.0, 0.9, 1.1, 10, h - 6, 3, L >= 4 ? 2 : 1);
  else windowsR(ctx, -1.0, 0.9, 1.1, 10, h - 6, 3, 1);
  if (L >= 2) {
    // narrow windows either side of the vault
    panes(ctx, 'L', -1.05, -0.62, 1.0, 10, h - 8, 1, 1, 0);
    panes(ctx, 'L', 0.6, 1.02, 1.0, 10, h - 8, 1, 1, 2);
  }
  // vault door on left face
  const [vx, vy] = P(0, 1.0, h * 0.42);
  if (L >= 3) {
    // cream surround
    ctx.beginPath();
    ctx.ellipse(vx, vy, 20, 19, 0, 0, Math.PI * 2);
    ctx.fillStyle = CREAM;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = OUT;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.ellipse(vx, vy, 16, 15, 0, 0, Math.PI * 2);
  ctx.fillStyle = L >= 4 ? C.gold : L <= 1 ? '#8a8f96' : '#c9cdd3';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(vx, vy, 9, 8.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = C.gold;
  ctx.fill();
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + 0.4;
    ctx.beginPath();
    ctx.moveTo(vx, vy);
    ctx.lineTo(vx + Math.cos(a) * 13, vy + Math.sin(a) * 12);
    ctx.stroke();
  }
  trim(ctx, L, -1.15, -1.15, 1.1, 1.0, h);
  // parapet around the open-top coin bin
  if (L >= 2) box(ctx, -1.2, -1.2, 1.15, 1.05, h, h + 3, CREAM);
  box(ctx, -1.0, -1.0, 0.95, 0.85, h + (L >= 2 ? 3 : 0), h + 6, C.stoneDark);
  const [sx, sy] = P(0, 1.0, h - 5);
  plaque(ctx, sx, sy, 'REGISTRAR', 7);
  levelFlags(ctx, L, 1.05, 0.95, h + 6);
  grounds(ctx, L, 3);
}

function rinnova(ctx: Ctx, L: number): void {
  site(ctx, L, 3);
  const h = 30 + L * 4;
  // coffee tank in back (fill drawn dynamically)
  cylinder(ctx, 0.1, -0.9, 0.62, 4, h + 22 + L * 3, '#c8ccd2', '#9aa0a8');
  walls(ctx, L, -1.15, -0.4, 1.1, 1.05, 4, h, '#3d3a44');
  windowsL(ctx, -1.05, 1.0, 1.05, 6, h - 4, 4, 1, '#ffd890');
  // awning
  poly(ctx, [P(-1.15, 1.05, h - 2), P(1.1, 1.05, h - 2), P(1.1, 1.35, h - 12), P(-1.15, 1.35, h - 12)], '#e4572e');
  for (let i = 0; i < 6; i++) {
    const u = -1.15 + (i + 0.5) * 0.375;
    poly(ctx, [P(u - 0.09, 1.05, h - 2), P(u + 0.09, 1.05, h - 2), P(u + 0.09, 1.35, h - 12), P(u - 0.09, 1.35, h - 12)], C.white, false);
  }
  box(ctx, -1.15, -0.4, 1.1, 1.05, h, h + 4, '#2a2830');
  const [sx, sy] = P(0, 1.05, h + 10);
  sign(ctx, sx, sy, 'RINNOVA', '#2a2830', '#ffd890', 9);
  if (L >= 4) {
    // steam off the roaster
    const [px, py] = P(-0.7, 0.3, h + 4);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (const [dx, dy, r] of [
      [0, -6, 4],
      [4, -13, 5],
      [-1, -21, 6],
    ]) {
      ctx.beginPath();
      ctx.arc(px + dx, py + dy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  levelFlags(ctx, L, 1.05, 1.0, h + 4);
  grounds(ctx, L, 3);
}

/** Residence hall: a long slate-roofed hall with gabled bays on the front, taller with each upgrade. */
function reshall(ctx: Ctx, L: number): void {
  site(ctx, L, 4);
  const floors = 2 + Math.min(3, Math.floor((L + 1) / 2));
  const h = 14 + floors * 15;
  walls(ctx, L, -1.7, -1.4, 1.6, 1.2, 4, h, C.brick);
  if (L >= 2) {
    panes(ctx, 'L', -0.55, 0.45, 1.2, 8, h - 4, 2, floors);
    panes(ctx, 'R', -1.3, 1.1, 1.6, 8, h - 4, 4, floors);
  } else {
    windowsL(ctx, -1.6, 1.5, 1.2, 8, h - 4, 6, floors);
    windowsR(ctx, -1.3, 1.1, 1.6, 8, h - 4, 4, floors);
  }
  trim(ctx, L, -1.7, -1.4, 1.6, 1.2, h);
  gable(ctx, -1.8, -1.5, 1.7, 1.3, h, 22, SLATE);
  roofTop(ctx, L, 0.0, -0.1, h + 22);
  if (L >= 2) {
    // gabled bays standing proud of the front
    for (const [a, b] of [
      [-1.55, -0.65],
      [0.55, 1.45],
    ]) {
      walls(ctx, L, a, 1.2, b, 1.42, 4, h, C.brick);
      panes(ctx, 'L', a + 0.06, b - 0.06, 1.42, 8, h - 4, 2, floors, 4);
      gable(ctx, a - 0.07, 1.0, b + 0.07, 1.48, h, 17, SLATE, 'v');
      poly(ctx, [P(a - 0.07, 1.48, h), P(b + 0.07, 1.48, h), P((a + b) / 2, 1.48, h + 17)], CREAM, true, 1.8);
      if (L >= 4) {
        const [ox, oy] = P((a + b) / 2, 1.48, h + 6);
        ctx.beginPath();
        ctx.arc(ox, oy, 3, 0, Math.PI * 2);
        ctx.fillStyle = L >= 5 ? C.gold : C.glass;
        ctx.fill();
        ctx.lineWidth = 1.3;
        ctx.strokeStyle = OUT;
        ctx.stroke();
      }
    }
  }
  entry(ctx, L, -0.05, 1.2, 0.5, 16, C.navy);
  if (L >= 2) {
    // bike rack out front
    const [bx, by] = P(-0.35, 1.8, 4);
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 1.8;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(bx + i * 7, by - 3 + i * 3.5, 4, Math.PI, 0);
      ctx.stroke();
    }
  }
  levelFlags(ctx, L, 1.55, 1.15, h);
  grounds(ctx, L, 4);
}

function academic(ctx: Ctx, L: number, wallColor: string, accent: string, label: string, icon: 'book' | 'plus' | 'coin' | 'note'): void {
  site(ctx, L, 3);
  const h = 32 + L * 6;
  walls(ctx, L, -1.15, -1.15, 1.1, 1.05, 4, h, wallColor);
  windowsL(ctx, -1.05, 1.0, 1.05, 8, h - 6, 4, 2);
  windowsR(ctx, -1.05, 0.95, 1.1, 8, h - 6, 3, 2);
  trim(ctx, L, -1.15, -1.15, 1.1, 1.05, h);
  gable(ctx, -1.25, -1.25, 1.2, 1.15, h, 20, accent);
  roofTop(ctx, L, -0.55, -0.05, h + 20);
  entry(ctx, L, 0, 1.05, 0.45, 16, shade(accent, -0.2));
  const [x, y] = P(0, 1.15, h + 8);
  if (icon === 'plus') {
    ctx.fillStyle = C.green;
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.rect(x - 3, y - 9, 6, 18);
    ctx.rect(x - 9, y - 3, 18, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(x - 2, y - 2, 4, 4);
  } else if (icon === 'coin') {
    ctx.fillStyle = C.gold;
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = OUT;
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', x, y + 1);
    ctx.textBaseline = 'alphabetic';
  } else if (icon === 'note') {
    ctx.fillStyle = C.white;
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(x - 5, y + 6, 4.5, 3.2, -0.4, 0, Math.PI * 2);
    ctx.ellipse(x + 6, y + 3, 4.5, 3.2, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(x - 1, y + 5);
    ctx.lineTo(x - 1, y - 9);
    ctx.lineTo(x + 10, y - 12);
    ctx.lineTo(x + 10, y + 2);
    ctx.stroke();
  } else {
    ctx.fillStyle = C.white;
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 11, y - 3);
    ctx.quadraticCurveTo(x - 5, y - 8, x, y - 3);
    ctx.quadraticCurveTo(x + 5, y - 8, x + 11, y - 3);
    ctx.lineTo(x + 11, y + 5);
    ctx.quadraticCurveTo(x + 5, y, x, y + 5);
    ctx.quadraticCurveTo(x - 5, y, x - 11, y + 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = C.red;
    ctx.beginPath();
    ctx.moveTo(x, y - 3);
    ctx.lineTo(x, y + 9);
    ctx.stroke();
  }
  const [sx, sy] = P(-0.6, 1.05, h - 10);
  sign(ctx, sx, sy, label, accent, '#fff', 7);
  levelFlags(ctx, L, 1.05, 1.0, h);
  grounds(ctx, L, 3);
}

function callan(ctx: Ctx, L: number): void {
  site(ctx, L, 3);
  const h = 30 + L * 5;
  walls(ctx, L, -1.2, -1.2, 1.15, 1.1, 4, h, C.brick);
  windowsL(ctx, -1.1, 1.05, 1.1, 10, h - 8, 4, 1, '#ffe08a');
  // barrel roof: series of strips
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI;
    const a1 = ((i + 1) / n) * Math.PI;
    const v0 = -1.2 + (1 - Math.cos(a0)) * 1.15;
    const v1 = -1.2 + (1 - Math.cos(a1)) * 1.15;
    const z0 = h + Math.sin(a0) * 22;
    const z1 = h + Math.sin(a1) * 22;
    poly(ctx, [P(-1.25, v0, z0), P(1.2, v0, z0), P(1.2, v1, z1), P(-1.25, v1, z1)], i % 2 ? C.black : C.gold, true, 1.6);
  }
  const [sx, sy] = P(0, 1.1, h - 14);
  sign(ctx, sx, sy, 'CALLAN', C.black, C.gold, 9);
  trim(ctx, L, -1.2, -1.2, 1.15, 1.1, h);
  if (L >= 2) {
    // scoreboard on the lawn
    const [bx, by] = P(1.2, 1.25, 4);
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2;
    line(ctx, [bx - 7, by], [bx - 7, by - 12]);
    line(ctx, [bx + 7, by], [bx + 7, by - 12]);
    ctx.fillStyle = C.black;
    ctx.fillRect(bx - 12, by - 24, 24, 13);
    ctx.strokeRect(bx - 12, by - 24, 24, 13);
    ctx.fillStyle = C.gold;
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('21-7', bx, by - 14);
  }
  levelFlags(ctx, L, 1.1, 1.0, h);
  grounds(ctx, L, 3);
}

function ens(ctx: Ctx, L: number): void {
  site(ctx, L, 3);
  const h = 38 + L * 6;
  walls(ctx, L, -1.15, -1.15, 1.1, 1.05, 4, h, '#7d8a99');
  windowsL(ctx, -1.05, 1.0, 1.05, 6, h - 4, 5, 3, '#a9e4ff');
  windowsR(ctx, -1.05, 0.95, 1.1, 6, h - 4, 3, 3, '#a9e4ff');
  box(ctx, -1.15, -1.15, 1.1, 1.05, h, h + 5, '#4b5563');
  // gear on roof
  const [x, y] = P(0, 0, h + 5);
  ctx.save();
  ctx.translate(x, y - 16);
  ctx.fillStyle = C.gold;
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = i % 2 ? 11 : 15;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#4b5563';
  ctx.beginPath();
  ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  const [sx, sy] = P(0, 1.05, 14);
  sign(ctx, sx, sy, 'ENS', C.navy, '#fff', 9);
  if (L >= 2) {
    // rooftop telescope dome
    dome(ctx, -0.65, -0.65, 0.28, h + 5, '#c8ccd2');
  }
  levelFlags(ctx, L, 1.05, 1.0, h + 5);
  grounds(ctx, L, 3);
}

function ssc(ctx: Ctx, L: number): void {
  site(ctx, L, 3);
  const h = 28 + L * 6;
  cylinder(ctx, 0, 0, 1.15, 4, h, C.brick, shade(C.brick, 0.1));
  windowsDots(ctx, h);
  dome(ctx, 0, 0, 0.8, h, '#ff6fb5');
  // bubbling vial
  const [x, y] = P(0, 0, h + 30);
  ctx.fillStyle = 'rgba(255,111,181,0.9)';
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  const [sx, sy] = P(0, 1.15, 12);
  sign(ctx, sx, sy, 'BREW LAB', C.navy, '#ff9fd0', 8);
  if (L >= 2) {
    // more bubbles as the lab grows
    for (let i = 0; i < L; i++) {
      const [bx, by] = P(0.15 - i * 0.12, 0, h + 40 + i * 9);
      ctx.fillStyle = 'rgba(255,159,208,0.85)';
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(bx + (i % 2 ? 6 : -5), by, 3 + (i % 2), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
  grounds(ctx, L, 3);
}

function windowsDots(ctx: Ctx, h: number): void {
  for (let i = 0; i < 5; i++) {
    const a = Math.PI * (0.15 + i * 0.175);
    const x = Math.cos(a) * 45 * 1.15 * -1;
    const y = Math.sin(a) * 22 * 1.15 - h * 0.55;
    ctx.fillStyle = C.glass;
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x, y, 5, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function faculty(ctx: Ctx, L: number): void {
  pad(ctx, 3);
  const h = 32;
  box(ctx, -1.1, -1.15, 0.6, 0.4, 4, h, C.brick);
  windowsL(ctx, -1.0, 0.5, 0.4, 8, h - 6, 2, 1);
  gable(ctx, -1.2, -1.25, 0.7, 0.5, h, 16, '#4b5563');
  // chalkboard on front lawn
  const [x, y] = P(0.85, 0.8, 4);
  ctx.strokeStyle = C.woodDark;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x - 12, y);
  ctx.lineTo(x - 8, y - 30);
  ctx.moveTo(x + 12, y);
  ctx.lineTo(x + 8, y - 30);
  ctx.stroke();
  ctx.fillStyle = '#2d4a3a';
  ctx.fillRect(x - 15, y - 34, 30, 20);
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 15, y - 34, 30, 20);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 7px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('E=mc²', x, y - 26);
  ctx.fillText('QUIZ!', x, y - 18);
  const [sx, sy] = P(-0.3, 0.4, 12);
  sign(ctx, sx, sy, 'FACULTY', C.navy, C.gold, 7);
}

function presidents(ctx: Ctx, L: number): void {
  pad(ctx, 3, '#d6e8c8');
  const h = 40;
  box(ctx, -1.15, -1.15, 1.1, 0.8, 4, h, C.white);
  windowsL(ctx, -1.05, 1.0, 0.8, 8, h - 6, 4, 2, '#cfe8ff');
  // portico columns
  box(ctx, -0.6, 0.8, 0.6, 1.25, 4, 7, C.white);
  for (let i = 0; i < 4; i++) {
    const u = -0.5 + i * 0.33;
    box(ctx, u - 0.05, 1.05, u + 0.05, 1.15, 7, h - 4, '#ffffff');
  }
  poly(ctx, [P(-0.65, 1.25, h - 4), P(0.65, 1.25, h - 4), P(0, 1.25, h + 12)], C.white);
  gable(ctx, -1.25, -1.25, 1.2, 0.9, h, 22, C.roofBlue);
  const [x, y] = P(0, 1.25, h + 2);
  star5(ctx, x, y, 6, C.gold);
  const [fx, fy] = P(1.05, 0.75, h);
  flag(ctx, fx, fy, 30, C.roofBlue);
}

function raTower(ctx: Ctx, L: number): void {
  site(ctx, L, 3, L <= 1 ? undefined : C.stone);
  const h = 42 + L * 5;
  const s = 0.55;
  walls(ctx, L, -s, -s, s, s, 4, h, L >= 4 ? C.stone : C.brick);
  windowsL(ctx, -s + 0.1, s - 0.1, s, h * 0.4, h * 0.7, 1, 1, '#ffe9a8');
  // platform
  box(ctx, -0.85, -0.85, 0.85, 0.85, h, h + 6, C.wood);
  // rails
  ctx.strokeStyle = C.woodDark;
  ctx.lineWidth = 2.2;
  const corners: [number, number][] = [
    [-0.85, 0.85],
    [0.85, 0.85],
    [0.85, -0.85],
  ];
  ctx.beginPath();
  for (const [u, v] of corners) {
    const a = P(u, v, h + 6);
    const b = P(u, v, h + 18);
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
  }
  const r0 = P(-0.85, 0.85, h + 16);
  const r1 = P(0.85, 0.85, h + 16);
  const r2 = P(0.85, -0.85, h + 16);
  ctx.moveTo(r0[0], r0[1]);
  ctx.lineTo(r1[0], r1[1]);
  ctx.lineTo(r2[0], r2[1]);
  ctx.stroke();
  trim(ctx, L, -s, -s, s, s, h);
  const [sx, sy] = P(0, s, h * 0.2 + 6);
  sign(ctx, sx, sy, 'RA', C.navy, C.gold, 8);
  if (L >= 3) {
    // a roof over the lookout
    ctx.strokeStyle = C.woodDark;
    ctx.lineWidth = 2.2;
    for (const [u, v] of [
      [-0.8, 0.8],
      [0.8, 0.8],
      [0.8, -0.8],
    ]) line(ctx, P(u, v, h + 16), P(u, v, h + 28));
    pyramid(ctx, -0.95, -0.95, 0.95, 0.95, h + 28, 16, L >= 5 ? C.gold : C.roofBlue);
  }
  if (L >= 5) {
    // spotlight
    const [lx, ly] = P(0.85, 0.85, h + 20);
    ctx.fillStyle = 'rgba(255,240,170,0.35)';
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(lx + 26, ly + 22);
    ctx.lineTo(lx + 8, ly + 30);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(lx, ly, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffe9a8';
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function safetyCart(ctx: Ctx, L: number): void {
  site(ctx, L, 3, '#8f939a');
  // parking lines
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  for (const u of [-1.1, 1.1]) {
    const a = P(u, -1.1, 4);
    const b = P(u, 1.1, 4);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }
  // cart body
  box(ctx, -0.8, -0.45, 0.8, 0.45, 10, 24, C.white);
  poly(ctx, [P(-0.8, 0.45, 14), P(0.8, 0.45, 14), P(0.8, 0.45, 19), P(-0.8, 0.45, 19)], C.roofBlue, true, 1.4);
  // roof posts
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 2;
  for (const [u, v] of [
    [-0.7, 0.4],
    [0.4, 0.4],
    [0.4, -0.4],
  ] as [number, number][]) {
    const a = P(u, v, 24);
    const b = P(u, v, 46);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }
  box(ctx, -0.85, -0.5, 0.5, 0.5, 46, 50, C.white);
  // light bar
  box(ctx, -0.3, -0.25, 0.1, 0.25, 50, 55, '#ddd');
  if (L >= 2) {
    // red and blue lights
    box(ctx, -0.3, 0.02, 0.1, 0.25, 55, 59, C.red);
    box(ctx, -0.3, -0.25, 0.1, -0.02, 55, 59, C.roofBlue);
  }
  if (L >= 3) {
    // whip antenna with a pennant
    const [ax, ay] = P(0.42, -0.42, 50);
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 1.5;
    line(ctx, [ax, ay], [ax + 2, ay - 26]);
    ctx.fillStyle = L >= 5 ? C.gold : C.orange;
    ctx.beginPath();
    ctx.moveTo(ax + 2, ay - 26);
    ctx.lineTo(ax + 12, ay - 22);
    ctx.lineTo(ax + 2, ay - 18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  if (L >= 4) {
    // traffic cones by the parking lines
    for (const u of [-1.15, 1.15]) {
      const [cx2, cy2] = P(u, 1.0, 4);
      ctx.beginPath();
      ctx.moveTo(cx2 - 4, cy2);
      ctx.lineTo(cx2, cy2 - 11);
      ctx.lineTo(cx2 + 4, cy2);
      ctx.closePath();
      ctx.fillStyle = C.orange;
      ctx.fill();
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 1.3;
      ctx.stroke();
    }
  }
  // wheels
  for (const u of [-0.55, 0.55]) {
    const [x, y] = P(u, 0.47, 9);
    ctx.beginPath();
    ctx.ellipse(x, y, 6, 7, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#222';
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.stroke();
  }
  // L5+ gets a gold badge
  const [bx, by] = P(0, 0.45, 18);
  star5(ctx, bx, by, L >= 4 ? 7 : 5, L >= 4 ? C.gold : '#c9cdd3');
}

function sprayer(ctx: Ctx, L: number): void {
  site(ctx, L, 3, C.stone);
  cylinder(ctx, 0, 0, 1.05, 4, 14, L <= 1 ? WOOD : L >= 5 ? C.white : C.stoneDark, '#3fa8e0');
  // water surface ripple
  const [x, y] = P(0, 0, 18);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(x, y, 25, 12, 0, 0, Math.PI * 2);
  ctx.stroke();
  // sprinkler post
  cylinder(ctx, 0, 0, 0.18, 14, 22 + L * 3, '#7b8a95', '#9fb0bd');
  cylinder(ctx, 0, 0, 0.32, 36 + L * 3, 8, L >= 3 ? C.gold : '#2e63b8');
  if (L >= 2) {
    // spray arcs: more nozzles at higher levels
    const [nx, ny] = P(0, 0, 44 + L * 3);
    ctx.strokeStyle = 'rgba(190,235,255,0.9)';
    ctx.lineWidth = 1.8;
    const arcs = Math.min(4, L);
    for (let i = 0; i < arcs; i++) {
      const dir = i % 2 ? 1 : -1;
      const reach = 18 + Math.floor(i / 2) * 12;
      ctx.beginPath();
      ctx.moveTo(nx, ny - 4);
      ctx.quadraticCurveTo(nx + dir * reach * 0.6, ny - 18, nx + dir * reach, ny + 6);
      ctx.stroke();
    }
  }
}

function bibleProf(ctx: Ctx, L: number): void {
  site(ctx, L, 3, C.stone);
  const h = 48 + L * 6;
  cylinder(ctx, 0, 0, 0.85, 4, h, C.stone, shade(C.stone, 0.15));
  // stone bands
  for (let i = 1; i < 4; i++) {
    const [x, y] = P(0, 0, 4 + (h * i) / 4);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x, y, 38, 19, 0, 0, Math.PI);
    ctx.stroke();
  }
  // crenellations
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const u = Math.cos(a) * 0.75;
    const v = Math.sin(a) * 0.75;
    if (u + v < -0.3) continue;
    box(ctx, u - 0.1, v - 0.1, u + 0.1, v + 0.1, h, h + 8, C.stone);
  }
  const [wx, wy] = P(0, 0.85, h * 0.5);
  ctx.fillStyle = L >= 3 ? '#ffe9a8' : '#4a3f5c';
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(wx - 6, wy + 10);
  ctx.lineTo(wx - 6, wy - 4);
  ctx.arc(wx, wy - 4, 6, Math.PI, 0);
  ctx.lineTo(wx + 6, wy + 10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (L >= 2) {
    const [bx, by] = P(0, 0.85, h * 0.2);
    sign(ctx, bx, by, 'BIBLE', '#4a2f6b', C.gold, 7);
  }
  if (L >= 4) {
    // banner down the front
    const [nx, ny] = P(0.5, 0.7, h * 0.78);
    ctx.fillStyle = '#4a2f6b';
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(nx - 5, ny);
    ctx.lineTo(nx + 5, ny);
    ctx.lineTo(nx + 5, ny + 20);
    ctx.lineTo(nx, ny + 15);
    ctx.lineTo(nx - 5, ny + 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  if (L >= 5) {
    const [x, y] = P(0, 0, h + 8);
    cross(ctx, x, y, 16);
  }
}

function nest(ctx: Ctx, L: number): void {
  const [x, y] = P(0, 0, 0);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(x, y, 14, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#9c7a4a';
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x, y - 9, 10, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#6b5131';
  ctx.lineWidth = 1.2;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.ellipse(x, y - 9 + i * 5, 9, 2.5, 0, 0, Math.PI);
    ctx.stroke();
  }
  ctx.fillStyle = '#1a1420';
  ctx.beginPath();
  ctx.arc(x, y - 6, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

const WALL_COLORS = ['#a8713c', '#bf5a3f', '#a34a3a', '#9aa0a8', '#c9a13a', '#2e63b8'];
const WALL_TOPS = ['#c99a62', '#d97a5f', '#c46a58', '#c4c9cf', '#f5c32c', '#f5c32c'];

/**
 * Walls change shape as well as colour:
 * 1 wooden fence posts, 2 brick, 3 brick with a stone cap, 4 stone block with a cap,
 * 5 gold-capped with a ball, 6 navy with gold battlements.
 */
function wall(ctx: Ctx, L: number, mask: number): void {
  const lv = Math.min(L, 6);
  const col = WALL_COLORS[lv - 1];
  const top = WALL_TOPS[lv - 1];
  const h = 16 + L * 2;
  const s = 0.28;
  const rail = lv === 1 ? h - 8 : h - 3;
  // connectors toward +u (mask&1) and +v (mask&2)
  if (mask & 2) box(ctx, -s * (lv === 1 ? 0.35 : 0.8), s, s * (lv === 1 ? 0.35 : 0.8), 1 - s, lv === 1 ? 6 : 0, rail, col, { top });
  if (mask & 1) box(ctx, s, -s * (lv === 1 ? 0.35 : 0.8), 1 - s, s * (lv === 1 ? 0.35 : 0.8), lv === 1 ? 6 : 0, rail, col, { top });
  box(ctx, -s, -s, s, s, 0, h, col, { top });
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  if (lv === 1) {
    // plank seam and a pointed post top
    line(ctx, P(0, s, 0), P(0, s, h));
    pyramid(ctx, -s, -s, s, s, h, 6, top);
  } else if (lv <= 3) {
    // brick courses
    for (const z of [h * 0.33, h * 0.66]) {
      line(ctx, P(-s, s, z), P(s, s, z));
      line(ctx, P(s, s, z), P(s, -s, z));
    }
  } else if (lv === 4) {
    // cut stone joints
    line(ctx, P(-s, s, h * 0.5), P(s, s, h * 0.5));
    line(ctx, P(0, s, 0), P(0, s, h * 0.5));
    line(ctx, P(s, s, h * 0.5), P(s, -s, h * 0.5));
  }
  if (lv >= 3) {
    // overhanging cap
    const c = s + 0.05;
    box(ctx, -c, -c, c, c, h, h + 3, lv >= 5 ? C.gold : lv === 4 ? '#dfe3e8' : C.stone);
  }
  if (lv === 5) {
    const [x, y] = P(0, 0, h + 5);
    ctx.fillStyle = C.gold;
    ctx.beginPath();
    ctx.arc(x, y, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  if (lv >= 6) {
    // battlements
    for (const [u, v] of [
      [-0.17, -0.17],
      [0.17, -0.17],
      [-0.17, 0.17],
      [0.17, 0.17],
    ]) box(ctx, u - 0.09, v - 0.09, u + 0.09, v + 0.09, h + 3, h + 8, C.gold);
  }
}

function lake(ctx: Ctx): void {
  const s = 0.98;
  poly(ctx, [P(-s, -s, 0), P(s, -s, 0), P(s, s, 0), P(-s, s, 0)], '#c9b98a', true, 2);
  const g = ctx.createLinearGradient(0, -30, 0, 30);
  g.addColorStop(0, '#5cc4f2');
  g.addColorStop(1, '#2a86c4');
  const r = 0.82;
  poly(ctx, [P(-r, -r, -2), P(r, -r, -2), P(r, r, -2), P(-r, r, -2)], g, true, 1.5);
  // ripples
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1.5;
  for (const [u, v, w] of [
    [-0.3, -0.2, 10],
    [0.35, 0.25, 7],
    [0.1, -0.5, 6],
  ] as [number, number, number][]) {
    const [x, y] = P(u, v, -2);
    ctx.beginPath();
    ctx.ellipse(x, y, w, w / 2, 0, 0, Math.PI);
    ctx.stroke();
  }
  // lily pad
  const [lx, ly] = P(0.4, -0.3, -1);
  ctx.fillStyle = '#4caf50';
  ctx.beginPath();
  ctx.ellipse(lx, ly, 6, 3, 0, 0.3, Math.PI * 2);
  ctx.lineTo(lx, ly);
  ctx.fill();
  // tiny bridge
  box(ctx, -0.95, -0.12, 0.95, 0.12, 4, 7, C.wood, { top: '#c99a62' });
  ctx.strokeStyle = C.woodDark;
  ctx.lineWidth = 1.5;
  const a = P(-0.95, 0.12, 13);
  const b = P(0.95, 0.12, 13);
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
}
