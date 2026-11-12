import { BUILDINGS } from '../config/buildings';
import type { BuildingType, SpellType, UnitType } from '../config/types';
import { getBuildingSprite } from '../render/buildingSprites';
import { drawUnit } from '../render/unitSprites';
import { SPELLS } from '../config/spells';
import { OUT } from '../render/draw';

export function buildingThumb(type: BuildingType, level: number, w = 120, h = 100): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w * 2;
  c.height = h * 2;
  const ctx = c.getContext('2d')!;
  const sp = getBuildingSprite(type, Math.max(1, level), type === 'wall' ? 1 : 0);
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

export function unitThumb(type: UnitType, w = 70, h = 70): HTMLCanvasElement {
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
  const sc = (Math.min(w, h) / 70) * (type === 'goteam' ? 1.25 : type === 'athlete' || type === 'president' || type === 'ra' ? 1.5 : 1.7);
  drawUnit(ctx, w / 2, h * 0.88, type, { t: 0.4, facing: 1, moving: false, attacking: 0, scale: sc });
  return c;
}

export function spellThumb(type: SpellType, w = 70, h = 70): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w * 2;
  c.height = h * 2;
  const ctx = c.getContext('2d')!;
  ctx.scale(2, 2);
  const d = SPELLS[type];
  const cx = w / 2;
  const cy = h / 2 + 4;
  // potion-ish cup
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = OUT;
  if (type === 'allnighter') {
    // energy can
    ctx.fillStyle = d.color;
    ctx.fillRect(cx - 12, cy - 22, 24, 40);
    ctx.strokeRect(cx - 12, cy - 22, 24, 40);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚡', cx, cy + 4);
    ctx.fillStyle = '#ccc';
    ctx.fillRect(cx - 12, cy - 26, 24, 5);
    ctx.strokeRect(cx - 12, cy - 26, 24, 5);
  } else if (type === 'snowday') {
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.arc(cx, cy, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(a) * 13, cy - Math.sin(a) * 13);
      ctx.lineTo(cx + Math.cos(a) * 13, cy + Math.sin(a) * 13);
      ctx.stroke();
    }
  } else {
    // megaphone
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.moveTo(cx - 18, cy - 5);
    ctx.lineTo(cx + 12, cy - 18);
    ctx.lineTo(cx + 12, cy + 18);
    ctx.lineTo(cx - 18, cy + 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = OUT;
    ctx.beginPath();
    ctx.arc(cx + 18, cy, 6, -1, 1);
    ctx.stroke();
  }
  return c;
}
