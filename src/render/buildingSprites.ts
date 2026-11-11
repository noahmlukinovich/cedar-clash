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
  const w = size * 64 + 80;
  const top = 200;
  const h = size * 32 + top + 30;
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

function trim(ctx: Ctx, level: number, u0: number, v0: number, u1: number, v1: number, z: number): void {
  if (level >= 3) {
    poly(ctx, [P(u0, v1, z - 4), P(u1, v1, z - 4), P(u1, v1, z), P(u0, v1, z)], C.gold, true, 1.4);
    poly(ctx, [P(u1, v1, z - 4), P(u1, v0, z - 4), P(u1, v0, z), P(u1, v1, z)], C.goldDark, true, 1.4);
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

function dmc(ctx: Ctx, L: number): void {
  pad(ctx, 4, C.concrete);
  const h = 40 + L * 6;
  // back wing (level 3+)
  if (L >= 3) {
    box(ctx, -1.7, -1.75, -0.2, -0.3, 4, h - 10, C.brick);
    windowsL(ctx, -1.6, -0.3, -0.3, 10, h - 14, 3, 1);
  }
  // steeple tower
  const th = h + 40 + L * 8;
  box(ctx, 0.35, -1.75, 1.35, -0.75, 4, th, C.white);
  windowsL(ctx, 0.45, 1.25, -0.75, th - 26, th - 6, 1, 1, '#ffe9a8');
  windowsR(ctx, -1.65, -0.85, 1.35, th - 26, th - 6, 1, 1, '#ffe9a8');
  if (L >= 5) {
    dome(ctx, 0.85, -1.25, 0.55, th, C.gold);
    const [x, y] = P(0.85, -1.25, th + 26);
    cross(ctx, x, y, 22);
  } else {
    pyramid(ctx, 0.35, -1.75, 1.35, -0.75, th, 26, C.roofBlue);
    const [x, y] = P(0.85, -1.25, th + 26);
    cross(ctx, x, y, 18);
  }
  // main hall
  box(ctx, -1.5, -0.9, 1.4, 1.5, 4, h, C.brick);
  // glass atrium on the front (left face)
  windowsL(ctx, -1.35, 1.25, 1.5, 8, h - 6, 5, 2, '#8fd8f5');
  windowsR(ctx, -0.8, 1.4, 1.4, 10, h - 8, 3, 2);
  trim(ctx, L, -1.5, -0.9, 1.4, 1.5, h);
  // flat roof with blue band
  box(ctx, -1.35, -0.75, 1.25, 1.35, h, h + 6, C.roofBlue);
  // entrance
  door(ctx, -0.1, 1.5, 0.6, 22, '#3a3346');
  const [sx, sy] = P(-0.1, 1.5, 34);
  sign(ctx, sx, sy, 'DMC', C.navy, C.gold, 12);
  levelFlags(ctx, L, -1.4, 1.4, h + 6);
  if (L >= 2) {
    const [x, y] = P(1.3, 1.4, h + 6);
    flag(ctx, x, y, 18, C.gold);
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
  pad(ctx, 3);
  const h = 34 + L * 5;
  box(ctx, -1.2, -1.2, 1.2, 1.1, 4, h, C.brick);
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
  levelFlags(ctx, L, 1.1, 1.0, h);
}

function hive(ctx: Ctx, L: number): void {
  pad(ctx, 3, '#3b3b4a');
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
}

function admissions(ctx: Ctx, L: number): void {
  pad(ctx, 3);
  const h = 30 + L * 4;
  box(ctx, -1.1, -1.1, 0.9, 0.9, 4, h, C.brick);
  windowsL(ctx, -1.0, 0.8, 0.9, 8, h - 6, 3, 1);
  windowsR(ctx, -1.0, 0.8, 0.9, 8, h - 6, 2, 1);
  trim(ctx, L, -1.1, -1.1, 0.9, 0.9, h);
  gable(ctx, -1.2, -1.2, 1.0, 1.0, h, 18, C.white, 'v');
  const [x, y] = P(-0.1, 0.9, h + 12);
  sign(ctx, x - 8, y + 4, 'ADMISSIONS', C.navy, C.gold, 8);
  door(ctx, -0.1, 0.9, 0.4, 16, C.navy);
  levelFlags(ctx, L, 0.9, 0.9, h);
}

function coffeeCart(ctx: Ctx, L: number): void {
  pad(ctx, 3, '#c8a77e');
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
}

function registrar(ctx: Ctx, L: number): void {
  pad(ctx, 3);
  const h = 30 + L * 5;
  box(ctx, -1.15, -1.15, 1.1, 1.0, 4, h, C.brick);
  windowsR(ctx, -1.0, 0.9, 1.1, 10, h - 6, 3, 1);
  // vault door on left face
  const [vx, vy] = P(0, 1.0, h * 0.45);
  ctx.beginPath();
  ctx.ellipse(vx, vy, 16, 15, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#c9cdd3';
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
  // open-top bin for coins (filled dynamically)
  box(ctx, -1.0, -1.0, 0.95, 0.85, h, h + 6, C.stoneDark);
  const [sx, sy] = P(-0.6, 1.0, h - 4);
  sign(ctx, sx, sy, 'REGISTRAR', C.navy, C.gold, 7);
}

function rinnova(ctx: Ctx, L: number): void {
  pad(ctx, 3);
  const h = 30 + L * 4;
  // coffee tank in back (fill drawn dynamically)
  cylinder(ctx, 0.1, -0.9, 0.62, 4, h + 22 + L * 3, '#c8ccd2', '#9aa0a8');
  box(ctx, -1.15, -0.4, 1.1, 1.05, 4, h, '#3d3a44');
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
}

function reshall(ctx: Ctx, L: number): void {
  pad(ctx, 4);
  const floors = 2 + Math.min(3, Math.floor((L + 1) / 2));
  const h = 14 + floors * 15;
  box(ctx, -1.7, -1.4, 1.6, 1.3, 4, h, C.brick);
  windowsL(ctx, -1.6, 1.5, 1.3, 8, h - 4, 6, floors);
  windowsR(ctx, -1.3, 1.2, 1.6, 8, h - 4, 4, floors);
  trim(ctx, L, -1.7, -1.4, 1.6, 1.3, h);
  gable(ctx, -1.8, -1.5, 1.7, 1.4, h, 20, '#5d6170');
  door(ctx, 0, 1.3, 0.5, 16, C.navy);
  levelFlags(ctx, L, 1.55, 1.25, h);
}

function academic(ctx: Ctx, L: number, wallColor: string, accent: string, label: string, icon: 'book' | 'plus'): void {
  pad(ctx, 3);
  const h = 32 + L * 6;
  box(ctx, -1.15, -1.15, 1.1, 1.05, 4, h, wallColor);
  windowsL(ctx, -1.05, 1.0, 1.05, 8, h - 6, 4, 2);
  windowsR(ctx, -1.05, 0.95, 1.1, 8, h - 6, 3, 2);
  trim(ctx, L, -1.15, -1.15, 1.1, 1.05, h);
  gable(ctx, -1.25, -1.25, 1.2, 1.15, h, 20, accent);
  door(ctx, 0, 1.05, 0.45, 16, shade(accent, -0.2));
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
}

function callan(ctx: Ctx, L: number): void {
  pad(ctx, 3);
  const h = 30 + L * 5;
  box(ctx, -1.2, -1.2, 1.15, 1.1, 4, h, C.brick);
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
  levelFlags(ctx, L, 1.1, 1.0, h);
}

function ens(ctx: Ctx, L: number): void {
  pad(ctx, 3);
  const h = 38 + L * 6;
  box(ctx, -1.15, -1.15, 1.1, 1.05, 4, h, '#7d8a99');
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
  levelFlags(ctx, L, 1.05, 1.0, h + 5);
}

function ssc(ctx: Ctx, L: number): void {
  pad(ctx, 3);
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
  pad(ctx, 3, C.stone);
  const h = 42 + L * 5;
  const s = 0.55;
  box(ctx, -s, -s, s, s, 4, h, L >= 4 ? C.stone : C.brick);
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
}

function safetyCart(ctx: Ctx, L: number): void {
  pad(ctx, 3, '#8f939a');
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
  pad(ctx, 3, C.stone);
  cylinder(ctx, 0, 0, 1.05, 4, 14, C.stoneDark, '#3fa8e0');
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
}

function bibleProf(ctx: Ctx, L: number): void {
  pad(ctx, 3, C.stone);
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

function wall(ctx: Ctx, L: number, mask: number): void {
  const col = WALL_COLORS[Math.min(L - 1, 5)];
  const top = WALL_TOPS[Math.min(L - 1, 5)];
  const h = 16 + L * 2;
  const s = 0.28;
  // connectors toward +u (mask&1) and +v (mask&2)
  if (mask & 2) box(ctx, -s * 0.8, s, s * 0.8, 1 - s, 0, h - 3, col, { top });
  if (mask & 1) box(ctx, s, -s * 0.8, 1 - s, s * 0.8, 0, h - 3, col, { top });
  box(ctx, -s, -s, s, s, 0, h, col, { top });
  if (L >= 2 && L <= 3) {
    // brick lines
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    const a = P(-s, s, h * 0.5);
    const b = P(s, s, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }
  if (L >= 5) {
    const [x, y] = P(0, 0, h + 2);
    ctx.fillStyle = C.gold;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 1;
    ctx.stroke();
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
