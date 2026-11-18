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
  const top = type === 'dmc' ? 240 : type === 'stinger' ? 112 : size === 1 ? 46 : size === 2 ? 80 : size === 3 ? 150 : 140;
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
  if (L >= 7) {
    // navy inner stripe just inside the gold edging
    const i = s - 0.08;
    ctx.strokeStyle = C.navy;
    ctx.lineWidth = 2;
    line(ctx, P(-i, i, 4), P(i, i, 4));
    line(ctx, P(i, i, 4), P(i, -i, 4));
  }
  if (L >= 8) {
    // gold-capped bollards at the three front corners
    for (const [u, v] of [
      [-s + 0.08, s - 0.08],
      [s - 0.08, s - 0.08],
      [s - 0.08, -s + 0.08],
    ]) box(ctx, u - 0.06, v - 0.06, u + 0.06, v + 0.06, 4, 11, C.navy, { top: C.gold });
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
  if (type !== 'wall' && type !== 'gate' && type !== 'lake' && type !== 'nest' && type !== 'firealarm') groundShadow(ctx, size);
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
      return biblicalCenter(ctx, L);
    case 'callan':
      return callan(ctx, L);
    case 'business':
      return businessCenter(ctx, L);
    case 'music':
      return academic(ctx, L, C.brick, '#b23a6f', 'MUSIC', 'note');
    case 'ens':
      return ens(ctx, L);
    case 'health':
      return healthCenter(ctx, L);
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
    case 'stinger':
      return stinger(ctx, L);
    case 'catapult':
      return catapult(ctx, L);
    case 'deans':
      return deans(ctx, L);
    case 'nest':
      return nest(ctx, L);
    case 'firealarm':
      return fireAlarm(ctx, L);
    case 'wall':
      return wall(ctx, L, variant);
    case 'gate':
      return gate(ctx, L, variant);
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
  const hh = 40; // entrance hall wall height
  const roof = hh + 4;
  const fd = 0.8; // depth of the hall's front wall

  // 1-2. blocks behind the hall
  if (L >= 1) {
    block45(ctx, L, rectPD(-1.0, -0.12, -0.92, -0.3), 4, 90, C.brick);
    frontGlass(ctx, -0.9, -0.24, -0.3, 52, 84, 4, 3);
    if (L >= 1) {
      const [fx, fy] = Q(-0.9, -0.82, 94);
      flag(ctx, fx, fy, 16, L >= 6 ? C.gold : C.roofBlue);
    }
  }
  if (L >= 1) {
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
  if (L >= 1) {
    panes(ctx, 'L', -1.36, 0.0, 1.56, 9, hh - 5, 3, 1, 2);
    panes(ctx, 'R', -1.36, 0.0, 1.56, 9, hh - 5, 3, 1, 3);
  } else {
    windowsL(ctx, -1.36, 0.0, 1.56, 8, hh - 4, 3, 1);
    windowsR(ctx, -1.36, 0.0, 1.56, 8, hh - 4, 3, 1);
  }

  // 4. stepped blocks standing on the hall roof
  if (L >= 1) {
    block45(ctx, L, rectPD(-1.14, -0.46, -0.2, 0.34), roof, roof + 21, C.brick);
    frontWindows(ctx, -1.06, -0.54, 0.34, roof + 6, roof + 16, 4, 1, 0, true);
    block45(ctx, L, rectPD(0.46, 1.14, -0.2, 0.3), roof, roof + 15, C.brick);
    frontWindows(ctx, 0.54, 1.06, 0.3, roof + 4, roof + 11, 3, 1, 0, true);
  }

  // 3. the tower: a square brick shaft with its corner toward the viewer
  if (L >= 1) {
    const th = 100 + L * 2;
    const u0 = -0.36;
    const u1 = 0.36;
    const v0 = -0.46;
    const v1 = 0.26;
    if (L < 1) {
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
      if (L >= 7) {
        // clock faces on both visible sides of the tower, under the slate cap
        const zc = th - drop - 12;
        const face = (pt: (a: number) => [number, number]): void => {
          const pts: [number, number][] = [];
          for (let k = 0; k < 16; k++) pts.push(pt((k / 16) * Math.PI * 2));
          poly(ctx, pts, L >= 8 ? C.gold : CREAM, true, 1.6);
          const [cx, cy] = pt(0);
          const [ox, oy] = pt(Math.PI);
          const mx = (cx + ox) / 2;
          const my = (cy + oy) / 2;
          ctx.strokeStyle = OUT;
          ctx.lineWidth = 1.4;
          line(ctx, [mx, my], [mx, my - 5]); // 12 o'clock
          line(ctx, [mx, my], [mx + 3, my + 1.5]); // ten past, as always
        };
        const vc = (v0 + v1) / 2;
        const uc = (u0 + u1) / 2;
        face((a) => P(u1, vc + Math.cos(a) * 0.17, zc + Math.sin(a) * 8));
        face((a) => P(uc + Math.cos(a) * 0.17, v1, zc + Math.sin(a) * 8));
      }
    }
    const [x, y] = P((u0 + u1) / 2, (v0 + v1) / 2, th + 18);
    const mast = 17;
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2.4;
    line(ctx, [x, y + 2], [x, y - mast - 6]);
    if (L >= 8) star5(ctx, x, y - mast, 9, C.gold);
    else {
      ctx.beginPath();
      ctx.arc(x, y - mast, 7.5, 0, Math.PI * 2);
      ctx.fillStyle = L >= 6 ? C.gold : '#f7f8f5';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (L >= 2 && L < 8) {
      // highlight on the ball
      ctx.beginPath();
      ctx.arc(x - 2, y - mast - 2, 1.8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fill();
    }
  }

  // a small lit block stepping down at the right front
  if (L >= 1) {
    block45(ctx, L, rectPD(0.52, 1.02, 0.3, 0.5), roof, roof + 8, C.brick);
    frontWindows(ctx, 0.58, 0.96, 0.5, roof + 1.5, roof + 6.5, 3, 1, 1, true);
  }

  // doors across the front of the hall
  if (L >= 1) frontGlass(ctx, -0.68, 0.68, fd, 5, hh - 19, 9, 1, 3);
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
  if (L >= 1) {
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
    const n = 6;
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
    const gt = Q(0, od, colTop + 12 + 9);
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
  if (L >= 1) {
    for (const s of [-1, 1]) {
      const [bu, bv] = at(s * 1.66, 0.14);
      shrub(ctx, bu, bv, L >= 3);
    }
  }
  if (L >= 1) {
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
  if (L >= 1) {
    for (const s of [-1, 1]) {
      const [lu, lv] = at(s * 1.0, 0.92);
      lamp(ctx, lu, lv, true);
    }
  }
  if (L >= 7) {
    // Commencement banners on poles at the ends of the forecourt
    for (const s of [-1, 1]) {
      const [x, y] = Q(s * 1.5, 0.95, 0);
      flag(ctx, x, y, 34, L >= 8 ? C.gold : C.navy);
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

// Reference-inspired campus buildings. All geometry stays inside the existing 3×3 lot;
// only rendering changes, never the footprint or any building stats.
const CAMPUS_BRICK = '#ce8050';
function campusBlock(ctx: Ctx, u0: number, v0: number, u1: number, v1: number, h: number, color = CAMPUS_BRICK): void {
  box(ctx, u0, v0, u1, v1, 4, h, color);
  ctx.strokeStyle = 'rgba(75,40,20,0.15)';
  ctx.lineWidth = 0.6;
  for (let z = 10; z < h - 3; z += 6) {
    line(ctx, P(u0, v1, z), P(u1, v1, z));
    line(ctx, P(u1, v1, z), P(u1, v0, z));
  }
  // Flat slate roof inside pale coping, characteristic of all four references.
  box(ctx, u0 - 0.025, v0 - 0.025, u1 + 0.025, v1 + 0.025, h, h + 3, CREAM_LIGHT);
  poly(ctx, [P(u0 + 0.06, v0 + 0.06, h + 3.1), P(u1 - 0.06, v0 + 0.06, h + 3.1),
    P(u1 - 0.06, v1 - 0.06, h + 3.1), P(u0 + 0.06, v1 - 0.06, h + 3.1)], SLATE, false);
}
function campusSteps(ctx: Ctx, u0: number, u1: number, v: number): void {
  for (let i = 0; i < 3; i++) box(ctx, u0, v - i * 0.09, u1, v + 0.27 - i * 0.09, 4, 5 + i * 2, CREAM);
}
function rooftopUnit(ctx: Ctx, u: number, v: number, h: number): void {
  box(ctx, u, v, u + 0.31, v + 0.25, h + 3, h + 9, '#b6b9bd');
  ctx.strokeStyle = '#565c66'; ctx.lineWidth = 0.7;
  for (let z = h + 5; z < h + 9; z += 1.4) line(ctx, P(u + 0.04, v + 0.25, z), P(u + 0.27, v + 0.25, z));
}
function campusGarden(ctx: Ctx, L: number): void {
  shrub(ctx, -1.22, 1.28, L >= 2);
  shrub(ctx, 1.28, 0.85, L >= 2);
  if (L >= 2) lamp(ctx, 1.3, 1.3, true);
}

function businessCenter(ctx: Ctx, L: number): void {
  site(ctx, L, 3);
  const h = 43 + Math.min(L, 4) * 3;
  campusBlock(ctx, -1.22, -1.08, 1.15, 0.91, h);
  // Long two-storey glazed facade between brick end wings.
  glassWall(ctx, 'L', -0.76, 0.73, 0.923, 10, h - 3, 8, 4);
  glassWall(ctx, 'R', -0.81, 0.55, 1.163, 12, h - 6, 5, 4);
  box(ctx, -0.8, 0.90, 0.78, 1.0, h - 1, h + 3, '#343b49');
  windowsL(ctx, -1.17, -0.83, 0.925, 12, h - 5, 2, 1);
  // Projecting glass entrance and a small roof terrace with dark railing.
  box(ctx, 0.12, 0.92, 0.91, 1.18, 5, 23, '#344554');
  glassWall(ctx, 'L', 0.17, 0.87, 1.193, 8, 22, 4, 2);
  box(ctx, 0.08, 0.88, 0.96, 1.23, 23, 26, '#454b59');
  ctx.strokeStyle = OUT; ctx.lineWidth = 1;
  line(ctx, P(0.1, 1.21, 32), P(0.94, 1.21, 32));
  for (let u = 0.1; u <= 0.95; u += 0.14) line(ctx, P(u, 1.21, 26), P(u, 1.21, 32));
  campusSteps(ctx, -0.65, -0.18, 1.05);
  door(ctx, -0.42, 0.94, 0.3, 15, C.navy);
  rooftopUnit(ctx, -0.6, -0.55, h);
  if (L >= 2) rooftopUnit(ctx, 0.45, -0.6, h);
  campusGarden(ctx, L);
  const [x, y] = P(-0.15, 0.94, h - 8);
  plaque(ctx, x, y, 'BUSINESS', 5.5);
}

function healthCenter(ctx: Ctx, L: number): void {
  site(ctx, L, 3);
  const h = 61 + Math.min(L, 3) * 3;
  campusBlock(ctx, -1.2, -1.15, 1.15, 0.88, h);
  panes(ctx, 'L', -1.09, -0.22, 0.9, 11, h - 5, 3, 3);
  panes(ctx, 'R', -1.02, 0.76, 1.17, 11, h - 6, 4, 3);
  // Pale projecting wing, with its three-storey glass corner and tall stairwell.
  campusBlock(ctx, -0.10, 0.28, 1.0, 1.12, h - 4, '#e9d8bb');
  glassWall(ctx, 'L', 0.04, 0.91, 1.133, 12, h - 10, 5, 6);
  glassWall(ctx, 'R', 0.35, 1.05, 1.013, 12, h - 10, 3, 6);
  campusBlock(ctx, -0.4, 0.65, -0.13, 0.98, h + 5, CREAM);
  glassWall(ctx, 'L', -0.36, -0.17, 0.994, 9, h + 2, 1, 8);
  // Broad stone spandrel above the sheltered doors.
  box(ctx, 0.01, 1.10, 0.95, 1.15, 24, 30, '#dfccb0');
  door(ctx, 0.52, 1.17, 0.32, 14, C.navy);
  campusSteps(ctx, 0.24, 0.80, 1.16);
  rooftopUnit(ctx, -0.65, -0.7, h);
  if (L >= 2) rooftopUnit(ctx, 0.25, -0.7, h);
  campusGarden(ctx, L);
  const [x, y] = P(0.5, 1.17, 27);
  plaque(ctx, x, y, 'HEALTH', 5.5);
}

function library(ctx: Ctx, L: number): void {
  site(ctx, L, 3);
  const h = 48 + Math.min(L, 8) * 3;
  campusBlock(ctx, -1.2, -1.15, 1.12, 0.75, h);
  // Centennial's tall recessed glass entrance, framed by a broad brick lintel.
  glassWall(ctx, 'L', -0.91, 0.12, 0.766, 9, h - 8, 5, 5);
  box(ctx, -1.08, 0.70, -0.92, 0.96, 4, h - 5, CAMPUS_BRICK);
  box(ctx, 0.13, 0.70, 0.29, 0.96, 4, h - 5, CAMPUS_BRICK);
  box(ctx, -1.09, 0.70, 0.30, 0.98, h - 9, h - 3, CAMPUS_BRICK);
  // Low right-hand reading wing with ribbon windows.
  campusBlock(ctx, 0.31, 0.35, 1.2, 1.11, h * 0.64);
  glassWall(ctx, 'L', 0.41, 1.1, 1.123, 13, 25, 5, 2);
  glassWall(ctx, 'R', 0.48, 1.01, 1.213, 13, 25, 3, 2);
  // Tiny books visible behind the glazed entrance, rather than a generic classical roof.
  for (let row = 0; row < 2; row++) {
    const z = 18 + row * 12;
    ctx.strokeStyle = CREAM; ctx.lineWidth = 1.4;
    line(ctx, P(-0.86, 0.78, z), P(-0.04, 0.78, z));
    for (let j = 0; j < 11; j++) {
      ctx.strokeStyle = ['#f5c32c', '#ce8050', '#355d7e'][j % 3]; ctx.lineWidth = 1.7;
      line(ctx, P(-0.84 + j * 0.073, 0.78, z + 1), P(-0.84 + j * 0.073, 0.78, z + 6));
    }
  }
  door(ctx, -0.2, 0.99, 0.28, 17, C.navy);
  campusSteps(ctx, -0.55, 0.08, 1.10);
  rooftopUnit(ctx, -0.25, -0.7, h);
  campusGarden(ctx, L);
  if (L >= 4) lamp(ctx, -1.25, 1.21, true);
  const [x, y] = P(0.77, 1.13, h * 0.64 - 8);
  plaque(ctx, x, y, 'LIBRARY', 5.5);
}

function biblicalCenter(ctx: Ctx, L: number): void {
  site(ctx, L, 3);
  const h = 46 + Math.min(L, 4) * 3;
  campusBlock(ctx, -1.2, -1.13, 1.15, 0.91, h);
  panes(ctx, 'L', -1.10, -0.63, 0.93, 12, h - 7, 2, 2);
  panes(ctx, 'R', -1.03, 0.79, 1.17, 12, h - 7, 4, 2);
  // Two-storey glazed portico and slim pale columns, like the BTS reference.
  glassWall(ctx, 'L', -0.52, 0.90, 0.94, 9, h - 3, 6, 4);
  campusSteps(ctx, -0.56, 0.93, 1.10);
  for (let u = -0.55; u < 1; u += 0.47) box(ctx, u - 0.035, 1.09, u + 0.035, 1.17, 9, h, '#d8d3c9');
  box(ctx, -0.63, 0.66, 0.99, 1.24, h, h + 5, '#e7ddce', { top: SLATE });
  door(ctx, 0.31, 0.96, 0.34, 17, C.navy);
  // Tall narrow stair glazing and rooftop lantern.
  campusBlock(ctx, -1.17, 0.61, -0.94, 0.99, h + 9, '#c1c1bf');
  glassWall(ctx, 'L', -1.13, -0.98, 1.003, 9, h + 5, 1, 8);
  box(ctx, -0.27, -0.58, 0.26, -0.08, h + 3, h + 13, CREAM);
  glassWall(ctx, 'L', -0.23, 0.22, -0.067, h + 5, h + 11, 3, 1);
  glassWall(ctx, 'R', -0.53, -0.12, 0.273, h + 5, h + 11, 2, 1);
  // A small reflecting strip inside the lot (not an extra occupied tile).
  poly(ctx, [P(-0.60, 1.36, 4.2), P(0.76, 1.36, 4.2), P(0.76, 1.45, 4.2), P(-0.60, 1.45, 4.2)], C.water, false);
  campusGarden(ctx, L);
  const [x, y] = P(-0.12, 1.25, h + 2);
  plaque(ctx, x, y, 'BIBLE', 5.5);
}

/** Two glazed circular floors under the Hive's broad yellow eaves. */
function hive(ctx: Ctx, L: number): void {
  site(ctx, L, 3, C.stone);
  const [x, y] = P(0, 0, 4);
  const tier = (r: number, base: number, h: number): void => {
    const ry = r * 0.48;
    ctx.fillStyle = '#263749'; ctx.strokeStyle = OUT; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y - base, r, ry, 0, 0, Math.PI);
    ctx.lineTo(x - r, y - base - h);
    ctx.ellipse(x, y - base - h, r, ry, 0, Math.PI, Math.PI * 2);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // Curved panes follow the facade; narrower at the sides.
    for (let i = 0; i < 12; i++) {
      const a = Math.PI * i / 12, b = Math.PI * (i + 1) / 12;
      const xa = x + Math.cos(a) * r, xb = x + Math.cos(b) * r;
      const ya = y - base + Math.sin(a) * ry, yb = y - base + Math.sin(b) * ry;
      poly(ctx, [[xa-1,ya-4],[xb+1,yb-4],[xb+1,yb-h+4],[xa-1,ya-h+4]], i === 6 ? '#263749' : i % 3 === 0 ? '#edac31' : '#ffc84f', true, 1.2);
      ctx.strokeStyle = '#354357'; ctx.lineWidth = 2;
      line(ctx,[xa,ya-h/2],[xb,yb-h/2]);
    }
    ctx.beginPath();ctx.ellipse(x,y-base-h,r+4,ry+2,0,0,Math.PI*2);
    ctx.fillStyle = '#ffd339';ctx.fill();ctx.strokeStyle=OUT;ctx.lineWidth=2;ctx.stroke();
    ctx.beginPath();ctx.ellipse(x,y-base-h-5,r-4,ry-3,0,0,Math.PI*2);
    ctx.fillStyle='#ffe46c';ctx.fill();ctx.stroke();
  };
  tier(57,0,37);
  tier(41,43,24);
  plaque(ctx,x,y-91,'THE HIVE',11);
  for (const u of [-0.8,-0.35,0.1,0.55]) shrub(ctx,u,1.25,false);
  tree(ctx,-1.22,0.35,0.65); tree(ctx,1.2,-0.35,0.65);
  if (L >= 2) lamp(ctx,-1.2,0.95,true);
}

/** Reference-inspired brick admissions hall, with a four-column pedimented entrance. */
function admissions(ctx: Ctx, L: number): void {
  site(ctx,L,3);
  tree(ctx,-1.23,0.35,0.66);tree(ctx,1.2,-0.45,0.65);
  const h=55;
  campusBlock(ctx,-1.05,-1.05,1.05,0.78,h);
  panes(ctx,'L',-0.95,0.95,0.79,31,47,4,1,0);
  panes(ctx,'R',-0.9,0.65,1.06,12,47,3,2,0);
  entry(ctx,2,0,0.8,0.5,25,C.navy);
  campusSteps(ctx,-0.73,0.73,1.05);
  colonnade(ctx,-0.7,0.7,0.8,0.42,35,4);
  box(ctx,-0.8,1.15,0.8,1.28,35,48,CREAM);
  poly(ctx,[P(-0.84,1.29,48),P(0.84,1.29,48),P(0,1.29,66)],CREAM,true,2);
  poly(ctx,[P(-0.62,1.3,50),P(0.62,1.3,50),P(0,1.3,62)],'#d7a373',true,1);
  const [x,y]=P(0,1.3,41);
  plaque(ctx,x,y,'ADMISSIONS',7,true);
  shrub(ctx,1.15,0.9,false);
  if(L>=2) lamp(ctx,-1.12,1.1,true);
}

function coffeeCart(ctx: Ctx, L: number): void {
  site(ctx, L, 3, '#a5a7a8');
  tree(ctx,1.15,-0.9,0.65);
  shrub(ctx,-1.15,0.2,false);
  // cart body
  box(ctx, -0.8, -0.5, 0.8, 0.6, 12, 34, '#c89d70');
  poly(ctx, [P(-0.8, 0.6, 14), P(0.8, 0.6, 14), P(0.8, 0.6, 30), P(-0.8, 0.6, 30)], '#d5b187', true);
  // Narrow wooden slats and a dark espresso counter wrap both visible sides.
  ctx.strokeStyle='#76583e';ctx.lineWidth=0.8;
  for(let i=0;i<18;i++){const u=-0.76+i*1.52/17;line(ctx,P(u,0.61,14),P(u,0.61,32));}
  for(let i=0;i<12;i++){const v=-0.46+i*1.02/11;line(ctx,P(0.81,v,14),P(0.81,v,32));}
  box(ctx,-0.84,-0.54,0.84,0.64,33,36,'#292c30');
  box(ctx,-0.83,0.6,0.83,0.65,12,15,'#e4c39b');
  // wheels
  for (const u of [-0.5, 0.5]) {
    const [x, y] = P(u, 0.62, 10);
    ctx.beginPath();
    ctx.arc(x, y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#883d51';
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#aaa';
    ctx.beginPath();
    ctx.arc(x, y, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  // espresso machine
  box(ctx,-0.6,-0.3,-0.08,0.12,36,49,'#c0c6cc');
  box(ctx,0.25,-0.23,0.66,0.15,36,45,'#c7ccd0');
  // Machine display, dispensing heads and stacked takeaway cups.
  poly(ctx,[P(-0.53,0.13,44),P(-0.2,0.13,44),P(-0.2,0.13,47),P(-0.53,0.13,47)],'#35494d',true,0.8);
  for(const u of [-0.48,-0.26]) cylinder(ctx,u,0.25,0.055,36,4,'#f5e7ce','#6c4730');
  for(const u of [0.18,0.68]) cylinder(ctx,u,0.39,0.055,36,7,'#e9d8be','#fff2de');
  // umbrella
  const [ux, uy] = P(0, 0, 48);
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(ux, uy);
  ctx.lineTo(ux, uy - 30);
  ctx.stroke();
  const ur = 58;
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
  // Round gold Rinnova badge on the wood-slat face.
  const [cx,cy]=P(-0.2,0.62,24);
  ctx.beginPath();ctx.ellipse(cx,cy,12,10,0.45,0,Math.PI*2);
  ctx.fillStyle='#e7ad31';ctx.fill();ctx.strokeStyle='#fff1b2';ctx.lineWidth=1.6;ctx.stroke();
  ctx.save();ctx.translate(cx,cy);ctx.transform(1,0.5,0,1,0,0);
  ctx.fillStyle='#fff4c8';ctx.font='700 4.8px system-ui,sans-serif';ctx.textAlign='center';ctx.fillText('RINNOVA',0,1);ctx.restore();
  if (L >= 1) {
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
  if (L >= 1) {
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
    // plaza umbrellas: one over the table, a second set at Lv5
    const brolly = (bx: number, by: number, a: string, b: string): void => {
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 1.8;
      line(ctx, [bx, by - 11], [bx, by - 30]);
      for (let i = 0; i < 4; i++) {
        const a0 = Math.PI + (i * Math.PI) / 4;
        const a1 = Math.PI + ((i + 1) * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(bx, by - 36);
        ctx.lineTo(bx + Math.cos(a0) * 20, by - 26 + Math.sin(a0) * 3 + 3);
        ctx.lineTo(bx + Math.cos(a1) * 20, by - 26 + Math.sin(a1) * 3 + 3);
        ctx.closePath();
        ctx.fillStyle = i % 2 ? a : b;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    };
    brolly(tx, ty, C.gold, C.roofBlue);
    if (L >= 1) {
      const [t2x, t2y] = P(0.15, 1.2, 4);
      line(ctx, [t2x, t2y], [t2x, t2y - 10]);
      ctx.beginPath();
      ctx.ellipse(t2x, t2y - 11, 9, 4.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = C.white;
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.stroke();
      brolly(t2x, t2y, C.roofBlue, C.gold);
    }
  }
  if (L >= 1) {
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

/** Brick cafe, cream cornice, warm shopfront and navy/gold patio umbrella. */
function rinnova(ctx: Ctx, L: number): void {
  site(ctx,L,3);
  // Keep this main tank's position and height in sync with the existing live fill gauge.
  const h=30+L*4;
  cylinder(ctx,-0.72,-0.95,0.4,4,h+10+L*3,'#c8ccd2','#9aa0a8');
  cylinder(ctx,0.1,-0.9,0.62,4,h+22+L*3,'#c8ccd2','#9aa0a8');
  shrub(ctx,-1.2,0.25,false);
  campusBlock(ctx,-1.1,-0.35,1.05,0.85,h);
  // Tall amber shop windows, with a double glass door in the middle.
  panes(ctx,'L',-0.98,0.93,0.86,6,h-5,5,1,1);
  for(const u of [-0.04,0.15]) {
    poly(ctx,[P(u,0.88,7),P(u+0.14,0.88,7),P(u+0.14,0.88,h-12),P(u,0.88,h-12)],'#ffd477',true,1.3);
  }
  ctx.strokeStyle='#dce2e5';ctx.lineWidth=1.6;
  for(const u of [0.08,0.17]) line(ctx,P(u,0.9,12),P(u,0.9,19));
  panes(ctx,'R',-0.18,0.65,1.06,10,h-9,2,2,1);
  for(const [u,v] of [[-1.1,0.8],[0.96,0.8],[0.96,-0.35]]) box(ctx,u,v,u+0.1,v+0.1,4,h,CREAM);
  // Dark fascia replaces the old red-striped awning.
  box(ctx,-1.06,0.9,1,1.01,h-1,h+12,'#353e47');
  const [sx,sy]=P(0,1.02,h+5);
  ctx.fillStyle='#d5b85d';ctx.font='700 9px "Trebuchet MS",system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.save();ctx.translate(sx,sy);ctx.transform(1,0.5,0,1,0,0);ctx.fillText('RINNOVA',0,0);ctx.restore();ctx.textBaseline='alphabetic';
  // Vent and restrained steam, kept within the original sprite bounds.
  cylinder(ctx,0.55,0.1,0.1,h+4,5,'#bbc1c7','#40434a');
  const [vx,vy]=P(0.55,0.1,h+10);
  ctx.fillStyle='rgba(255,255,255,0.75)';
  for(const [dx,dy,r] of [[0,-2,3],[3,-8,4],[1,-15,4]]) {ctx.beginPath();ctx.arc(vx+dx,vy+dy,r,0,Math.PI*2);ctx.fill();}
  shrub(ctx,1.2,0.15,false);
  // Small bistro setting sits inside the existing three-tile lot.
  const [tx,ty]=P(0.45,1.3,4);
  ctx.strokeStyle=OUT;ctx.lineWidth=2;
  line(ctx,[tx,ty],[tx,ty-25]);
  ctx.beginPath();ctx.ellipse(tx,ty-6,9,4,0,0,Math.PI*2);ctx.fillStyle='#a58b62';ctx.fill();ctx.stroke();
  for(const dx of [-12,12]){
    ctx.fillStyle='#8e7150';ctx.fillRect(tx+dx-3,ty-11,6,7);ctx.strokeRect(tx+dx-3,ty-11,6,7);
    line(ctx,[tx+dx-3,ty-4],[tx+dx-3,ty+3]);line(ctx,[tx+dx+3,ty-4],[tx+dx+3,ty+3]);
  }
  for(let i=0;i<6;i++){
    const a=i*Math.PI/3,b=(i+1)*Math.PI/3;
    poly(ctx,[[tx,ty-30],[tx+Math.cos(a)*15,ty-21+Math.sin(a)*6],[tx+Math.cos(b)*15,ty-21+Math.sin(b)*6]],i%2?'#e6bb58':'#27567e',true,1.2);
  }
}

/** Residence hall: a long slate-roofed hall with gabled bays on the front, taller with each upgrade. */
function reshall(ctx: Ctx, L: number): void {
  site(ctx, L, 4);
  tree(ctx,-1.72,1.1,0.7);
  const floors = 3 + (L >= 5 ? 1 : 0);
  const h = 14 + floors * 15;
  walls(ctx, 2, -1.7, -1.4, 1.6, 1.2, 4, h, C.brick);
  if (L >= 1) {
    panes(ctx, 'L', -0.55, 0.45, 1.2, 8, h - 4, 2, floors);
    panes(ctx, 'R', -1.3, 1.1, 1.6, 8, h - 4, 4, floors);
  } else {
    windowsL(ctx, -1.6, 1.5, 1.2, 8, h - 4, 6, floors);
    windowsR(ctx, -1.3, 1.1, 1.6, 8, h - 4, 4, floors);
  }
  trim(ctx, L, -1.7, -1.4, 1.6, 1.2, h);
  gable(ctx, -1.8, -1.5, 1.7, 1.3, h, 22, SLATE);
  box(ctx,-0.1,-0.2,0.2,0.1,h+16,h+25,CREAM);
  if (L >= 1) {
    // gabled bays standing proud of the front
    for (const [a, b] of [
      [-1.55, -0.65],
      [0.55, 1.45],
    ]) {
      walls(ctx, 2, a, 1.2, b, 1.42, 4, h, C.brick);
      glassWall(ctx, 'L', a + 0.13, b - 0.13, 1.43, 7, h - 2, 2, floors * 2);
      box(ctx,a+0.09,1.44,a+0.14,1.46,5,h,CREAM);
      box(ctx,b-0.14,1.44,b-0.09,1.46,5,h,CREAM);
      gable(ctx, a - 0.07, 1.0, b + 0.07, 1.48, h, 17, SLATE, 'v');
      poly(ctx, [P(a - 0.07, 1.48, h), P(b + 0.07, 1.48, h), P((a + b) / 2, 1.48, h + 17)], CREAM, true, 1.8);
      poly(ctx,[P(a+0.12,1.49,h+3),P(b-0.12,1.49,h+3),P((a+b)/2,1.49,h+13)],'#3b4350',true,1);

    }
  }
  entry(ctx, L, -0.05, 1.2, 0.5, 16, C.navy);
  if (L >= 1) {
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
  tree(ctx,1.75,0.4,0.65);
  shrub(ctx,0.8,1.72,false);
}

function academic(ctx: Ctx, L: number, wallColor: string, accent: string, label: string, icon: 'book' | 'plus' | 'coin' | 'note'): void {
  site(ctx, L, 3);
  const h = 32 + L * 6;
  walls(ctx, L, -1.15, -1.15, 1.1, 1.05, 4, h, wallColor);
  if (L >= 2) {
    // a glass wall to the left of the door, framed windows to the right and down the side
    glassWall(ctx, 'L', -1.02, -0.36, 1.05, 8, h - 11, 3, 2);
    panes(ctx, 'L', 0.36, 1.0, 1.05, 8, h - 11, 2, 2, 2);
    panes(ctx, 'R', -1.05, 0.95, 1.1, 8, h - 11, 3, 2);
    // the building's colour, as a band under the roofline
    poly(ctx, [P(-1.15, 1.05, h - 9), P(1.1, 1.05, h - 9), P(1.1, 1.05, h - 4), P(-1.15, 1.05, h - 4)], accent, true, 1.4);
    poly(ctx, [P(1.1, 1.05, h - 9), P(1.1, -1.15, h - 9), P(1.1, -1.15, h - 4), P(1.1, 1.05, h - 4)], shade(accent, -0.25), true, 1.4);
  } else {
    windowsL(ctx, -1.05, 1.0, 1.05, 8, h - 6, 4, 2);
    windowsR(ctx, -1.05, 0.95, 1.1, 8, h - 6, 3, 2);
  }
  trim(ctx, L, -1.15, -1.15, 1.1, 1.05, h);
  flatRoof(ctx, L, -1.15, -1.15, 1.1, 1.05, h);
  entry(ctx, L, 0, 1.05, 0.45, 16, shade(accent, -0.2));
  if (L >= 2) {
    // accent canopy over the door
    poly(ctx, [P(-0.34, 1.05, 23), P(0.34, 1.05, 23), P(0.34, 1.3, 16), P(-0.34, 1.3, 16)], accent, true, 1.5);
  }
  // the emblem stands on the roof edge above the door, on a short post
  {
    const [bx, by] = P(0, 1.1, h + (L >= 2 ? 5 : 3));
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2;
    line(ctx, [bx, by], [bx, by - 6]);
  }
  const [x, y] = P(0, 1.1, h + (L >= 2 ? 17 : 15));
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
  levelFlags(ctx, L, 1.05, 1.0, h + 5);
  grounds(ctx, L, 3);
  const [sx, sy] = P(0, 1.05, 30);
  plaque(ctx, sx, sy, label, 7);
}

function callan(ctx: Ctx, L: number): void {
  site(ctx, L, 3);
  const h = 30 + L * 5;
  walls(ctx, L, -1.2, -1.2, 1.15, 1.1, 4, h, C.brick);
  if (L >= 2) {
    // glass entrance in the middle, framed windows either side
    glassWall(ctx, 'L', -0.42, 0.42, 1.1, 5, h - 15, 4, 2);
    panes(ctx, 'L', -1.12, -0.52, 1.1, 9, h - 15, 2, 1, 2);
    panes(ctx, 'L', 0.52, 1.08, 1.1, 9, h - 15, 2, 1, 2);
    panes(ctx, 'R', -1.1, 1.0, 1.15, 9, h - 12, 4, 1);
  } else windowsL(ctx, -1.1, 1.05, 1.1, 10, h - 8, 4, 1, '#ffe08a');
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
  const [sx, sy] = P(0, 1.1, h - 8);
  plaque(ctx, sx, sy, 'CALLAN', 8);
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
  walls(ctx, L, -1.15, -1.15, 1.1, 1.05, 4, h, L >= 2 ? C.brick : '#7d8a99');
  if (L >= 2) {
    // glass on both faces, with a brick pier at the corner and a door bay
    glassWall(ctx, 'L', -1.02, -0.3, 1.05, 8, h - 6, 3, 3);
    glassWall(ctx, 'L', 0.3, 0.98, 1.05, 20, h - 6, 3, 2);
    glassWall(ctx, 'R', -1.02, 0.9, 1.1, 8, h - 6, 5, 3);
    door(ctx, 0.64, 1.05, 0.4, 14, '#27314f');
    flatRoof(ctx, L, -1.15, -1.15, 1.1, 1.05, h, false);
  } else {
    windowsL(ctx, -1.05, 1.0, 1.05, 6, h - 4, 5, 3, '#a9e4ff');
    windowsR(ctx, -1.05, 0.95, 1.1, 6, h - 4, 3, 3, '#a9e4ff');
    box(ctx, -1.15, -1.15, 1.1, 1.05, h, h + 5, '#4b5563');
  }
  if (L >= 2) {
    // rooftop telescope dome, behind the gear
    dome(ctx, -0.62, -0.62, 0.28, h + 5, '#c8ccd2');
  }
  // gear on roof
  const [x, y] = P(L >= 2 ? 0.45 : 0, L >= 2 ? 0.45 : 0, h + 5);
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
  const [sx, sy] = P(0, 1.05, 16);
  plaque(ctx, sx, sy, 'ENS', 9);
  levelFlags(ctx, L, 1.05, 1.0, h + 5);
  grounds(ctx, L, 3);
}

function ssc(ctx: Ctx, L: number): void {
  site(ctx, L, 3);
  const h = 28 + L * 6;
  cylinder(ctx, 0, 0, 1.15, 4, h, C.brick, shade(C.brick, 0.1));
  windowsDots(ctx, h);
  if (L >= 2) {
    // cream ring where the drum meets the dome
    const [rx0, ry0] = P(0, 0, h);
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(rx0, ry0, 1.15 * 45, 1.15 * 22.5, 0, 0, Math.PI);
    ctx.stroke();
    ctx.strokeStyle = CREAM;
    ctx.lineWidth = 2.6;
    ctx.stroke();
  }
  // ribbed glass dome (pink while it was a shed of a lab)
  dome(ctx, 0, 0, 0.8, h, L >= 2 ? '#bfe3f2' : '#ff6fb5');
  if (L >= 2) {
    const [dx, dy] = P(0, 0, h);
    const r = 0.8 * 45;
    ctx.strokeStyle = 'rgba(30,27,43,0.55)';
    ctx.lineWidth = 1.3;
    for (const k of [0.36, 0.72]) {
      ctx.beginPath();
      ctx.ellipse(dx, dy, r * k, r * 0.95, 0, Math.PI, 0);
      ctx.stroke();
    }
    line(ctx, [dx, dy], [dx, dy - r * 0.95]);
    ctx.beginPath();
    ctx.ellipse(dx, dy - r * 0.42, r * 0.9, r * 0.2, 0, 0, Math.PI);
    ctx.stroke();
  }
  // bubbling vial
  const [x, y] = P(0, 0, h + 30);
  ctx.fillStyle = 'rgba(255,111,181,0.9)';
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  const [sx, sy] = P(0, 1.15, 14);
  plaque(ctx, sx, sy, 'BREW LAB', 8);
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
  panes(ctx, 'L', -1.0, 0.5, 0.4, 8, h - 6, 2, 1, 2);
  panes(ctx, 'R', -1.05, 0.3, 0.6, 8, h - 6, 2, 1);
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
  const [sx, sy] = P(-0.72, 0.4, 9);
  plaque(ctx, sx, sy, 'FACULTY', 7);
}

/**
 * Dean's Office: a stately brick hall with a white portico and an inbox the size of a door.
 * It only exists at DMC 8, so it starts high on the level ladder (Lv1 dresses like a Lv6).
 */
function deans(ctx: Ctx, L: number): void {
  const T = L + 5;
  site(ctx, T, 3);
  const h = 40 + L * 4;
  walls(ctx, T, -1.15, -1.15, 1.05, 0.7, 4, h, C.brick);
  panes(ctx, 'R', -1.0, 0.55, 1.05, 12, h - 8, 3, 2, 2);
  panes(ctx, 'L', -1.05, -0.62, 0.7, 12, h - 8, 1, 2, 1);
  panes(ctx, 'L', 0.62, 0.98, 0.7, 12, h - 8, 1, 2, 3);
  trim(ctx, T, -1.15, -1.15, 1.05, 0.7, h);
  gable(ctx, -1.22, -1.22, 1.12, 0.78, h, 24, C.roofBlue);
  // portico: steps, four fat white columns and a cream pediment with the office seal
  box(ctx, -0.58, 0.7, 0.58, 1.3, 4, 9, C.stone);
  for (let i = 0; i < 4; i++) {
    const u = -0.42 + i * 0.28;
    box(ctx, u - 0.08, 1.06, u + 0.08, 1.2, 9, h - 6, '#f8f6f0');
  }
  box(ctx, -0.6, 0.7, 0.6, 1.26, h - 6, h, CREAM);
  poly(ctx, [P(-0.6, 1.26, h), P(0.6, 1.26, h), P(0, 1.26, h + 16)], CREAM, true, 1.8);
  const [sx, sy] = P(0, 1.26, h + 6);
  ctx.beginPath();
  ctx.arc(sx, sy, 4.2, 0, Math.PI * 2);
  ctx.fillStyle = L >= 2 ? C.gold : C.red;
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  const [px, py] = P(0, 1.26, h - 3);
  plaque(ctx, px, py, "DEAN'S OFFICE", 6);
  // a teetering stack of summons slips on the lawn, taller every level
  const top = 4 + 6 + L * 5;
  box(ctx, 0.72, 0.98, 1.0, 1.22, 4, top, '#ffffff', { top: '#ffd1e0' });
  ctx.strokeStyle = 'rgba(30,27,43,0.3)';
  ctx.lineWidth = 0.8;
  for (let z = 7; z < top - 1; z += 2.5) {
    line(ctx, P(0.72, 1.22, z), P(1.0, 1.22, z));
    line(ctx, P(1.0, 1.22, z), P(1.0, 0.98, z));
  }
  if (L >= 3) {
    const [fx, fy] = P(-1.05, -1.05, h + 2);
    flag(ctx, fx, fy, 30, C.gold);
  }
}

function presidents(ctx: Ctx, L: number): void {
  pad(ctx, 3, '#d6e8c8');
  const h = 40;
  box(ctx, -1.15, -1.15, 1.1, 0.8, 4, h, C.white);
  panes(ctx, 'L', -1.05, 1.0, 0.8, 8, h - 6, 4, 2, 2);
  panes(ctx, 'R', -1.0, 0.65, 1.1, 10, h - 8, 3, 1, 1);
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
  if (L >= 2) {
    panes(ctx, 'L', -s + 0.12, s - 0.12, s, h * 0.42, h * 0.74, 1, 1, 1);
    panes(ctx, 'R', -s + 0.12, s - 0.12, s, h * 0.42, h * 0.74, 1, 1, 0);
  } else windowsL(ctx, -s + 0.1, s - 0.1, s, h * 0.4, h * 0.7, 1, 1, '#ffe9a8');
  // platform
  box(ctx, -0.85, -0.85, 0.85, 0.85, h, h + 6, L >= 2 ? CREAM : C.wood);
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
  plaque(ctx, sx, sy, 'RA', 9);
  if (L >= 2) {
    // a hip roof over the lookout
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
  // Enclosed campus-security SUV. Keep the original footprint and light-bar
  // anchor so thumbnails, village art and raid effects share the same vehicle.
  const body = '#272d39';
  const trim = '#aab3c1';
  box(ctx, -1.02, -0.48, 1.02, 0.48, 12, 29, body);
  // Sloping windshield, tall cabin and short hood (front is +u).
  poly(ctx, [P(-0.98, 0.48, 29), P(0.5, 0.48, 29), P(0.2, 0.42, 49), P(-0.82, 0.42, 49)], body);
  poly(ctx, [P(0.5, -0.48, 29), P(0.5, 0.48, 29), P(0.2, 0.42, 49), P(0.2, -0.42, 49)], '#18354c');
  poly(ctx, [P(-0.82, -0.42, 49), P(0.2, -0.42, 49), P(0.2, 0.42, 49), P(-0.82, 0.42, 49)], '#3b4352');
  // Window openings and thick pillars read clearly at the normal game scale.
  for (const [u0, u1] of [[-0.83, -0.48], [-0.42, -0.07], [-0.01, 0.27]]) {
    poly(ctx, [P(u0, 0.485, 32), P(u1, 0.485, 32), P(Math.min(u1, 0.16), 0.43, 46), P(u0 + 0.05, 0.43, 46)], '#20445e', true, 1.4);
  }
  poly(ctx, [P(0.47, -0.38, 32), P(0.47, 0.38, 32), P(0.23, 0.34, 45), P(0.23, -0.34, 45)], '#295672', true, 1.2);
  poly(ctx, [P(0.46, -0.3, 33), P(0.46, -0.12, 33), P(0.24, 0.2, 44), P(0.24, 0.03, 44)], 'rgba(154,210,237,0.22)', false);
  // White side sweep, door seams and handles.
  poly(ctx, [P(-0.98, 0.5, 29), P(0.48, 0.5, 29), P(0.76, 0.5, 25), P(-0.98, 0.5, 25)], C.white, false);
  ctx.strokeStyle = '#697585'; ctx.lineWidth = 0.8;
  for (const u of [-0.44, 0.01, 0.46]) line(ctx, P(u, 0.505, 14), P(u, 0.505, 30));
  ctx.strokeStyle = trim; ctx.lineWidth = 1.5;
  for (const u of [-0.36, 0.1]) line(ctx, P(u, 0.515, 28), P(u + 0.12, 0.515, 28));
  // Side lettering follows the body perspective; no external logo assets.
  const [tx, ty] = P(-0.84, 0.52, 21);
  ctx.save(); ctx.translate(tx, ty); ctx.transform(1, 0.5, 0, 1, 0, 0);
  ctx.fillStyle = C.white; ctx.font = 'bold 5px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('SECURITY', 0, 0);
  ctx.font = 'bold 2.6px sans-serif'; ctx.fillText('CEDARVILLE', 0, 4);
  ctx.restore();
  const [bx, by] = P(0.29, 0.52, 21);
  poly(ctx, [[bx - 3, by - 5], [bx + 3, by - 2], [bx + 3, by + 3], [bx, by + 5], [bx - 3, by + 1]], C.navy, true, 0.8);
  star5(ctx, bx, by, 2.2, C.gold);
  // Wide front grille, bright headlights and a protective push bar.
  poly(ctx, [P(1.035, -0.29, 17), P(1.035, 0.29, 17), P(1.035, 0.29, 26), P(1.035, -0.29, 26)], '#111722', true, 1);
  ctx.strokeStyle = trim; ctx.lineWidth = 1;
  for (const z of [19, 22, 25]) line(ctx, P(1.04, -0.25, z), P(1.04, 0.25, z));
  for (const v of [-0.47, 0.31]) {
    poly(ctx, [P(1.04, v, 22), P(1.04, v + 0.16, 22), P(1.04, v + 0.16, 28), P(1.04, v, 28)], '#f7f0c8', true, 1);
  }
  ctx.strokeStyle = '#0f1620'; ctx.lineWidth = 3;
  for (const v of [-0.25, 0.25]) line(ctx, P(1.09, v, 12), P(1.09, v, 26));
  line(ctx, P(1.09, -0.32, 16), P(1.09, 0.32, 16));
  // Red rear lamp, side mirror and silver roof rails.
  poly(ctx, [P(-0.99, 0.51, 21), P(-0.87, 0.51, 21), P(-0.87, 0.51, 31), P(-0.99, 0.51, 31)], C.red, true, 0.8);
  box(ctx, 0.3, 0.47, 0.46, 0.65, 31, 35, body);
  ctx.strokeStyle = trim; ctx.lineWidth = 1.5;
  for (const v of [-0.35, 0.35]) line(ctx, P(-0.76, v, 51), P(0.14, v, 51));
  // Two chunky tires with silver hubs and five spokes.
  for (const u of [-0.68, 0.68]) {
    const [x, y] = P(u, 0.52, 12);
    ctx.save(); ctx.translate(x, y); ctx.transform(1, 0.5, 0, 1, 0, 0);
    ctx.beginPath(); ctx.ellipse(0, 0, 7.5, 10, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#141923'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 0, 4.7, 6.8, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#697585'; ctx.fill(); ctx.strokeStyle = trim; ctx.lineWidth = 1.4; ctx.stroke();
    for (let i = 0; i < 5; i++) {
      const t = i * Math.PI * 2 / 5;
      line(ctx, [0, 0], [Math.cos(t) * 4, Math.sin(t) * 6]);
    }
    ctx.restore();
  }
  box(ctx, -0.3, -0.25, 0.1, 0.25, 50, 54, '#151e2b');
  box(ctx, -0.28, -0.24, 0.08, -0.04, 54, 58, C.roofBlue);
  box(ctx, -0.28, 0.04, 0.08, 0.24, 54, 58, '#5799ee');
  if (L >= 3) {
    ctx.strokeStyle = OUT; ctx.lineWidth = 1;
    line(ctx, P(-0.68, -0.28, 50), P(-0.68, -0.28, 58));
  }

}

/** Cedar Sprayer: a circular stone basin with jets; existing defense logic is untouched. */
function sprayer(ctx: Ctx, L: number): void {
  site(ctx,L,3,CREAM);
  cylinder(ctx,0,0,1.08,4,14,'#bcb6b0',CREAM_LIGHT);
  const [x,y]=P(0,0,18);
  ctx.beginPath();ctx.ellipse(x,y,40,20,0,0,Math.PI*2);
  ctx.fillStyle='#158aca';ctx.fill();ctx.strokeStyle=OUT;ctx.lineWidth=2;ctx.stroke();
  ctx.beginPath();ctx.ellipse(x,y+1,35,16,0,0,Math.PI*2);
  ctx.fillStyle='#21c5f5';ctx.fill();
  ctx.strokeStyle='rgba(235,253,255,0.9)';ctx.lineWidth=1.7;
  for(const r of [12,20,28]) {
    ctx.beginPath();ctx.ellipse(x,y+1,r,r*0.46,0,0,Math.PI*2);ctx.stroke();
  }
  // A cluster of luminous vertical jets replaces the old mechanical sprinkler.
  for(const [dx,hh] of [[-8,30],[8,33],[-4,43],[4,45],[0,51]]) {
    ctx.beginPath();ctx.moveTo(x+dx,y-2);ctx.quadraticCurveTo(x+dx*0.8,y-hh,x+dx*0.6,y-hh);
    ctx.strokeStyle='#64ddff';ctx.lineWidth=5;ctx.lineCap='round';ctx.stroke();
    ctx.strokeStyle='#efffff';ctx.lineWidth=2;ctx.stroke();
  }
  ctx.lineCap='butt';
  for(const [dx,dy,r] of [[0,-50,4],[-3,-45,3],[4,-42,3]]) {
    ctx.beginPath();ctx.arc(x+dx,y+dy,r,0,Math.PI*2);ctx.fillStyle='#f3ffff';ctx.fill();
  }
}

/** Stone Bible professor tower; the live professor stays at the original platform height. */
function bibleProf(ctx: Ctx, L: number): void {
  site(ctx,L,3,'#a0a4a6');
  const h=48+L*6; // world.ts positions the praying professor at exactly this height
  walls(ctx,3,-0.68,-0.68,0.68,0.68,4,h,'#94948c');
  // Broad, staggered masonry courses on both faces.
  ctx.strokeStyle='#555650';ctx.lineWidth=1;
  for(let z=10,row=0;z<h-4;z+=7,row++) {
    line(ctx,P(-0.68,0.69,z),P(0.68,0.69,z));line(ctx,P(0.69,-0.68,z),P(0.69,0.68,z));
    const k=row%2?0.28:-0.28;
    line(ctx,P(k,0.69,z),P(k,0.69,z+7));line(ctx,P(0.69,k,z),P(0.69,k,z+7));
  }
  // Wooden rooftop deck and pale square battlements.
  box(ctx,-0.8,-0.8,0.8,0.8,h-3,h,'#8a7050');
  for(const k of [-0.67,-0.22,0.23,0.68]) {
    box(ctx,k-0.1,-0.8,k+0.1,-0.62,h,h+7,'#b6b6ad');
    box(ctx,-0.8,k-0.1,-0.62,k+0.1,h,h+7,'#b6b6ad');
  }
  // Faceted inset crystal, like the large angular stone in the supplied tower.
  const [x,y]=P(0,0.7,h*0.63);
  const outer:[number,number][]=[[x-17,y-11],[x-4,y-21],[x+14,y-14],[x+11,y+7],[x+3,y+21],[x-9,y+5]];
  poly(ctx,outer,'#525b6c',true,1.8);
  const inner:[number,number][]=[[x-8,y-7],[x+1,y-12],[x+8,y-7],[x+6,y+4],[x-2,y+7],[x-8,y+1]];
  for(let i=0;i<6;i++) poly(ctx,[outer[i],outer[(i+1)%6],inner[(i+1)%6],inner[i]],['#7f8b9e','#adb6c1','#737e91','#9da9bc','#637086','#bbc3ce'][i],true,0.8);
  poly(ctx,inner,'#7b795f',true,1);
  ctx.fillStyle='#fff4af';
  for(const [dx,dy] of [[-3,-5],[2,-3],[-2,2],[4,3]]) {ctx.beginPath();ctx.arc(x+dx,y+dy,1.1,0,Math.PI*2);ctx.fill();}
  // Recessed riveted door and small cream arch.
  const [dx,dy]=P(-0.18,0.71,5);
  ctx.fillStyle='#45454c';ctx.strokeStyle=OUT;ctx.lineWidth=1.5;
  ctx.beginPath();ctx.moveTo(dx-5,dy);ctx.lineTo(dx-5,dy-10);ctx.arc(dx,dy-10,5,Math.PI,0);ctx.lineTo(dx+5,dy);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.strokeStyle='#b8b7aa';ctx.lineWidth=2;ctx.beginPath();ctx.arc(dx,dy-10,6,Math.PI,0);ctx.stroke();
  ctx.fillStyle='#a8a9a7';for(const xx of [-3,2])for(const yy of [-3,-7,-11])ctx.fillRect(dx+xx,dy+yy,1,1);
  // Ladder on the side leads onto the same active platform.
  ctx.strokeStyle='#373b3e';ctx.lineWidth=1.5;
  for(const v of [-0.4,-0.18]) line(ctx,P(0.72,v,h-20),P(0.72,v,h));
  for(let z=h-19;z<h;z+=3)line(ctx,P(0.73,-0.4,z),P(0.73,-0.18,z));
  for(const k of [-0.67,-0.22,0.23,0.68]) {
    box(ctx,k-0.1,0.62,k+0.1,0.8,h,h+7,'#b6b6ad');
    box(ctx,0.62,k-0.1,0.8,k+0.1,h,h+7,'#b6b6ad');
  }
  // Lectern/open book offset beside the existing animated professor.
  box(ctx,-0.4,0.2,-0.28,0.32,h,h+8,'#705337');
  poly(ctx,[P(-0.55,0.15,h+9),P(-0.12,0.15,h+9),P(-0.12,0.4,h+10),P(-0.55,0.4,h+10)],CREAM,true,0.8);
  shrub(ctx,-0.6,1.02,true);shrub(ctx,0.55,1.05,true);
  const [bx,by]=P(-1,0.8,4);
  flag(ctx,bx,by,28,C.navy);
  plaque(ctx,bx+7,by-17,'BIBLE',4,true);
}

/** Height (px above the footprint centre) of the Casserole Catapult's axle: its throwing arm pivots here. */
export const CATAPULT_AXLE_Z = 60;

/** Chuck's Casserole Catapult: a wooden A-frame on a serving platform. The throwing arm is drawn live (world.ts). */
function catapult(ctx: Ctx, L: number): void {
  site(ctx, L, 3);
  // serving platform
  box(ctx, -1.05, -1.05, 1.05, 1.05, 4, 12, L <= 1 ? WOOD : C.brick);
  if (L >= 3) box(ctx, -1.08, -1.08, 1.08, 1.08, 12, 14, CREAM);
  const z0 = L >= 3 ? 14 : 12;
  // stack of dining-hall trays on the left corner
  const th = 6 + L * 4;
  box(ctx, -0.95, 0.45, -0.5, 0.95, z0, z0 + th, '#e0773a');
  ctx.strokeStyle = 'rgba(90,30,0,0.45)';
  ctx.lineWidth = 1;
  for (let z = z0 + 3; z < z0 + th - 1; z += 3) {
    line(ctx, P(-0.95, 0.95, z), P(-0.5, 0.95, z));
    line(ctx, P(-0.5, 0.95, z), P(-0.5, 0.45, z));
  }
  // a vat of Mystery Bake on the right corner
  cylinder(ctx, 0.68, -0.68, 0.3, z0, 16, '#9aa3ad', '#6b4a2a');
  const [vx, vy] = P(0.68, -0.68, z0 + 16);
  ctx.fillStyle = '#7fae3a';
  for (const [ox, oy] of [[-4, -1], [3, 1], [0, 2]] as [number, number][]) ctx.fillRect(vx + ox, vy + oy, 2, 2);
  // A-frame uprights either side of the arm
  ctx.lineCap = 'round';
  for (const v of [-0.45, 0.45]) {
    const top = P(0, v, CATAPULT_AXLE_Z);
    for (const u of [-0.7, 0.7]) {
      const foot = P(u, v, z0);
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 8;
      line(ctx, foot, top);
      ctx.strokeStyle = L >= 2 ? C.woodDark : WOOD;
      ctx.lineWidth = 5;
      line(ctx, foot, top);
    }
    // cross brace
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2;
    line(ctx, P(-0.5, v, z0 + 18), P(0.5, v, z0 + 18));
  }
  // axle
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 5;
  line(ctx, P(0, -0.5, CATAPULT_AXLE_Z), P(0, 0.5, CATAPULT_AXLE_Z));
  ctx.strokeStyle = L >= 4 ? C.gold : '#777';
  ctx.lineWidth = 3;
  line(ctx, P(0, -0.5, CATAPULT_AXLE_Z), P(0, 0.5, CATAPULT_AXLE_Z));
  ctx.lineCap = 'butt';
  if (L >= 2) {
    const [sx, sy] = P(0.2, 1.08, 9);
    plaque(ctx, sx, sy, "CHUCK'S", 6);
  }
  if (L >= 4) {
    const [fx, fy] = P(-0.95, -0.95, z0 + 12);
    flag(ctx, fx, fy, 30, C.gold);
  }
}

/** Height (px above the footprint centre) of the Stinger Statue's raised stinger tip: where its beam starts. */
export const STINGER_TIP_Z = 92;

/** Chrome campus sculpture, with the existing beam origin and two-tile lot retained. */
function stinger(ctx: Ctx, L: number): void {
  pad(ctx,2,'#999b9e');
  const chrome=(y0:number,y1:number):CanvasGradient=>{
    const g=ctx.createLinearGradient(0,y0,0,y1);
    g.addColorStop(0,'#f6fbff');g.addColorStop(0.35,'#c4cdd5');
    g.addColorStop(0.52,'#707a85');g.addColorStop(0.65,'#e3eaf0');g.addColorStop(1,'#a1abb5');return g;
  };
  const metal=(pts:[number,number][]):void=>poly(ctx,pts,chrome(-108,-38),true,1.6);
  box(ctx,-0.42,-0.42,0.42,0.42,4,32,'#282c32');
  box(ctx,-0.49,-0.49,0.49,0.49,32,36,'#aab3bd');
  poly(ctx,[P(-0.18,0.43,23),P(0.18,0.43,23),P(0.18,0.43,15),P(-0.18,0.43,15)],'#d1dae3',true,1.3);
  // Dark diagonal supports, beneath the sign rather than through the insect.
  poly(ctx,[[-11,-34],[-30,-53],[-24,-55],[-7,-36]],'#282d33',true,1.5);
  poly(ctx,[[11,-34],[30,-53],[24,-55],[7,-36]],'#282d33',true,1.5);
  // Segmented abdomen curls beneath the banner.
  ctx.strokeStyle=OUT;ctx.lineWidth=12;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(-10,-57);ctx.bezierCurveTo(-13,-35,8,-33,14,-47);ctx.stroke();
  ctx.strokeStyle=chrome(-57,-34);ctx.lineWidth=9;ctx.stroke();
  ctx.strokeStyle='#626c75';ctx.lineWidth=1;
  for(const [x,y] of [[-9,-47],[-5,-41],[3,-40]]) {ctx.beginPath();ctx.moveTo(x-2,y-3);ctx.lineTo(x+2,y+3);ctx.stroke();}
  // Swept angular wings and their polished facets.
  metal([[5,-78],[25,-99],[43,-110],[39,-97],[15,-79]]);
  poly(ctx,[[11,-81],[39,-103],[37,-99],[18,-83]],'#788590',false);
  metal([[9,-76],[41,-94],[37,-83],[15,-73]]);
  poly(ctx,[[14,-77],[36,-88],[31,-83],[18,-76]],'#8996a0',false);
  metal([[-5,-80],[-9,-110],[-3,-99],[0,-82]]);
  // Body shell is deliberately angular like the supplied metal sculpture.
  metal([[-7,-83],[5,-84],[15,-74],[11,-65],[-2,-64],[-12,-72]]);
  poly(ctx,[[5,-82],[13,-74],[10,-67],[3,-72]],'#6b7680',false);
  metal([[-13,-86],[-2,-87],[5,-80],[1,-70],[-9,-65],[-17,-75]]);
  poly(ctx,[[-12,-83],[-8,-70],[-1,-81]],'#f5f8fa',false);
  poly(ctx,[[-8,-70],[-1,-81],[0,-72],[-9,-66]],'#6c7780',false);
  // Fixed raised tip: do not move, as raid beams use STINGER_TIP_Z.
  metal([[-3,-86],[0,-STINGER_TIP_Z],[3,-86]]);
  // Curved black plaque with silver lettering.
  ctx.beginPath();ctx.moveTo(-44,-48);ctx.quadraticCurveTo(0,-59,44,-48);
  ctx.lineTo(44,-64);ctx.quadraticCurveTo(0,-77,-44,-64);ctx.closePath();
  ctx.fillStyle='#22272d';ctx.fill();ctx.strokeStyle=OUT;ctx.lineWidth=2;ctx.stroke();
  ctx.fillStyle='#e4ebef';ctx.font='900 10px "Trebuchet MS",system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  const word='CEDARVILLE';
  for(let i=0;i<word.length;i++){const k=(i-(word.length-1)/2)/((word.length-1)/2);ctx.fillText(word[i],k*34,-62+k*k*4);}
  ctx.beginPath();ctx.moveTo(-32,-49);ctx.quadraticCurveTo(0,-56,32,-49);
  ctx.lineTo(32,-43);ctx.quadraticCurveTo(0,-49,-32,-43);ctx.closePath();
  ctx.fillStyle=chrome(-56,-42);ctx.fill();ctx.strokeStyle=OUT;ctx.lineWidth=1.3;ctx.stroke();
  ctx.fillStyle='#232830';ctx.font='900 4.8px "Trebuchet MS",system-ui,sans-serif';
  const sub='YELLOW JACKETS';
  for(let i=0;i<sub.length;i++){const k=(i-(sub.length-1)/2)/((sub.length-1)/2);ctx.fillText(sub[i],k*27,-49+k*k*3);}
  // Jointed legs overlap the upper rim; chrome highlights preserve their silhouette.
  const legs=[[-12,-80,-23,-74,-31,-62],[-7,-78,-19,-70,-22,-64],[10,-77,22,-73,29,-62],[12,-74,27,-69,35,-61]];
  for(const [sx,sy,kx,ky,ex,ey] of legs){
    ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(kx,ky);ctx.lineTo(ex,ey);
    ctx.strokeStyle=OUT;ctx.lineWidth=4;ctx.stroke();ctx.strokeStyle='#cbd5dd';ctx.lineWidth=2;ctx.stroke();
  }
  // Two swept antennae and a subtle level-dependent highlight at the emitter.
  for(const pts of [[-12,-83,-15,-96,-22,-92],[-3,-85,1,-97,-6,-93]]){
    ctx.beginPath();ctx.moveTo(pts[0],pts[1]);ctx.lineTo(pts[2],pts[3]);ctx.lineTo(pts[4],pts[5]);
    ctx.strokeStyle=OUT;ctx.lineWidth=3.5;ctx.stroke();ctx.strokeStyle='#dce5ec';ctx.lineWidth=1.7;ctx.stroke();
  }
  if(L>=3){ctx.beginPath();ctx.arc(0,-STINGER_TIP_Z,1.5,0,Math.PI*2);ctx.fillStyle='#9bdcff';ctx.fill();}
  ctx.lineCap='butt';ctx.textBaseline='alphabetic';
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

/**
 * A red pull station on a short post. Lv2 adds a strobe on top; Lv3 a gold rim and a second strobe.
 */
function fireAlarm(ctx: Ctx, L: number): void {
  const [x, y] = P(0, 0, 0);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(x, y, 11, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // post
  box(ctx, -0.06, -0.06, 0.06, 0.06, 0, 14, '#8a8f99');
  // the red box, its face toward the viewer's right
  const RED = '#d8322c';
  box(ctx, -0.17, -0.12, 0.17, 0.12, 14, 34, RED, { top: shade(RED, 0.15) });
  if (L >= 3) {
    ctx.strokeStyle = C.gold;
    ctx.lineWidth = 1.6;
    const rim = [P(-0.17, 0.12, 14), P(0.17, 0.12, 14), P(0.17, 0.12, 34), P(-0.17, 0.12, 34)];
    ctx.beginPath();
    ctx.moveTo(rim[0][0], rim[0][1]);
    for (const q of rim) ctx.lineTo(q[0], q[1]);
    ctx.closePath();
    ctx.stroke();
  }
  // white "FIRE" label strip and the pull handle on the front face
  poly(ctx, [P(-0.13, 0.12, 27), P(0.13, 0.12, 27), P(0.13, 0.12, 32), P(-0.13, 0.12, 32)], '#fff', true, 1);
  const [lx, ly] = P(0, 0.12, 29.5);
  ctx.fillStyle = RED;
  ctx.font = '900 4.6px "Trebuchet MS", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('FIRE', lx, ly + 0.3);
  ctx.textBaseline = 'alphabetic';
  poly(ctx, [P(-0.08, 0.12, 18), P(0.08, 0.12, 18), P(0.08, 0.12, 24), P(-0.08, 0.12, 24)], '#f2f2f2', true, 1.2);
  const [hx, hy] = P(0, 0.12, 21);
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 1.6;
  line(ctx, [hx - 3, hy], [hx + 3, hy]);
  // strobes
  const strobe = (u: number): void => {
    box(ctx, u - 0.05, -0.05, u + 0.05, 0.05, 34, 38, '#f6f3ea', { top: '#ffffff' });
    const [sx, sy] = P(u, 0, 40);
    ctx.fillStyle = 'rgba(255,90,80,0.55)';
    ctx.beginPath();
    ctx.arc(sx, sy, 3.2, 0, Math.PI * 2);
    ctx.fill();
  };
  if (L >= 3) {
    strobe(-0.09);
    strobe(0.09);
  } else if (L >= 2) strobe(0);
}

const WALL_COLORS = ['#a8713c', '#bf5a3f', '#a34a3a', '#9aa0a8', '#c9a13a', '#2e63b8', '#1c3d7a', '#ece6d8'];
const WALL_TOPS = ['#c99a62', '#d97a5f', '#c46a58', '#c4c9cf', '#f5c32c', '#f5c32c', '#f5c32c', '#2e63b8'];

/**
 * Walls change shape as well as colour:
 * 1 wooden fence posts, 2 brick, 3 brick with a stone cap, 4 stone block with a cap,
 * 5 gold-capped with a ball, 6 navy with gold battlements, 7 deep navy with a gold band,
 * 8 white marble with a gold band and a gold star.
 */
function wall(ctx: Ctx, L: number, mask: number): void {
  const lv = Math.min(L, WALL_COLORS.length);
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
  if (lv >= 7) {
    // gold band around the middle
    ctx.strokeStyle = C.gold;
    ctx.lineWidth = 2;
    line(ctx, P(-s, s, h * 0.5), P(s, s, h * 0.5));
    line(ctx, P(s, s, h * 0.5), P(s, -s, h * 0.5));
  }
  if (lv >= 8) {
    const [x, y] = P(0, 0, h + 16);
    star5(ctx, x, y, 5.5, C.gold);
  }
}

/**
 * Parking Gate Arm. `variant`: bit 1/2 = wall to the +u/+v side (as for walls), bit 4 = arm raised
 * (it has already swung). The arm runs along the wall line: along v when the only neighbour is +v.
 * Housing: grey at Lv1, navy at Lv2, navy and gold at Lv3.
 */
function gate(ctx: Ctx, L: number, variant: number): void {
  const mask = variant & 3;
  const raised = (variant & 4) !== 0;
  const alongV = (mask & 2) !== 0 && (mask & 1) === 0;
  // map (along, across) to (u, v)
  const Pa = (a: number, c: number, z: number): [number, number] => (alongV ? P(c, a, z) : P(a, c, z));
  const curb = '#c9cdd3';
  // low curbs that meet neighbouring walls
  if (mask & 2) box(ctx, -0.16, 0.2, 0.16, 1 - 0.2, 0, 6, curb);
  if (mask & 1) box(ctx, 0.2, -0.16, 1 - 0.2, 0.16, 0, 6, curb);
  box(ctx, -0.42, -0.42, 0.42, 0.42, 0, 3, curb);
  // the housing at the back end of the arm
  const body = L >= 2 ? C.navy : '#8a8f99';
  if (alongV) box(ctx, -0.16, -0.42, 0.16, -0.12, 3, 24, body, { top: L >= 3 ? C.gold : shade(body, 0.2) });
  else box(ctx, -0.42, -0.16, -0.12, 0.16, 3, 24, body, { top: L >= 3 ? C.gold : shade(body, 0.2) });
  // a little red/green lamp on top
  const [lx, ly] = Pa(-0.27, 0, 27);
  ctx.beginPath();
  ctx.arc(lx, ly, 2.4, 0, Math.PI * 2);
  ctx.fillStyle = raised ? '#5fd06a' : '#ff4a3d';
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  // the striped boom arm
  const a0 = Pa(-0.27, 0, 19);
  const a1 = raised ? Pa(-0.2, 0, 54) : Pa(0.5, 0, 17); // raised stays inside the 1-tile sprite's headroom
  ctx.lineCap = 'round';
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 6;
  line(ctx, a0, a1);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3.6;
  line(ctx, a0, a1);
  ctx.strokeStyle = '#e0312b';
  ctx.setLineDash([4, 4]);
  line(ctx, a0, a1);
  ctx.setLineDash([]);
  ctx.lineCap = 'butt';
  // a tiny permit sign on the housing
  if (L >= 2) {
    const [sx, sy] = alongV ? P(0.16, -0.27, 14) : P(-0.27, 0.16, 14);
    ctx.fillStyle = '#fff';
    ctx.fillRect(sx - 4, sy - 3, 8, 6);
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 1;
    ctx.strokeRect(sx - 4, sy - 3, 8, 6);
    ctx.fillStyle = C.navy;
    ctx.font = '900 4.5px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('P', sx, sy + 1.8);
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
