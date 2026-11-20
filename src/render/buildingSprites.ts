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
let CREAM = '#f1e4c6';
/** A lighter cream for columns and top-level parapets (a hex literal: box() shades hex colours only). */
let CREAM_LIGHT = '#f8f0dc';
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
  ctx.fillStyle = light ? OUT : (C.navy === '#272d36' ? '#aeb7c4' : CREAM);
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

/** Applies approved colors at the drawing boundary, never to building stats. */
export function drawBuilding(ctx: Ctx, type: BuildingType, level: number, variant = 0): void {
  if (type === 'ratower' && level > 0) {
    // The retained RA preview changes shared helper defaults only for this synchronous draw.
    // Always restore them, including on error, so no other sprite inherits these colors.
    const before = { ...C }, cream = CREAM, creamLight = CREAM_LIGHT;
    const t = buildingThemes[buildingThemeTier(type, level)-1];
    const dark = buildingThemeTier(type, level) === 8;
    try {
      C.brick=t.body; C.stone=t.body; C.stoneDark=shade(t.body,-.2);
      C.gold=t.trim; C.goldDark=shade(t.trim,-.2); CREAM=t.trim; CREAM_LIGHT=t.trim;
      C.roofBlue=t.roof; C.woodDark=dark?'#454b55':shade(t.body,-.35);
      C.navy=dark?'#272d36':'#1c3d7a'; C.concrete=t.floor;
      drawBuildingArt(ctx,type,level,variant);
    } finally { Object.assign(C,before); CREAM=cream; CREAM_LIGHT=creamLight; }
  } else drawBuildingArt(buildingThemeContext(ctx,type,level),type,level,variant);
}
function drawBuildingArt(ctx: Ctx, type: BuildingType, level: number, variant = 0): void {
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
 * It begins as a small hall, gains its tower at level 3, rear hall at 4 and terraces at 5.
 * All changes are visual; the four-tile lot and upgrade statistics never change.
 */
/** Early campus construction: a modest hall grows before receiving its full reference facade.
 * Only the drawn mass changes. The site, selection, collision and build area stay the same. */
function starterHall(ctx: Ctx, L: number, label: string, accent: string, size = 3): void {
  site(ctx, L, size);
  const w = L === 1 ? 0.72 : 1.02;
  const h = L === 1 ? 25 : 40;
  walls(ctx, L, -w, -w * 0.7, w, w * 0.8, 4, h, CAMPUS_BRICK);
  windowsL(ctx, -w + 0.12, -0.25, w * 0.8, 10, h - 5, L === 1 ? 1 : 2, L);
  windowsR(ctx, -w * 0.7 + 0.1, w * 0.7, w, 10, h - 5, L === 1 ? 2 : 3, L);
  door(ctx, 0.27, w * 0.8, 0.3, 15, C.woodDark);
  gable(ctx, -w - 0.06, -w * 0.7 - 0.06, w + 0.06, w * 0.8 + 0.06, h, 10, L === 1 ? SLATE : accent);
  if (L >= 2) {
    box(ctx, -w, w * 0.8, w, w * 0.8 + 0.04, h - 4, h, CREAM);
    shrub(ctx, -1.15, 1.1, false);
  }
  const [x, y] = P(0, w * 0.8 + 0.04, h - 7);
  plaque(ctx, x, y, label, 5);
}

function dmc(ctx: Ctx, L: number): void {
  if (L <= 2) {
    starterHall(ctx, L, 'DIXON MINISTRY CENTER', C.navy, 4);
    return;
  }
  // The full complex is earned in stages, rather than appearing at level one.
  site(ctx, L, 4);
  const brick = '#c87952';
  const wing: PD[] = [[-1.58, 0.14], [-1.1, 0.62], [1.1, 0.62], [1.58, 0.14], [1.14, -0.68], [-1.14, -0.68]];
  block45(ctx, 2, wing, 4, 37, brick);
  if (L >= 4) {
  // Upper rear hall with its large, dark gridded glass wall.
  block45(ctx, 2, rectPD(-0.87, 0.86, -0.72, -0.12), 37, 80, brick);
  frontGlass(ctx, -0.48, 0.42, -0.105, 48, 76, 6, 3);
  }
  // Broad lower roof terraces flank the centre; cream coping outlines every roof.
  if (L >= 5) {
  block45(ctx, 2, rectPD(-1.31, -0.52, -0.43, 0.19), 37, 55, brick);
  block45(ctx, 2, rectPD(0.59, 1.29, -0.43, 0.19), 37, 53, brick);
  frontWindows(ctx, -1.21, -0.6, 0.2, 41, 48, 5, 1, 0, true);
  frontWindows(ctx, 0.68, 1.2, 0.2, 40, 47, 4, 1, 0, true);
  }
  // The brick bell tower sits right of centre, with a glazed triangular cap.
  const u0 = -0.03, u1 = 0.63, v0 = -0.41, v1 = 0.25;
  const th = L === 3 ? 62 : L === 4 ? 80 : 92 + Math.min(L, 8);
  walls(ctx, 2, u0, v0, u1, v1, 39, th, brick);
  poly(ctx, [P(u0, v1, th), P(u1, v1, th), P(u1, v1, th - 19)], '#26394e', true, 1.5);
  poly(ctx, [P(u1, v1, th), P(u1, v0, th), P(u1, v1, th - 19)], '#1f2d40', true, 1.5);
  ctx.strokeStyle = '#14202d'; ctx.lineWidth = 1;
  line(ctx, P(u0 + 0.15, v1, th), P(u1, v1, th - 15));
  line(ctx, P(u1 - 0.12, v1, th), P(u1, v1, th - 4));
  pyramid(ctx, u0 - 0.02, v0 - 0.02, u1 + 0.02, v1 + 0.02, th, 17, '#53657d');
  const [tx, ty] = P((u0 + u1) / 2, (v0 + v1) / 2, th + 17);
  ctx.strokeStyle = OUT; ctx.lineWidth = 3;
  line(ctx, [tx, ty], [tx, ty - 28]);
  ctx.strokeStyle = CREAM_LIGHT; ctx.lineWidth = 1.2;
  line(ctx, [tx, ty - 2], [tx, ty - 27]);
  ctx.beginPath(); ctx.arc(tx, ty - 15, 7, 0, Math.PI * 2);
  ctx.fillStyle = L >= 6 ? C.gold : '#e6e3dc'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.arc(tx - 1.7, ty - 17, 4.4, 0, Math.PI * 2); ctx.fillStyle = '#fffdf6'; ctx.fill();
  // Front hall and continuous glazing beneath a long stone entrance band.
  const front: PD[] = [[-1.15, 0.65], [-0.86, 0.91], [0.86, 0.91], [1.15, 0.65], [1.02, 0.4], [-1.02, 0.4]];
  block45(ctx, 2, front, 4, 38, brick);
  frontGlass(ctx, -0.84, 0.84, 0.92, 6, 29, 12, 1, 0);
  // Tiny warm door handles, rather than brightly lit entire doors.
  ctx.strokeStyle = '#bb9142'; ctx.lineWidth = 1.4;
  for (const pp of [-0.62, -0.45, -0.19, 0.04, 0.28, 0.53, 0.72]) line(ctx, Q(pp, 0.925, 13), Q(pp, 0.925, 16));
  const porch: PD[] = [[-1.03, 0.87], [-0.87, 1.06], [0.87, 1.06], [1.03, 0.87], [0.9, 0.76], [-0.9, 0.76]];
  prism(ctx, porch, 4, 6, '#d7c6ad');
  for (const pp of [-0.87, -0.53, -0.18, 0.18, 0.53, 0.87]) column(ctx, pp, 1.015, 6, 30);
  prism(ctx, porch, 30, 42, '#e4cfac', '#f4e3c6');
  const [nx, ny] = Q(0, 1.07, 36);
  ctx.fillStyle = OUT; ctx.font = '900 8px "Trebuchet MS", system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('DIXON MINISTRY CENTER', nx, ny);
  ctx.textBaseline = 'alphabetic';
  poly(ctx, [Q(-0.83, 1.06, 42), Q(0.83, 1.06, 42), Q(0.05, 0.81, 46)], brick, true, 1.3);
  if (L >= 4) for (const side of [-1, 1]) {
    for (const [pp, dd] of [[1.35, 0.28], [1.2, 0.45], [1.06, 0.64]]) shrub(ctx, dd + pp * side, dd - pp * side, false);
    const [lu, lv] = [0.55 + side * 1.35, 0.55 - side * 1.35];
    lamp(ctx, lu, lv, true);
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

/** Rich glazing reserved for the four reference academic buildings. */
function academicGlass(ctx:Ctx,face:'L'|'R',a0:number,a1:number,fixed:number,z0:number,z1:number,cols:number,rows:number):void {
  const pt=(a:number,z:number):[number,number]=>face==='L'?P(a,fixed,z):P(fixed,a,z);
  const d=(a1-a0)/cols,dz=(z1-z0)/rows;
  poly(ctx,[pt(a0,z0),pt(a1,z0),pt(a1,z1),pt(a0,z1)],face==='L'?'#325e70':'#244856',true,1.5);
  // A warmly lit lower pane under a cool reflected upper pane, like the references.
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++) {
    const a=a0+c*d,z=z0+r*dz;
    const lit=r%2===0 || (c+2*r)%7===0;
    poly(ctx,[pt(a,z),pt(a+d,z),pt(a+d,z+dz),pt(a,z+dz)],lit?'#d4b664':(c%3===0?'#487f91':'#326579'),false);
    if(lit && dz>4){
      poly(ctx,[pt(a+d*.17,z),pt(a+d*.77,z),pt(a+d*.77,z+dz*.33),pt(a+d*.17,z+dz*.33)],'#53605a',false);
      ctx.strokeStyle='#ffe5a1';ctx.lineWidth=0.8;
      line(ctx,pt(a+d*.15,z+dz*.77),pt(a+d*.8,z+dz*.77));
    }
  }
  ctx.strokeStyle='#223943';ctx.lineWidth=1;
  for(let c=0;c<=cols;c++)line(ctx,pt(a0+c*d,z0),pt(a0+c*d,z1));
  for(let r=0;r<=rows;r++)line(ctx,pt(a0,z0+r*dz),pt(a1,z0+r*dz));
  ctx.strokeStyle='rgba(222,241,248,0.55)';ctx.lineWidth=.45;
  for(let c=1;c<cols;c++)line(ctx,pt(a0+c*d+.008,z0),pt(a0+c*d+.008,z1));
}
function academicBlock(ctx:Ctx,u0:number,v0:number,u1:number,v1:number,h:number,color=CAMPUS_BRICK):void {
  campusBlock(ctx,u0,v0,u1,v1,h,color);
  ctx.strokeStyle=color===CAMPUS_BRICK?'rgba(104,48,25,0.23)':'rgba(112,98,75,0.15)';ctx.lineWidth=.45;
  for(let z=8,row=0;z<h-3;z+=3,row++) {
    line(ctx,P(u0,v1,z),P(u1,v1,z));line(ctx,P(u1,v0,z),P(u1,v1,z));
    for(let u=u0+.08+(row%2)*.12;u<u1;u+=.24)line(ctx,P(u,v1,z),P(u,v1,Math.min(z+3,h-3)));
    for(let v=v0+.08+(row%2)*.12;v<v1;v+=.24)line(ctx,P(u1,v,z),P(u1,v,Math.min(z+3,h-3)));
  }
}
function academicRail(ctx:Ctx,u0:number,u1:number,v:number,z:number):void {
  ctx.strokeStyle='#343b40';ctx.lineWidth=.9;
  for(const u of [u0,u1]){line(ctx,P(u,v+.18,5),P(u,v+.18,z));line(ctx,P(u,v-.08,10),P(u,v-.08,z+4));line(ctx,P(u,v+.18,z),P(u,v-.08,z+4));}
}
function academicWallText(ctx:Ctx,u:number,v:number,z:number,text:string,size:number):void {
  const [x,y]=P(u,v,z);ctx.save();ctx.translate(x,y);ctx.transform(1,.5,0,1,0,0);
  ctx.fillStyle='#172e36';ctx.font=`900 ${size}px system-ui,sans-serif`;ctx.textAlign='center';ctx.fillText(text,0,0);ctx.restore();
}
function academicPlanters(ctx:Ctx,L:number):void {
  // Low planting beds avoid obscuring entrances with oversized floating shrubs.
  for(const [u,v] of [[-.95,1.25],[.95,1.25]]) {
    box(ctx,u-.22,v-.07,u+.22,v+.07,4,7,'#b5a787');
    for(let i=0;i<5;i++) {const [x,y]=P(u-.17+i*.085,v,9);ctx.beginPath();ctx.ellipse(x,y,3.2,2.2,0,0,Math.PI*2);ctx.fillStyle=i%2?'#5d852d':'#789a38';ctx.fill();if(L>=2){ctx.fillStyle='#e9cf61';ctx.fillRect(x,y-1,1,1);}}
  }
  if(L>=2) {const [x,y]=P(1.3,1.28,4);ctx.fillStyle='#30393b';ctx.fillRect(x-1,y-10,2,10);ctx.fillStyle='#ffd877';ctx.fillRect(x-1.5,y-12,3,3);}
}

function businessCenter(ctx: Ctx, L: number): void {
  if (L === 1) { starterHall(ctx, L, 'BUSINESS', C.navy); return; }
  site(ctx, L, 3);
  const h = 39 + Math.min(L, 4) * 2;
  academicBlock(ctx, -1.22, -0.72, 1.15, 0.91, h);
  // Long two-storey glazed facade between brick end wings.
  academicGlass(ctx, 'L', -0.76, 0.73, 0.923, 10, h - 3, 10, 4);
  academicGlass(ctx, 'R', -0.60, 0.55, 1.163, 12, h - 6, 5, 4);
  box(ctx, -0.8, 0.90, 0.78, 1.0, h - 1, h + 3, '#343b49');
  academicGlass(ctx, 'L', -1.13, -1.02, 0.925, 10, h - 5, 1, 2);
  academicGlass(ctx, 'L', -0.94, -0.83, 0.925, 10, h - 5, 1, 2);
  // Projecting glass entrance and a small roof terrace with dark railing.
  box(ctx, 0.12, 0.92, 0.91, 1.18, 5, 23, '#344554');
  academicGlass(ctx, 'L', 0.17, 0.87, 1.193, 8, 22, 4, 2);
  box(ctx, 0.08, 0.88, 0.96, 1.23, 23, 26, '#454b59');
  ctx.strokeStyle = OUT; ctx.lineWidth = 1;
  line(ctx, P(0.1, 1.21, 32), P(0.94, 1.21, 32));
  for (let u = 0.1; u <= 0.95; u += 0.14) line(ctx, P(u, 1.21, 26), P(u, 1.21, 32));
  campusSteps(ctx, -0.65, -0.18, 1.05);
  door(ctx, -0.42, 0.94, 0.3, 15, C.navy);
  rooftopUnit(ctx, -0.6, -0.55, h);
  if (L >= 2) rooftopUnit(ctx, 0.45, -0.6, h);
  academicPlanters(ctx, L);
  academicRail(ctx, -0.65, -0.18, 1.08, 13);
  rooftopUnit(ctx, 0.65, -0.15, h);
  // A slim waterfront strip conveys the lake without extending the occupied lot.
  poly(ctx,[P(-1.15,1.37,4.2),P(1.12,1.37,4.2),P(1.12,1.47,4.2),P(-1.15,1.47,4.2)],'#287eab',false);
}

function healthCenter(ctx: Ctx, L: number): void {
  if (L === 1) { starterHall(ctx, L, 'HEALTH SCIENCES', C.navy); return; }
  site(ctx, L, 3);
  const h = 61 + Math.min(L, 3) * 3;
  academicBlock(ctx, -1.2, -1.15, 1.15, 0.88, h);
  panes(ctx, 'L', -1.09, -0.22, 0.9, 11, h - 5, 3, 3);
  panes(ctx, 'R', -1.02, 0.76, 1.17, 11, h - 6, 4, 3);
  // Pale projecting wing, with its three-storey glass corner and tall stairwell.
  academicBlock(ctx, -0.10, 0.28, 1.0, 1.12, h - 4, '#e9d8bb');
  academicGlass(ctx, 'L', 0.04, 0.91, 1.133, 12, h - 10, 5, 6);
  academicGlass(ctx, 'R', 0.35, 1.05, 1.013, 12, h - 10, 3, 6);
  academicBlock(ctx, -0.4, 0.65, -0.13, 0.98, h + 5, CREAM);
  academicGlass(ctx, 'L', -0.36, -0.17, 0.994, 9, h + 2, 1, 8);
  box(ctx,-0.04,1.13,0.98,1.17,h-10,h-4,'#e9d8bb');
  for(const z of [h*0.37,h*0.65]) {
    box(ctx,0.0,1.13,0.96,1.16,z,z+5,'#e9d8bb');
    box(ctx,1.01,0.32,1.04,1.11,z,z+5,'#d0c1aa');
  }
  // Broad stone spandrel above the sheltered doors.
  box(ctx, 0.01, 1.10, 0.95, 1.15, 24, 30, '#dfccb0');
  door(ctx, 0.52, 1.17, 0.32, 14, C.navy);
  campusSteps(ctx, 0.24, 0.80, 1.16);
  rooftopUnit(ctx, -0.65, -0.7, h);
  if (L >= 2) rooftopUnit(ctx, 0.25, -0.7, h);
  academicPlanters(ctx,L);
  academicWallText(ctx,0.5,1.18,27,'HEALTH SCIENCES',3.1);
}

function library(ctx: Ctx, L: number): void {
  if (L <= 2) { starterHall(ctx, L, 'LIBRARY', C.navy); return; }
  site(ctx, L, 3);
  const h = 48 + Math.min(L, 8) * 3;
  academicBlock(ctx, -1.2, -0.72, 1.12, 0.75, h);
  // Centennial's tall recessed glass entrance, framed by a broad brick lintel.
  academicGlass(ctx, 'L', -0.91, 0.12, 0.766, 9, h - 8, 5, 5);
  box(ctx, -1.08, 0.70, -0.92, 0.96, 4, h - 5, CAMPUS_BRICK);
  box(ctx, 0.13, 0.70, 0.29, 0.96, 4, h - 5, CAMPUS_BRICK);
  box(ctx, -1.09, 0.70, 0.30, 0.98, h - 9, h - 3, CAMPUS_BRICK);
  // Low right-hand reading wing with ribbon windows.
  academicBlock(ctx, 0.31, 0.35, 1.2, 1.11, h * 0.69);
  academicGlass(ctx, 'L', 0.41, 1.1, 1.123, 13, 25, 5, 2);
  academicGlass(ctx, 'R', 0.48, 1.01, 1.213, 13, 25, 3, 2);
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
  academicPlanters(ctx,L);
  academicRail(ctx,-0.55,0.08,1.10,14);
  academicWallText(ctx,0.76,1.135,h*0.69-6,'CENTENNIAL',3.2);
  academicWallText(ctx,0.76,1.135,h*0.69-10,'LIBRARY',3.6);
  ctx.strokeStyle='#303942';ctx.lineWidth=1.1;
  const [rx,ry]=P(0.65,1.4,4);
  for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(rx+i*5,ry+i*2.5-3,2.3,4,0,Math.PI,0);ctx.stroke();}
}

function biblicalCenter(ctx: Ctx, L: number): void {
  if (L <= 2) { starterHall(ctx, L, 'BIBLICAL STUDIES', C.navy); return; }
  site(ctx, L, 3);
  const h = 46 + Math.min(L, 4) * 3;
  academicBlock(ctx, -1.2, -0.76, 1.15, 0.91, h);
  panes(ctx, 'L', -1.10, -0.63, 0.93, 12, h - 7, 2, 2);
  for(const z of [12,h*.61]) academicGlass(ctx,'R',-0.64,0.79,1.17,z,z+12,7,2);
  // Two-storey glazed portico and slim pale columns, like the BTS reference.
  academicGlass(ctx, 'L', -0.52, 0.90, 0.94, 9, h - 3, 6, 4);
  campusSteps(ctx, -0.56, 0.93, 1.10);
  for (let u = -0.55; u < 1; u += 0.47) box(ctx, u - 0.035, 1.09, u + 0.035, 1.17, 9, h, '#d8d3c9');
  box(ctx, -0.63, 0.66, 0.99, 1.24, h, h + 5, '#e7ddce', { top: SLATE });
  box(ctx,-0.54,1.09,0.94,1.14,h*0.54,h*0.54+2,'#d8d3c9');
  door(ctx, 0.31, 0.96, 0.34, 17, C.navy);
  // Tall narrow stair glazing and rooftop lantern.
  academicBlock(ctx, -1.17, 0.61, -0.94, 0.99, h + 9, '#c1c1bf');
  academicGlass(ctx, 'L', -1.13, -0.98, 1.003, 9, h + 5, 1, 8);
  box(ctx, -0.27, -0.58, 0.26, -0.08, h + 3, h + 13, CREAM);
  academicGlass(ctx, 'L', -0.23, 0.22, -0.067, h + 5, h + 11, 3, 1);
  academicGlass(ctx, 'R', -0.53, -0.12, 0.273, h + 5, h + 11, 2, 1);
  // A small reflecting strip inside the lot (not an extra occupied tile).
  poly(ctx, [P(-0.60, 1.36, 4.2), P(0.76, 1.36, 4.2), P(0.76, 1.45, 4.2), P(-0.60, 1.45, 4.2)], C.water, false);
  academicPlanters(ctx,L);
  academicWallText(ctx,-0.85,0.94,h*0.55,'BIBLICAL',2.8);
  academicWallText(ctx,-0.85,0.94,h*0.55-4,'STUDIES',2.8);
  const [fx,fy]=P(0.1,1.405,5);
  ctx.strokeStyle='#daefff';ctx.lineWidth=0.8;
  for(const dir of [-1,1]){ctx.beginPath();ctx.moveTo(fx,fy);ctx.quadraticCurveTo(fx+dir*3,fy-9,fx+dir*5,fy);ctx.stroke();}
  ctx.beginPath();ctx.ellipse(fx,fy,7,2,0,0,Math.PI*2);ctx.stroke();
}

/** Two glazed circular floors under the Hive's broad yellow eaves. */
function hive(ctx: Ctx, L: number): void {
  site(ctx, L, 3, '#d5bea0');
  const [x, y] = P(0, 0, 4);
  const tier = (r: number, base: number, h: number): void => {
    const ry = r * 0.43;
    ctx.fillStyle = '#243144'; ctx.strokeStyle = OUT; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, y - base, r, ry, 0, 0, Math.PI);
    ctx.lineTo(x - r, y - base - h); ctx.ellipse(x, y - base - h, r, ry, 0, Math.PI, Math.PI * 2);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    for (let i = 0; i < 13; i++) {
      const a = Math.PI * i / 13, b = Math.PI * (i + 1) / 13;
      const xa = x + Math.cos(a) * r, xb = x + Math.cos(b) * r;
      const ya = y - base + Math.sin(a) * ry, yb = y - base + Math.sin(b) * ry;
      const glass = ctx.createLinearGradient(0, y - base - h, 0, y - base + ry);
      glass.addColorStop(0, '#39414b'); glass.addColorStop(0.5, '#aa782e'); glass.addColorStop(1, '#ffc953');
      poly(ctx, [[xa - 1.4, ya - 4], [xb + 1.4, yb - 4], [xb + 1.4, yb - h + 4], [xa - 1.4, ya - h + 4]], i === 6 ? '#263749' : glass, true, 1.4);
      ctx.strokeStyle = '#263446'; ctx.lineWidth = 2;
      if (h > 25) line(ctx, [xa, ya - h * 0.48], [xb, yb - h * 0.48]);
      // Warm café silhouettes sit behind the glass rather than flat yellow rectangles.
      if (L >= 3 && i !== 6 && i % 2 === 0) {
        const cx = (xa + xb) / 2, cy = (ya + yb) / 2;
        ctx.fillStyle = '#e9ba4a'; ctx.fillRect(cx - 1.5, cy - 12, 3, 5);
        ctx.fillStyle = '#ffe6a0'; ctx.beginPath(); ctx.arc(cx, cy - 14, 1.8, 0, Math.PI * 2); ctx.fill();
      }
    }
    // Conical gold eave, with shaded facets and no flat saucer-like inner outline.
    const lowerY = y - base - h, upperY = lowerY - 9;
    for (let i = 0; i < 24; i++) {
      const a = i * Math.PI * 2 / 24, b = (i + 1) * Math.PI * 2 / 24;
      poly(ctx, [[x + Math.cos(a) * (r + 4), lowerY + Math.sin(a) * (ry + 2)], [x + Math.cos(b) * (r + 4), lowerY + Math.sin(b) * (ry + 2)], [x + Math.cos(b) * (r - 6), upperY + Math.sin(b) * (ry - 4)], [x + Math.cos(a) * (r - 6), upperY + Math.sin(a) * (ry - 4)]], L === 1 ? SLATE : i < 12 ? i % 4 === 0 ? '#ffe36a' : '#f4c52d' : '#cca11f', false);
    }
    ctx.beginPath(); ctx.ellipse(x, upperY, r - 6, ry - 4, 0, 0, Math.PI * 2); ctx.fillStyle = L === 1 ? SLATE : '#eac031'; ctx.fill();
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x, lowerY, r + 4, ry + 2, 0, 0, Math.PI); ctx.stroke();
  };
  tier(L === 1 ? 35 : L === 2 ? 46 : 57, 0, L === 1 ? 25 : 38);
  if (L >= 3) tier(41, 48, 24);
  if (L >= 3) {
  // Oval rooftop sign is part of the silhouette in the reference.
  ctx.beginPath(); ctx.ellipse(x, y - 94, 29, 10, 0, 0, Math.PI * 2); ctx.fillStyle = '#1d304a'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#ffd452'; ctx.font = '900 11px "Trebuchet MS", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('THE HIVE', x, y - 94); ctx.textBaseline = 'alphabetic';
  }
  if (L >= 4) tree(ctx, 1.26, -0.4, 0.88);
  if (L >= 3) for (const u of [-0.7, -0.3, 0.1, 0.5, 0.9]) shrub(ctx, u, 1.35, false);
  if (L >= 2) shrub(ctx, -1.15, 0.9, false);
  if (L >= 4) lamp(ctx, -1.2, 0.8, false);
}

/** Reference-inspired brick admissions hall, with a four-column pedimented entrance. */
function admissions(ctx: Ctx, L: number): void {
  if (L <= 2) { starterHall(ctx, L, 'ADMISSIONS', C.navy); return; }
  site(ctx, L, 3);
  // Retain the isometric front and side walls of the reference.
  tree(ctx, -1.2, 0.35, 0.78);
  tree(ctx, 1.2, -0.55, 0.78);
  const h = 51;
  walls(ctx, 2, -1.06, -1.0, 1.04, 0.79, 4, h, '#c87952');
  // Restrained paired upper windows and a few side windows, not an office grid.
  panes(ctx, 'L', -0.96, -0.51, 0.8, 32, 45, 2, 1, 0);
  panes(ctx, 'L', 0.51, 0.94, 0.8, 32, 45, 2, 1, 0);
  panes(ctx, 'R', -0.83, 0.6, 1.05, 13, 44, 3, 2, 0);
  // The roof outline steps inward at the back, with pale coping and a dark inset.
  const plan: [number, number][] = [[-1.1, 0.85], [1.1, 0.85], [1.1, -1.04], [0.25, -1.04], [0.05, -0.82], [-0.16, -1.04], [-1.1, -1.04]];
  poly(ctx, plan.map(([u, v]) => P(u, v, h + 3)), CREAM_LIGHT, true, 1.8);
  poly(ctx, plan.map(([u, v]) => P(u * 0.91, v * 0.88, h + 4)), SLATE, true, 1.1);
  // Glass doors and transom sit behind the generous stone portico.
  glassWall(ctx, 'L', -0.32, 0.32, 0.81, 6, 34, 2, 1);
  ctx.strokeStyle = '#d7ab40'; ctx.lineWidth = 1.5;
  for (const u of [-0.04, 0.04]) line(ctx, P(u, 0.83, 13), P(u, 0.83, 18));
  box(ctx, -0.77, 0.8, 0.77, 1.27, 4, 7, '#dac8a8');
  for (const u of [-0.64, -0.38, 0.38, 0.64]) {
    cylinder(ctx, u, 1.17, 0.075, 7, 29, CREAM_LIGHT, CREAM);
    cylinder(ctx, u, 1.17, 0.1, 6, 3, CREAM, CREAM_LIGHT);
    cylinder(ctx, u, 1.17, 0.09, 34, 3, CREAM, CREAM_LIGHT);
  }
  box(ctx, -0.8, 0.87, 0.8, 1.29, 37, 49, '#ead7b8');
  poly(ctx, [P(-0.85, 1.3, 49), P(0.85, 1.3, 49), P(0, 1.3, 68)], CREAM_LIGHT, true, 1.8);
  poly(ctx, [P(-0.62, 1.31, 52), P(0.62, 1.31, 52), P(0, 1.31, 64)], '#d4a274', true, 1);
  const [cx, cy] = P(0, 1.32, 57);
  ctx.beginPath(); ctx.arc(cx, cy, 2.4, 0, Math.PI * 2); ctx.fillStyle = CREAM_LIGHT; ctx.fill();
  const [nx, ny] = P(0, 1.31, 43);
  ctx.save(); ctx.translate(nx, ny); ctx.transform(1, 0.5, 0, 1, 0, 0);
  ctx.fillStyle = OUT; ctx.font = '900 8px "Trebuchet MS", system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('ADMISSIONS', 0, 0); ctx.restore();
  shrub(ctx, 1.2, 0.65, false);
  lamp(ctx, -1.13, 1.18, true);
  lamp(ctx, 1.15, 0.9, true);
}

/** Small furnished cafe patio. All dimensions remain inside the building's original lot. */
function cafePatio(ctx: Ctx, u: number, v: number, r = 14): void {
  const [x,y]=P(u,v,4);
  ctx.strokeStyle=OUT;ctx.lineWidth=1.2;
  for(const side of [-1,1]) {
    const cx=x+side*(r-2),cy=y+side*2;
    poly(ctx,[[cx-3,cy-9],[cx+3,cy-7],[cx+3,cy-1],[cx-3,cy-3]],'#b69a77',true,1);
    poly(ctx,[[cx-3,cy-3],[cx+3,cy-1],[cx+1,cy+2],[cx-5,cy]],'#a78a66',true,1);
    for(const dx of [-4,1])line(ctx,[cx+dx,cy],[cx+dx,cy+6]);
  }
  ctx.beginPath();ctx.ellipse(x,y-3,8,4,0,0,Math.PI*2);ctx.fillStyle='#c7a16e';ctx.fill();ctx.stroke();
  line(ctx,[x,y-3],[x,y+5]);
  ctx.beginPath();ctx.ellipse(x,y+5,4,1.5,0,0,Math.PI*2);ctx.fillStyle='#555a5f';ctx.fill();ctx.stroke();
  line(ctx,[x,y-3],[x,y-27]);
  for(let i=0;i<6;i++){
    const a=i*Math.PI/3,b=(i+1)*Math.PI/3;
    poly(ctx,[[x,y-30],[x+Math.cos(a)*r,y-21+Math.sin(a)*r*0.34],[x+Math.cos(b)*r,y-21+Math.sin(b)*r*0.34]],i%2?'#d5a63d':'#315d94',true,1);
  }
}

/** Low planted hedge with irregular leaf edges, not spherical ornaments. */
function cafeHedge(ctx: Ctx, u: number, v: number, length: number): void {
  box(ctx,u,v,u+length,v+0.14,3,5,'#8d806b');
  for(let i=0;i<Math.ceil(length/0.14);i++){
    const [x,y]=P(u+i*0.14,v+0.07,6);
    const pts:[number,number][]=[];
    for(let k=0;k<12;k++){const a=k*Math.PI/6,r=k%2?3.7:5;pts.push([x+Math.cos(a)*r,y+Math.sin(a)*r*0.7-2]);}
    poly(ctx,pts,i%2?'#5d954c':'#719f51',true,0.6);
  }
}

function coffeeCart(ctx: Ctx, L: number): void {
  site(ctx, L, 3, '#a5a7a8');
  if (L >= 4) tree(ctx,1.15,-0.9,0.65);
  if (L >= 3) shrub(ctx,-1.15,0.2,false);
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
  // Central mast reaches the countertop; the full six-panel canopy has real depth.
  const [ux,uy]=P(0,0,36);
  ctx.strokeStyle=OUT;ctx.lineWidth=2.7;line(ctx,[ux,uy],[ux,uy-65]);
  ctx.strokeStyle='#babdc3';ctx.lineWidth=1;line(ctx,[ux+0.4,uy],[ux+0.4,uy-65]);
  const edgeY=uy-47;
  for(let i=0;i<6;i++){
    const a=i*Math.PI/3,b=(i+1)*Math.PI/3;
    poly(ctx,[[ux,uy-70],[ux+Math.cos(a)*61,edgeY+Math.sin(a)*14],[ux+Math.cos(b)*61,edgeY+Math.sin(b)*14]],i%2?'#d5a93b':'#345f9a',true,1.3);
  }
  // Two sagging strings beneath the front eave, with multicolored bulbs.
  if (L >= 3) for(const side of [-1,1]){
    ctx.strokeStyle='#323335';ctx.lineWidth=0.8;
    ctx.beginPath();ctx.moveTo(ux,edgeY+2);ctx.quadraticCurveTo(ux+side*30,edgeY+24,ux+side*60,edgeY+1);ctx.stroke();
    for(let i=1;i<7;i++){
      const k=i/7,bx=ux+side*60*k,by=edgeY+2*(1-k)*(1-k)+48*k*(1-k)+k*k;
      ctx.beginPath();ctx.arc(bx,by+2,1.25,0,Math.PI*2);ctx.fillStyle=['#e6b754','#63a77d','#d77893','#7eabd8'][i%4];ctx.fill();
    }
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
  if (L >= 2) cafePatio(ctx,1.04,0.2,12);
  if (L >= 4) cafePatio(ctx,0.9,1.12,13);
  if (L >= 3) cafeHedge(ctx,-1.25,1.15,0.55);
  if (L >= 4) cafeHedge(ctx,0.15,1.38,0.48);
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
  // The main tank and its live fill gauge share the same revised side position.
  const tankH=30+L*4;
  const h=40+L*4;
  cylinder(ctx,-0.72,-0.95,0.4,4,tankH+10+L*3,'#c8ccd2','#9aa0a8');
  cylinder(ctx,0.85,-0.85,0.5,4,tankH+22+L*3,'#c8ccd2','#9aa0a8');
  if (L >= 3) cafeHedge(ctx,-1.2,-0.05,0.12);
  campusBlock(ctx,-1.1,-0.35,1.05,0.85,h);
  // Large uninterrupted amber shopfront with dark steel mullions.
  for(let i=0;i<5;i++){
    const u=-0.98+i*0.38;
    poly(ctx,[P(u,0.86,6),P(u+0.34,0.86,6),P(u+0.34,0.86,h-5),P(u,0.86,h-5)],i%2?'#ffd982':'#deb35d',true,1.7);
  }
  for(const u of [-0.22,0.16]) {
    poly(ctx,[P(u,0.88,6),P(u+0.32,0.88,6),P(u+0.32,0.88,h-13),P(u,0.88,h-13)],'#f5cf78',true,1.7);
  }
  ctx.strokeStyle='#c9cbd0';ctx.lineWidth=1.8;
  for(const u of [0.06,0.19]) line(ctx,P(u,0.9,14),P(u,0.9,23));
  box(ctx,1.055,-0.15,1.09,0.62,10,h-9,CREAM);
  panes(ctx,'R',-0.11,0.58,1.1,12,h-11,2,2,1);
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
  if (L >= 3) cafeHedge(ctx,1.12,-0.1,0.15);
  if (L >= 2) cafePatio(ctx,0.46,1.27,15);
}

/** Residence hall: a long slate-roofed hall with gabled bays on the front, taller with each upgrade. */
function reshall(ctx: Ctx, L: number): void {
  site(ctx, L, 4);
  if (L >= 3) tree(ctx,-1.72,1.1,0.7);
  const floors = L <= 1 ? 1 : L <= 2 ? 2 : L >= 5 ? 4 : 3;
  const h = 14 + floors * 15;
  walls(ctx, 2, -1.7, -1.4, 1.6, 1.2, 4, h, C.brick);
  if (L >= 3) {
    panes(ctx, 'L', -0.55, 0.45, 1.2, 8, h - 4, 2, floors);
    panes(ctx, 'R', -1.3, 1.1, 1.6, 8, h - 4, 4, floors);
  } else {
    windowsL(ctx, -1.6, 1.5, 1.2, 8, h - 4, 6, floors);
    windowsR(ctx, -1.3, 1.1, 1.6, 8, h - 4, 4, floors);
  }
  trim(ctx, L, -1.7, -1.4, 1.6, 1.2, h);
  gable(ctx, -1.8, -1.5, 1.7, 1.3, h, 22, SLATE);
  box(ctx,-0.1,-0.2,0.2,0.1,h+16,h+25,CREAM);
  if (L >= 3) {
    // gabled bays standing proud of the front
    for (const [a, b] of [
      [-1.55, -0.65],
      [0.55, 1.45],
    ]) {
      walls(ctx, 2, a, 1.2, b, 1.42, 4, h, C.brick);
      poly(ctx,[P(a+.13,1.43,7),P(b-.13,1.43,7),P(b-.13,1.43,h-2),P(a+.13,1.43,h-2)],'#38556a',true,1.2);
      ctx.strokeStyle='#ced6d5';ctx.lineWidth=1.2;
      line(ctx,P((a+b)/2,1.44,7),P((a+b)/2,1.44,h-2));
      for(let j=1;j<floors*2;j++){const z=7+j*(h-9)/(floors*2);line(ctx,P(a+.13,1.44,z),P(b-.13,1.44,z));}
      poly(ctx,[P(a+.16,1.45,10),P(a+.25,1.45,10),P(b-.18,1.45,h-4),P(b-.27,1.45,h-4)],'rgba(189,218,233,.24)',false);
      box(ctx,a+0.09,1.44,a+0.14,1.46,5,h,CREAM);
      box(ctx,b-0.14,1.44,b-0.09,1.46,5,h,CREAM);
      gable(ctx, a - 0.07, 0.6, b + 0.07, 1.48, h, 25, SLATE, 'v');
      poly(ctx, [P(a - 0.07, 1.48, h), P(b + 0.07, 1.48, h), P((a + b) / 2, 1.48, h + 25)], CREAM, true, 1.8);
      poly(ctx,[P(a+0.12,1.49,h+3),P(b-0.12,1.49,h+3),P((a+b)/2,1.49,h+20)],'#3b4350',true,1);

    }
  }
  entry(ctx, L, -0.05, 1.2, 0.5, 16, C.navy);
  if (L >= 3) {
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
  if (L >= 4) tree(ctx,1.75,0.4,0.65);
  if (L >= 3) shrub(ctx,0.8,1.72,false);
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
  site(ctx, L, 3, L <= 1 ? undefined : C.concrete);
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
    drawRaTowerCanopy(ctx, L);
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

/** Front canopy layer, also drawn after the animated RA so the roof stays above them. */
export function drawRaTowerCanopy(ctx: Ctx, L: number): void {
  if (L < 2) return;
  const h = 42 + L * 5;
  const tier = buildingThemeTier('ratower', L);
  const theme = buildingThemes[tier - 1];
  ctx.save();
  ctx.strokeStyle = tier === 8 ? '#454b55' : shade(theme.body, -0.35);
  ctx.lineWidth = 2.2;
  for (const [u, v] of [[-0.8, 0.8], [0.8, 0.8], [0.8, -0.8]]) {
    line(ctx, P(u, v, h + 16), P(u, v, h + 36));
  }
  pyramid(ctx, -0.95, -0.95, 0.95, 0.95, h + 36, 16, theme.roof);
  ctx.restore();
}

function safetyCart(ctx: Ctx, L: number): void {
  site(ctx, L, 3, '#8f939a');
  // Reference's landscaped parking island and navy campus pennant.
  shrub(ctx,-1.18,0.75,false);
  lamp(ctx,-1.25,0.55,true);
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
  // Sculpted hood shoulders, cowl and metallic highlight rather than a plain cuboid.
  poly(ctx,[P(0.5,-0.46,29),P(1.03,-0.44,29),P(1.03,0.44,29),P(0.5,0.46,29)],'#333a46',true,1.2);
  poly(ctx,[P(0.52,-0.32,30),P(0.96,-0.32,30),P(1.01,0.32,29),P(0.52,0.32,30)],'#222833',true,0.8);
  ctx.strokeStyle='#65707e';ctx.lineWidth=1;
  for(const v of [-0.28,0.28]) line(ctx,P(0.52,v,31),P(0.98,v,30));
  // Window openings and thick pillars read clearly at the normal game scale.
  for (const [u0, u1] of [[-0.83, -0.48], [-0.42, -0.07], [-0.01, 0.27]]) {
    poly(ctx, [P(u0, 0.485, 32), P(u1, 0.485, 32), P(Math.min(u1, 0.16), 0.43, 46), P(u0 + 0.05, 0.43, 46)], '#20445e', true, 1.4);
  }
  poly(ctx, [P(0.47, -0.38, 32), P(0.47, 0.38, 32), P(0.23, 0.34, 45), P(0.23, -0.34, 45)], '#295672', true, 1.2);
  poly(ctx, [P(0.46, -0.3, 33), P(0.46, -0.12, 33), P(0.24, 0.2, 44), P(0.24, 0.03, 44)], 'rgba(154,210,237,0.22)', false);
  // White side sweep, door seams and handles.
  poly(ctx,[P(-0.98,0.505,30),P(-0.6,0.505,28),P(0.1,0.505,27),P(0.76,0.505,22),P(0.55,0.505,27),P(-0.15,0.505,30)],C.white,false);
  // Running board and flared wheel shoulders.
  box(ctx,-0.86,0.5,0.86,0.58,10,13,'#141a23');
  ctx.strokeStyle='#4c5562';ctx.lineWidth=3;
  for(const u of [-0.68,0.68]) {
    const [wx,wy]=P(u,0.525,12);
    ctx.beginPath();ctx.ellipse(wx,wy-1,9,11,0.38,Math.PI,Math.PI*2);ctx.stroke();
  }
  ctx.strokeStyle = '#697585'; ctx.lineWidth = 0.8;
  for (const u of [-0.44, 0.01, 0.46]) line(ctx, P(u, 0.505, 14), P(u, 0.505, 30));
  ctx.strokeStyle = trim; ctx.lineWidth = 1.5;
  for (const u of [-0.36, 0.1]) line(ctx, P(u, 0.515, 28), P(u + 0.12, 0.515, 28));
  // Side lettering follows the body perspective; no external logo assets.
  const [tx, ty] = P(-0.84, 0.52, 21);
  ctx.save(); ctx.translate(tx, ty); ctx.transform(1, 0.5, 0, 1, 0, 0);
  ctx.fillStyle = C.white; ctx.font = 'bold 5px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('SECURITY', 0, 0);
  ctx.font = 'bold 2.1px sans-serif'; ctx.fillText('CEDARVILLE UNIVERSITY', 0, 4);
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
  for(const v of [-0.4,0.29]) poly(ctx,[P(1.05,v,13),P(1.05,v+0.11,13),P(1.05,v+0.1,16),P(1.05,v,16)],'#aebbc4',true,0.7);
  const [mx,my]=P(-0.83,0.52,15);
  ctx.save();ctx.translate(mx,my);ctx.transform(1,0.5,0,1,0,0);ctx.fillStyle=C.white;ctx.font='bold 3.3px sans-serif';ctx.fillText('U-1',0,0);ctx.restore();
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
  shrub(ctx,0.72,1.15,false);shrub(ctx,1.12,0.92,false);
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
  // The pad, rim and water remain entirely within Cedar Sprayer's original lot.
  site(ctx, 1, 3, '#dbc7ad'); // keep the reference's bare tiled pad, without a tree behind the jet
  void L; // upgrades still affect simulation; this reference appearance is shared
  const [x, y] = P(0, 0, 17);
  const rx = 48, ry = 23;
  ctx.beginPath(); ctx.ellipse(x, y + 12, rx, ry, 0, 0, Math.PI);
  ctx.lineTo(x - rx, y); ctx.ellipse(x, y, rx, ry, 0, Math.PI, Math.PI * 2); ctx.closePath();
  ctx.fillStyle = '#bab1a8'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.stroke();
  // Individual vertical coping blocks on the near wall.
  ctx.strokeStyle = '#827b74'; ctx.lineWidth = 0.9;
  for (let i = 1; i < 12; i++) {
    const a = i * Math.PI / 12;
    line(ctx, [x + Math.cos(a) * rx, y + Math.sin(a) * ry], [x + Math.cos(a) * rx, y + 12 + Math.sin(a) * ry]);
  }
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = '#f5e5d7'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.8; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(x, y, rx - 7, ry - 6, 0, 0, Math.PI * 2); ctx.fillStyle = '#414b57'; ctx.fill(); ctx.stroke();
  const water = ctx.createLinearGradient(0, y - 14, 0, y + 15); water.addColorStop(0, '#117ab5'); water.addColorStop(1, '#23c7fb');
  ctx.beginPath(); ctx.ellipse(x, y + 2, rx - 9, ry - 8, 0, 0, Math.PI * 2); ctx.fillStyle = water; ctx.fill();
  ctx.strokeStyle = 'rgba(225,252,255,0.85)'; ctx.lineWidth = 1.4;
  for (const r of [11, 19, 28]) { ctx.beginPath(); ctx.ellipse(x, y + 2, r, r * 0.4, 0, 0, Math.PI * 2); ctx.stroke(); }
  // Broader foaming cluster rather than five rigid straight sticks.
  for (const [dx, h] of [[-7, 30], [7, 32], [-3.5, 43], [3.5, 44], [0, 50]]) {
    ctx.beginPath(); ctx.moveTo(x + dx, y); ctx.bezierCurveTo(x + dx * 1.05, y - h * 0.35, x + dx * 0.85, y - h, x + dx * 0.6, y - h);
    ctx.strokeStyle = '#3ac7f6'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.stroke(); ctx.strokeStyle = '#dffbff'; ctx.lineWidth = 2.1; ctx.stroke();
  }
  for (const [dx, dy, r] of [[0, -50, 3], [-2, -46, 4], [3, -42, 4], [-4, -40, 3], [0, -37, 4]]) { ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2); ctx.fillStyle = '#f4ffff'; ctx.fill(); }
  ctx.lineCap = 'butt';
}

/** Stone Bible professor tower; the live professor stays at the original platform height. */
function bibleProf(ctx: Ctx, L: number): void {
  site(ctx,L,3,'#a0a4a6');
  const h=84+L*6; // world.ts positions the praying professor at exactly this height
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
  const [x,y]=P(0,0.7,h*0.62);
  const outer:[number,number][]=[[x-20,y-17],[x-4,y-31],[x+18,y-21],[x+13,y+12],[x+3,y+34],[x-12,y+7]];
  poly(ctx,outer,'#525b6c',true,1.8);
  const inner:[number,number][]=[[x-11,y-9],[x+1,y-17],[x+11,y-10],[x+8,y+5],[x-2,y+11],[x-11,y+2]];
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
  pad(ctx, 3, '#b8b5aa');
  const timber = L >= 3 ? '#85653c' : '#a18450';
  const beam = (a: [number, number], b: [number, number], width = 7): void => {
    ctx.lineCap = 'round'; ctx.strokeStyle = OUT; ctx.lineWidth = width + 2; line(ctx, a, b);
    ctx.strokeStyle = timber; ctx.lineWidth = width; line(ctx, a, b);
    ctx.strokeStyle = '#c2a16a'; ctx.lineWidth = 0.7; line(ctx, [a[0]-1,a[1]], [b[0]-1,b[1]]);
  };
  // Wheeled timber serving platform, with planks and bolted iron straps.
  for (const u of [-0.8,0.8]) for(const v of [-0.85,0.85]) {
    const [x,y]=P(u,v,4);ctx.fillStyle='#55504a';ctx.strokeStyle=OUT;ctx.lineWidth=1.5;
    ctx.beginPath();ctx.ellipse(x,y,5,6,0,0,Math.PI*2);ctx.fill();ctx.stroke();
  }
  box(ctx,-1.08,-1.08,1.08,1.08,5,12,timber);
  box(ctx,-1.12,-1.12,1.12,1.12,12,15,'#b5a78b');
  ctx.lineWidth=0.7;ctx.strokeStyle='#695b48';
  for(let q=-0.9;q<1;q+=0.3)line(ctx,P(q,-1.1,15),P(q,1.1,15));
  for(const u of [-0.8,0,0.8]) {
    box(ctx,u-0.045,1.08,u+0.045,1.13,5,15,'#73767a');
    const [x,y]=P(u,1.135,10);ctx.fillStyle=OUT;ctx.fillRect(x-0.8,y-0.8,1.6,1.6);
  }
  // Prep table with stacked metal trays and tiny vegetable tins.
  box(ctx,-1.36,0.1,-0.9,0.8,5,29,'#836342');
  box(ctx,-1.4,0.06,-0.86,0.84,29,32,'#b28d57');
  for(let z=33;z<=38;z+=1.5)box(ctx,-1.31,0.14,-1.02,0.44,z,z+0.7,'#aab0b2');
  for(const v of [0.54,0.69])cylinder(ctx,-1.17,v,0.065,32,6,'#739d59','#b9c1ba');
  // Serving vat and spoon, recognizable even in the small game view.
  cylinder(ctx,0.89,-0.9,0.29,15,22,'#aeb6bd','#f7b341');
  const [vx,vy]=P(0.89,-0.9,37);
  ctx.fillStyle='#629347';for(const [x,y]of [[-4,0],[3,-2],[5,2]]){ctx.beginPath();ctx.arc(vx+x,vy+y,1.3,0,7);ctx.fill();}
  beam([vx+4,vy+1],[vx+11,vy-17],2);
  plaque(ctx,vx,vy+12,'SPECIAL',3.4);
  // Two braced A-frames, iron reinforcing plates and rope bindings.
  for(const v of [-0.46,0.46]) {
    box(ctx,-0.83,v-0.08,0.83,v+0.08,15,20,timber);
    const top=P(0,v,CATAPULT_AXLE_Z);
    for(const u of [-0.72,0.72]) {
      beam(P(u,v,20),top,7);
      const [x,y]=P(u*0.48,v,40);
      ctx.strokeStyle='#d0bd8a';ctx.lineWidth=1;
      for(let k=-2;k<=2;k++)line(ctx,[x-4,y+k*1.5],[x+4,y+k*1.5+1]);
    }
    const a=P(-0.5,v,31),b=P(0.5,v,31);
    ctx.strokeStyle=OUT;ctx.lineWidth=5;line(ctx,a,b);ctx.strokeStyle='#818386';ctx.lineWidth=3;line(ctx,a,b);
    ctx.fillStyle=OUT;for(const pt of [a,b]){ctx.beginPath();ctx.arc(pt[0],pt[1],1,0,7);ctx.fill();}
    const [x,y]=top;poly(ctx,[[x-4,y-5],[x+4,y-3],[x+4,y+6],[x-4,y+4]],'#9b9c9b',true,1);
  }
  beam(P(0,-0.54,CATAPULT_AXLE_Z),P(0,0.54,CATAPULT_AXLE_Z),4);
  // Winch rope and hanging tie-down chains.
  ctx.strokeStyle='#c8b88e';ctx.lineWidth=1.4;
  line(ctx,P(-0.45,-0.4,42),P(-0.72,0.7,24));
  for(const u of [-0.6,0.65]) {
    const [x,y]=P(u,0.86,22);ctx.strokeStyle='#45464a';ctx.lineWidth=1;
    for(let k=0;k<6;k++){ctx.beginPath();ctx.ellipse(x+k*0.8,y+k*2,1.6,2.5,0.4,0,7);ctx.stroke();}
  }
  // Dining-hall cook: hat, apron, smile and oven mitt beside the winch.
  const [cx,cy]=P(-0.48,0.74,17);
  ctx.fillStyle='#26333d';ctx.fillRect(cx-4,cy-2,3,5);ctx.fillRect(cx+1,cy-2,3,5);
  poly(ctx,[[cx-4,cy-19],[cx+3,cy-19],[cx+5,cy],[cx-5,cy]],'#f4eee0',true,1);
  ctx.fillStyle='#dfb58d';ctx.strokeStyle=OUT;ctx.lineWidth=0.8;ctx.beginPath();ctx.arc(cx,cy-23,4,0,7);ctx.fill();ctx.stroke();
  ctx.fillStyle='#e5f0e8';for(const ox of [-3,0,3]){ctx.beginPath();ctx.arc(cx+ox,cy-28,3,0,7);ctx.fill();ctx.stroke();}
  ctx.fillStyle=OUT;ctx.fillRect(cx+1,cy-24,0.8,1);ctx.beginPath();ctx.arc(cx+1,cy-22,1.5,0,2.3);ctx.stroke();
  ctx.fillStyle='#b8753e';ctx.beginPath();ctx.ellipse(cx+7,cy-17,2.5,4,-0.5,0,7);ctx.fill();ctx.stroke();
  const [sx,sy]=P(0,1.34,13);
  plaque(ctx,sx,sy,"CHUCK'S",7);
  ctx.lineCap='butt';
}

/** Height (px above the footprint centre) of the Stinger Statue's raised stinger tip: where its beam starts. */
export const STINGER_TIP_Z = 92;

/** Chrome campus sculpture, with the existing beam origin and two-tile lot retained. */
function stinger(ctx: Ctx, L: number): void {
  pad(ctx, 2, C.stone);
  // dark granite plinth with a polished cap
  const s = 0.42;
  box(ctx, -s, -s, s, s, 4, 34, '#3b3e48');
  box(ctx, -s - 0.08, -s - 0.08, s + 0.08, s + 0.08, 34, 37, '#aab1ba');
  // donor plaque on the front-left face
  {
    const a = P(-0.22, s, 26);
    const b = P(0.22, s, 26);
    const c = P(0.22, s, 15);
    const d = P(-0.22, s, 15);
    poly(ctx, [a, b, c, d], '#15161c', true, 1.2);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo((a[0] + d[0]) / 2 + 3, (a[1] + d[1]) / 2 + 1.5);
    ctx.lineTo((b[0] + c[0]) / 2 - 3, (b[1] + c[1]) / 2 - 1.5);
    ctx.stroke();
  }
  // sign struts
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-8, -37);
  ctx.lineTo(-20, -46);
  ctx.moveTo(8, -37);
  ctx.lineTo(20, -46);
  ctx.stroke();
  // arched black CEDARVILLE sign
  ctx.beginPath();
  ctx.moveTo(-44, -44);
  ctx.quadraticCurveTo(0, -52, 44, -44);
  ctx.lineTo(41, -59);
  ctx.quadraticCurveTo(0, -68, -41, -59);
  ctx.closePath();
  ctx.fillStyle = '#17181f';
  ctx.fill();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = L >= 2 ? C.gold : '#dfe6ec';
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = '900 11px "Trebuchet MS", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const word = 'CEDARVILLE';
  // A single word keeps natural letter spacing and fits inside the dark banner.
  ctx.fillText(word, 0, -54.5, 79);

  // chrome yellow jacket perched on the sign, facing the viewer, stinger raised
  const chrome = (y0: number, y1: number): CanvasGradient => {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, '#f7fbfd');
    g.addColorStop(0.45, '#a9b8c4');
    g.addColorStop(0.6, '#5f6d7a');
    g.addColorStop(1, '#cfd9e0');
    return g;
  };
  const blob = (x: number, y: number, rx: number, ry: number, rot = 0): void => {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    ctx.fillStyle = chrome(y - ry, y + ry);
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = OUT;
    ctx.stroke();
  };
  // wings
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(sx * 15, -84, 12, 4.5, sx * -0.75, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(226,238,246,0.9)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = OUT;
    ctx.stroke();
  }
  // raised abdomen + stinger spike
  blob(0, -80, 6.5, 8.5);
  if (L >= 2) {
    ctx.strokeStyle = C.gold;
    ctx.lineWidth = 2;
    for (const yy of [-83, -79]) {
      ctx.beginPath();
      ctx.moveTo(-5, yy);
      ctx.quadraticCurveTo(0, yy + 2, 5, yy);
      ctx.stroke();
    }
  }
  poly(ctx, [[-2.5, -87], [0, -STINGER_TIP_Z - 3], [2.5, -87]], L >= 3 ? '#8fd0ff' : '#e6edf2', true, 1.5);
  // legs gripping the sign
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 3.4;
  const legs: [number, number, number, number][] = [
    [9, -72, 22, -62],
    [11, -70, 30, -60],
    [7, -74, 14, -63],
  ];
  const drawLegs = (): void => {
    ctx.beginPath();
    for (const sx of [-1, 1]) {
      for (const [kx, ky, fx, fy] of legs) {
        ctx.moveTo(sx * 5, -70);
        ctx.lineTo(sx * kx * 1.5, ky - 6);
        ctx.lineTo(sx * fx, fy);
      }
    }
    ctx.stroke();
  };
  drawLegs();
  ctx.strokeStyle = '#c3ced7';
  ctx.lineWidth = 1.6;
  drawLegs();
  // thorax + head
  blob(0, -72, 9, 7.5);
  blob(0, -65, 7.5, 6);
  // antennae
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-3, -70);
  ctx.quadraticCurveTo(-9, -78, -13, -73);
  ctx.moveTo(3, -70);
  ctx.quadraticCurveTo(9, -78, 13, -73);
  ctx.stroke();
  // angry eyes
  ctx.fillStyle = L >= 3 ? '#4aa8ff' : '#20222b';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(sx * 3.6, -65.5, 2.4, 1.6, sx * 0.5, 0, Math.PI * 2);
    ctx.fill();
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
  // Cedar Lake: a landscaped campus shoreline, terrace steps and a central fountain.
  // All details share the village/menu sprite, so the info icon matches the placed lake.
  const rim: [number, number][] = [[-56, 0], [-46, -12], [-23, -17], [0, -24], [24, -16], [47, -10], [55, 2], [39, 14], [20, 18], [-5, 25], [-30, 18], [-48, 12]];
  const shore = (scale: number, fill: string | CanvasGradient, width = 1.6): void => {
    ctx.beginPath();
    for (let i = 0; i < rim.length; i++) {
      const p0 = rim[(i + rim.length - 1) % rim.length], p1 = rim[i], p2 = rim[(i + 1) % rim.length], p3 = rim[(i + 2) % rim.length];
      if (!i) ctx.moveTo(p1[0] * scale, p1[1] * scale);
      ctx.bezierCurveTo((p1[0] + (p2[0] - p0[0]) / 6) * scale, (p1[1] + (p2[1] - p0[1]) / 6) * scale, (p2[0] - (p3[0] - p1[0]) / 6) * scale, (p2[1] - (p3[1] - p1[1]) / 6) * scale, p2[0] * scale, p2[1] * scale);
    }
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = width; ctx.stroke();
  };
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  shore(1, '#749a47', 2.2);
  shore(0.90, '#aab3aa', 1.1);
  const water = ctx.createLinearGradient(0, -22, 0, 24);
  water.addColorStop(0, '#348c9f'); water.addColorStop(1, '#3e9eaf');
  shore(0.82, water, 1.1);
  // Short radial mortar joints keep the shoreline readable without noisy texture.
  ctx.strokeStyle = '#505b60'; ctx.lineWidth = 0.65;
  for (let i = 0; i < rim.length; i++) {
    const a = rim[i], b = rim[(i + 1) % rim.length];
    for (const t of [0, 0.5]) {
      const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
      ctx.beginPath(); ctx.moveTo(x * 0.83, y * 0.83); ctx.lineTo(x * 0.90, y * 0.90); ctx.stroke();
    }
  }
  // Three pale terrace steps on the near-left bank.
  for (let i = 2; i >= 0; i--) {
    const y = i * 2.4;
    ctx.beginPath(); ctx.moveTo(-48, 6 + y);
    ctx.bezierCurveTo(-43, 12 + y, -34, 17 + y, -22, 18 + y);
    ctx.lineTo(-20, 15 + y);
    ctx.bezierCurveTo(-31, 14 + y, -40, 10 + y, -45, 4 + y);
    ctx.closePath(); ctx.fillStyle = i % 2 ? '#aeb3b5' : '#d4d7d4'; ctx.fill();
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.1; ctx.stroke();
  }
  // A small landscaped tree, kept below the fountain tip.
  ctx.fillStyle = '#82623d'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.2;
  ctx.fillRect(-30, -27, 3, 9); ctx.strokeRect(-30, -27, 3, 9);
  ctx.beginPath(); ctx.moveTo(-37, -27); ctx.bezierCurveTo(-42, -33, -35, -38, -31, -36);
  ctx.bezierCurveTo(-28, -42, -21, -37, -22, -34); ctx.bezierCurveTo(-15, -33, -20, -25, -25, -26);
  ctx.bezierCurveTo(-28, -22, -34, -24, -37, -27); ctx.closePath();
  ctx.fillStyle = '#739b3e'; ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#96b85a'; ctx.beginPath(); ctx.ellipse(-30, -32, 5, 3, -0.2, 0, Math.PI * 2); ctx.fill();
  // Fountain rings and the central jet; restrained cyan edges work at menu and map scales.
  ctx.strokeStyle = '#bce9ea'; ctx.lineWidth = 1.1;
  for (const [x, y, w] of [[4, 4, 8], [-15, 2, 4], [23, 2, 4]]) {
    ctx.beginPath(); ctx.ellipse(x, y, w, w * 0.28, 0, 0.15, Math.PI * 1.9); ctx.stroke();
  }
  ctx.strokeStyle = '#effeff'; ctx.lineWidth = 1.2;
  for (const end of [-15, 23]) {
    ctx.beginPath(); ctx.moveTo(4, 3); ctx.quadraticCurveTo(end, -21, end, 1); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(2.5, 3); ctx.bezierCurveTo(2, -9, 2, -31, 4, -35);
  ctx.bezierCurveTo(6, -31, 6, -9, 5.5, 3); ctx.closePath();
  ctx.fillStyle = '#d7f5f4'; ctx.fill(); ctx.strokeStyle = '#368394'; ctx.lineWidth = 0.8; ctx.stroke();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(4, 1); ctx.lineTo(4, -29); ctx.stroke();
  ctx.restore();
}

// Approved wall/DMC palette. Natural effects retain their original colors.
const buildingThemes=[
 {name:'Timber',body:'#a8713c',trim:'#c99a62',roof:'#a8713c',floor:'#c9b48a'},
 {name:'Brick',body:'#bf5a3f',trim:'#d97a5f',roof:'#bd5c43',floor:'#c3b5a1'},
 {name:'Dark brick + stone',body:'#a34a3a',trim:'#b8b2a7',roof:'#a34a3a',floor:'#b8b2a7'},
 {name:'Grey + silver',body:'#9aa0a8',trim:'#dfe3e8',roof:'#c4c9cf',floor:'#aeb4bb'},
 {name:'Gold',body:'#c9a13a',trim:'#f5c32c',roof:'#f5c32c',floor:'#b9aa7c'},
 {name:'Blue + gold',body:'#2e63b8',trim:'#f5c32c',roof:'#2e63b8',floor:'#a6adb6'},
 {name:'Navy + gold',body:'#1c3d7a',trim:'#f5c32c',roof:'#1c3d7a',floor:'#959eac'},
 {name:'Obsidian black',body:'#272c34',trim:'#525b68',roof:'#171b22',floor:'#454c57'}
];
type BuildingRGB=[number,number,number];
function buildingRgb(s:string):BuildingRGB|null{
 if(s.startsWith('#')){let x=s.slice(1);if(x.length===3)x=x.split('').map(c=>c+c).join('');if(x.length!==6)return null;return [parseInt(x.slice(0,2),16),parseInt(x.slice(2,4),16),parseInt(x.slice(4,6),16)];}
 let m=s.match(/^rgb\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)\s*\)$/);return m?[+m[1],+m[2],+m[3]]:null;
}
function buildingColorOutput(v:BuildingRGB){return `rgb(${v.map(n=>Math.max(0,Math.min(255,Math.round(n)))).join(',')})`;}
function buildingShaded(target:string, n:number){const v=buildingRgb(target)!;return buildingColorOutput(v.map(x=>n>=0?x+(255-x)*n:x*(1+n)) as BuildingRGB);}
const buildingMaterials:[string,string][]=[
 ['#bf5a3f','body'],['#93402c','body'],['#c87952','body'],['#ce8050','body'],['#b98652','body'],['#a8713c','body'],
 ['#b8b2a7','body'],['#8f897e','body'],['#f1e4c6','trim'],['#f8f0dc','trim'],['#f4efe4','trim'],['#f5c32c','trim'],['#c9971a','trim'],
 ['#2e63b8','roof'],['#1c3d7a','roof'],['#4f5262','roof'],['#53657d','roof'],['#272d39','roof'],
 ['#d9d2c3','floor'],['#e6dfd0','floor'],['#c9b48a','floor']
];
const buildingColorCaches = new Map<string, Map<string, string>>();
export function buildingThemeTier(type: BuildingType, level: number): number {
 const levels = BUILDINGS[type].levels;
 const L = Math.max(1, Math.min(levels.length, Math.floor(level)));
 if (type === 'dmc') return L;
 // Match the approved one-card-per-upgrade catalog: use the last DMC tier
 // where this level is the campus maximum. Intermediate upgrades sharing an
 // unlock keep that unlock's tier. This changes artwork, never requirements.
 const lastMaxDmc = levels[L] ? levels[L].dmc - 1 : buildingThemes.length;
 return Math.max(1, levels[L-1].dmc, lastMaxDmc);
}
export function buildingThemeContext(ctx: Ctx, type: BuildingType, level: number): Ctx {
 if (level <= 0 || type === 'ratower') return ctx;
 const tier = buildingThemeTier(type, level);
 const t:any=buildingThemes[tier-1];
 const key = `${type}:${tier}`;
 let colorCache = buildingColorCaches.get(key);
 if (!colorCache) { colorCache = new Map<string,string>(); buildingColorCaches.set(key,colorCache); }
 const cache = colorCache;
 const recolor=(s:any)=>{
  if(typeof s!=='string')return s;if(cache.has(s))return cache.get(s);
  const v=buildingRgb(s);if(!v)return s;
  const [r,g,b]=v,hi=Math.max(...v),lo=Math.min(...v),sat=hi-lo;
  // Leave ink, transparency, vegetation, water/glass, warm lamps and skin readable.
  if(s.toLowerCase()==='#1e1b2b'||hi<42)return s;
  if(g>r*1.13&&g>b*1.05)return s;
  if(b>r*1.16&&g>r*1.12&&g>b*.66&&hi>130)return s;
  if(r>225&&g>175&&g<220&&b>135&&b<185)return s;
  if(['#ffd870','#ffe9a8','#ffd877','#ffe6a0'].includes(s.toLowerCase()))return s;
  if(type==='lake'&&(b>r||g>r))return s;
  // Closely match source materials, including their normal shaded variants.
  let best=Infinity,role='body',amount=0;
  for(const [hex,k]of buildingMaterials){const src=buildingRgb(hex)!;for(const a of [-.4,-.3,-.25,-.2,-.18,-.15,-.12,-.1,0,.08,.12,.18,.2,.25]){
   const candidate=src.map(x=>a>=0?x+(255-x)*a:x*(1+a));const e=candidate.reduce((p,x,j)=>p+(x-v[j])**2,0);
   if(e<best){best=e;role=k;amount=a;}
  }}
  let result;
  if(best<300) result=buildingShaded(t[role],amount);
  else if(r>g*1.2&&r>b*1.2) result=buildingShaded(t.body,(hi-170)/600);
  else if(b>r*1.05&&b>g*.95)result=buildingShaded(t.roof,(hi-120)/700);
  else if(sat<38){
   const lum=(r+g+b)/3;result=buildingShaded(lum>205?t.trim:lum>135?t.floor:lum>75?t.body:t.roof,(lum>205?(lum-230)/800:(lum-130)/1000));
  }else if(r>g&&g>b)result=buildingShaded(hi>210?t.trim:t.body,(hi-180)/700);
  else result=tier===8?buildingShaded(t.body,(hi-130)/850):buildingShaded(t.roof,(hi-130)/850);
  // Approved material blend: 60% subtler generally, 45% for Bible Prof Tower.
  // Walls retain the original full palette; RA Tower uses its full-theme
  // drawing path above. Even the black tier retains native material detail.
  const target=buildingRgb(result)!;
  const strength=type==='wall'?1:type==='bibleprof'?.55:.40;
  result=buildingColorOutput(target.map((n,i)=>n*strength+v[i]*(1-strength)) as BuildingRGB);
  cache.set(s,result);return result;
 };
 return new Proxy(ctx,{
  set(obj,key,val){(obj as any)[key]=(key==='fillStyle'||key==='strokeStyle')?recolor(val):val;return true;},
  get(obj,key){if(key==='createLinearGradient'||key==='createRadialGradient')return (...args:any[])=>{const gradient=(obj as any)[key](...args);const add=gradient.addColorStop.bind(gradient);gradient.addColorStop=(p:number,c:string)=>add(p,recolor(c));return gradient;};if(key==='fillText')return (...args:any[])=>{const c=obj.fillStyle; obj.fillStyle=type==='stinger'?'#ffffff':tier===8?'#bcc5d1':(tier===1||tier===4||tier===5)?'#1e1b2b':'#f4efe4';(obj.fillText as any)(...args);obj.fillStyle=c;};const v=(obj as any)[key];return typeof v==='function'?v.bind(obj):v;}
 });
}
