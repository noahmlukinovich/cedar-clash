import { BUILDINGS } from '../config/buildings';
import type { BuildingType, SpellType, UnitType } from '../config/types';
import { getBuildingSprite } from '../render/buildingSprites';
import { drawUnit } from '../render/unitSprites';

export function buildingThumb(type: BuildingType, level: number, w = 120, h = 100): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w * 2;
  c.height = h * 2;
  const ctx = c.getContext('2d')!;
  const sp = getBuildingSprite(type, Math.max(1, level), type === 'wall' || type === 'gate' ? 1 : 0);
  const size = BUILDINGS[type].size;
  // fit sprite: visible area approx width size*64+40, height size*32 + heightish
  const visW = size * 64 + 30;
  const visH = size * 32 + 30 + size * 26;
  const s = Math.min((w * 2) / visW, (h * 2) / visH) * 0.95;
  const ax = sp.ax / sp.scale;
  const ay = sp.ay / sp.scale;
  ctx.translate(w, h * 2 - (size * 16 + 8) * s);
  ctx.scale(s, s);
  ctx.drawImage(sp.canvas, -ax, -ay, sp.canvas.width / sp.scale, sp.canvas.height / sp.scale);
  return c;
}

// Cache measured sprite bounds, not canvases: menu portraits must fit hats and gear
// even when new artwork or research levels make the unit taller/wider.
const unitBounds = new Map<string, { left: number; top: number; right: number; bottom: number }>();
function portraitBounds(type: UnitType, level: number) {
  const key = `${type}:${level}`;
  let bounds = unitBounds.get(key);
  if (bounds) return bounds;
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d')!;
  drawUnit(ctx, 256, 384, type, { t: 0.4, facing: 1, moving: false, attacking: 0, scale: 4, level });
  const pixels = ctx.getImageData(0, 0, 512, 512).data;
  let left = 512, top = 512, right = 0, bottom = 0;
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    if (pixels[(y * 512 + x) * 4 + 3] === 0) continue;
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
  }
  bounds = { left: (left - 256) / 4, top: (top - 384) / 4, right: (right - 256) / 4, bottom: (bottom - 384) / 4 };
  unitBounds.set(key, bounds);
  return bounds;
}

export function unitThumb(type: UnitType, w = 70, h = 70, level = 1): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w * 2;
  c.height = h * 2;
  const ctx = c.getContext('2d')!;
  ctx.scale(2, 2);
  const g = ctx.createRadialGradient(w / 2, h * 0.55, 4, w / 2, h * 0.55, w * 0.6);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const preferredScale = (Math.min(w, h) / 70) * (type === 'goteam' ? 1.25 : type === 'rock' ? 1.1 : type === 'athlete' || type === 'president' || type === 'ra' || type === 'thesis' ? 1.5 : 1.7);
  const bounds = portraitBounds(type, level);
  const padding = Math.max(3, Math.min(w, h) * 0.05);
  const sc = Math.min(preferredScale,
    (w - padding * 2) / (bounds.right - bounds.left),
    (h - padding * 2) / (bounds.bottom - bounds.top));
  const baseline = h - padding - bounds.bottom * sc;
  const x = Math.max(padding - bounds.left * sc, Math.min(w / 2, w - padding - bounds.right * sc));
  drawUnit(ctx, x, baseline, type, { t: 0.4, facing: 1, moving: false, attacking: 0, scale: sc, level });
  return c;
}

/** Reference-matched procedural spell art shared by menus and raid selection. */
export function spellThumb(type: SpellType, w = 70, h = 70): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w * 2;
  c.height = h * 2;
  const ctx = c.getContext('2d')!;
  const ink = '#101523', gold = '#efb820';
  // The approved drawings fit within a 170-unit square, including their shadows.
  const scale = Math.min(w, h) * 2 / 170;
  ctx.translate(w, h - 5 * scale);
  ctx.scale(scale, scale);
  const kind = type === 'allnighter' ? 0 : type === 'snowday' ? 1 : type === 'announcement' ? 2 : 3;
  function p(d: string, fill: string, stroke = ink, width = 5) {
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const path = new Path2D(d);
    ctx.fill(path);
    if (width) ctx.stroke(path);
  }
  function line(d: string, color = ink, width = 5) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.stroke(new Path2D(d));
  }
  function ell(x: number, y: number, rx: number, ry: number, fill: string, stroke = ink, width = 4) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    if (width) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;
      ctx.stroke();
    }
  }
  ell(0, 75, 48, 7, '#b6b3b4', '', 0);
  if (kind === 0) {
    ctx.save();
    ctx.rotate(.22);
    p('M-26-62 L26-62 L26 61 Q22 74 0 74 Q-23 74-26 62Z', '#a1acc2');
    p('M-25-49 Q0-39 25-49 L25 57 Q0 69-25 57Z', '#7025a0');
    p('M-19-48 L-8-45 L-8 61 L-20 58Z', '#b641e0', '', 0);
    p('M15-46 L24-49 L24 57 L14 61Z', '#4c197c', '', 0);
    p('M-17-42 L-11-40 L-11 18 L-17 22Z', '#d168f0', '', 0);
    ell(0, -61, 26, 10, '#c8d4e2');
    ell(0, -62, 20, 6, '#283b5b', '#8090ab', 2);
    ell(0, -62, 7, 3, '#c9d5e5', '#101523', 1);
    ell(0, -62, 3, 1, '#53637f', '', 0);
    p('M3-29 L-13 2 L-2 6 L-7 35 L16-3 L5-7 L13-27Z', '#ffd329', '#f7a816', 2);
    line('M-20 64 Q0 73 20 65', '#edf1fa', 3);
    ctx.restore();
    line('M-46-42 L-52-50 M-49-24 L-61-27 M-47-7 L-56-2', '#ffc72a', 5);
  }
  else if (kind === 1) {
    ell(0, 70, 61, 7, '#aad5f6', '', 0);
    p('M-44 59 Q-53 50-57 56 Q-65 60-62 65 Q-73 72-64 74 L-36 73Z', '#d7eeff', '#153873', 3);
    p('M35 61 Q44 52 50 59 Q59 55 59 64 Q71 68 63 73 L34 73Z', '#e4f7ff', '#153873', 3);
    ell(0, 17, 46, 52, '#87c6f5', '#153873', 4);
    p('M-37 1 Q-40-25-17-31 Q12-43 30-21 Q23-14 26-4 Q18 4 19 14 Q8 17 4 23 Q-7 19-12 26 Q-19 19-26 20 Q-27 9-33 10Z', '#fcffff', '', 0);
    p('M-36 21 Q-25 44-13 40 Q0 52 18 40 Q38 34 41 13 Q45 48 21 62 Q-17 77-35 48Z', '#64ace7', '', 0);
    p('M-38 11 Q-35 34-25 36 L-32 47 Q-40 38-42 23Z', '#b8e4ff', '', 0);
    p('M-39 65 Q-43 56-49 62 Q-58 59-59 68 Q-69 74-56 77 L-32 75 Q-26 68-39 65Z', '#fff', '#2b5999', 2);
    p('M37 68 Q39 59 46 65 Q55 63 56 70 Q65 75 50 77 L33 75Z', '#fff', '#2b5999', 2);
    ell(-55, 28, 4, 6, '#d8f5ff', '#519ee3', 2);
    ell(51, 34, 5, 3, '#e4f8ff', '#519ee3', 2);
    ell(41, -38, 4, 6, '#e4f8ff', '#519ee3', 2);
    ell(-45, -24, 3, 5, '#fff', '', 0);
    ell(57, -13, 3, 4, '#fff', '', 0);
  }
  else if (kind === 2) {
    p('M-22 34 L-14 75 Q-7 81 7 73 L-3 33Z', '#965a1d');
    p('M-15 40 L-8 70 L1 68 L-7 39Z', '#bc7929', '', 0);
    p('M-54 16 Q-62 23-57 38 Q-55 45-45 45 L-36 36 L-39 17Z', gold);
    p('M-44 12 Q-5 3 29-29 L42 45 Q-5 28-44 46Z', '#203d70');
    p('M-39 16 Q-6 12 27-20 L29-12 Q-2 18-39 22Z', '#5b80b8', '', 0);
    p('M-40 38 Q-7 25 37 37 L40 45 Q2 30-39 47Z', '#17294d', '', 0);
    ell(34, 7, 17, 43, gold);
    ell(37, 7, 12, 36, '#4b2b10', '#91601b', 3);
    p('M31-6 L45-5 Q53 6 46 17 L31 20Z', gold);
    line('M33-25 Q38-28 41-19', '#ffe36f', 3);
    line('M-50 20 L-48 39', '#ffe36f', 2);
    // yellowjacket emblem
    ell(-9, 24, 5, 11, gold, ink, 2);
    line('M-13 20 L-5 23 M-13 26 L-5 29', ink, 2);
    p('M-13 18 Q-30 7-28 17 Q-24 25-14 23Z', '#f2db84', '#f8f4dd', 1);
    p('M-6 17 Q7 4 8 16 Q5 24-5 23Z', '#d7e6f3', '#f8f4dd', 1);
    ell(-8, 12, 5, 4, gold, ink, 1);
    line('M-10 9 L-13 4 M-6 9 L-2 4', ink, 1.5);
    p('M-8 33 L-8 40 L-3 32Z', gold, ink, 1);
    line('M58-29 L66-40 M64-6 L79-10 M65 19 L78 26', '#ffca23', 6);
  }
  else {
    ctx.save();
    ctx.rotate(-.08);
    p('M-41-59 L39-59 L43 65 L-37 65Z', '#b8bec8');
    p('M-46-64 L35-64 L35 63 L-46 63Z', '#fffdf4');
    ctx.font = 'bold 10px sans-serif';
    ctx.fillStyle = ink;
    ctx.fillText('SYLLABUS', -38, -43);
    for (let j = 0; j < 3; j++) {
      let yy = -26 + j * 27;
      p(`M-34 ${yy} L-23 ${yy} L-23 ${yy + 12} L-34 ${yy + 12}Z`, '#e2e5de', '#929ca7', 1.5);
      line(`M-32 ${yy + 5} L-28 ${yy + 9} L-21 ${yy - 2}`, '#58a844', 2.5);
      line(`M-16 ${yy + 1} L22 ${yy + 1}`, '#929aa4', 2.5);
      line(`M-16 ${yy + 9} L5 ${yy + 9}`, '#b7bdc3', 2.5);
    }
    ctx.restore();
    ell(30, 49, 23, 25, '#58b822');
    ell(30, 49, 19, 21, '#72cc30', '#258819', 2);
    p('M25 34 L35 34 L35 44 L45 44 L45 54 L35 54 L35 64 L25 64 L25 54 L15 54 L15 44 L25 44Z', '#fff', '#e9f5dd', 1);
  }
  return c;
}
