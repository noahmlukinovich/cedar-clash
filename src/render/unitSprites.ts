// Chunky procedural characters for troops, heroes, fans, builders.
import type { UnitType } from '../config/types';
import { C, OUT } from './draw';

export interface UnitDrawOpts {
  t: number; // time for animation
  facing: number; // -1 left, 1 right
  moving: boolean;
  attacking: number; // 0..1 attack swing phase
  scale: number;
  frozen?: boolean;
  flash?: number; // hit flash 0..1
  stunned?: boolean;
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, lw = 2): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = OUT;
  ctx.stroke();
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = OUT;
  ctx.stroke();
}

const OUTFIT: Record<UnitType, { body: string; legs: string; hair: string }> = {
  freshman: { body: '#3a7bd5', legs: '#2d3a55', hair: '#5a3a1e' },
  engineer: { body: '#f2a20c', legs: '#3d4e66', hair: '#2a1d14' },
  nurse: { body: '#2bb3a3', legs: '#2bb3a3', hair: '#8a5a2b' },
  theology: { body: '#7b3fa0', legs: '#3a2a4a', hair: '#c9a14a' },
  athlete: { body: '#f5c32c', legs: '#1c3d7a', hair: '#1a1410' },
  prof: { body: '#8a6a4a', legs: '#4a3a30', hair: '#d8d8d8' },
  president: { body: '#1c3d7a', legs: '#1c2440', hair: '#bcbcbc' },
  fan: { body: '#ffd23f', legs: '#1c3d7a', hair: '#1a1410' },
  business: { body: '#33415a', legs: '#262f42', hair: '#3a2a1a' },
  music: { body: '#b23a6f', legs: '#2a2a33', hair: '#1a1410' },
  runner: { body: '#e86a17', legs: '#e8b890', hair: '#7a4a22' },
  ra: { body: '#1c3d7a', legs: '#b9a37a', hair: '#4a3020' },
  goteam: { body: '#f4efe4', legs: '#333', hair: '#333' },
  gomember: { body: '#e4572e', legs: '#4a6a8a', hair: '#5a3a1e' },
};

/** The GO Team's van: a white fifteen-passenger with a blue stripe and a globe on the side. */
function drawVan(ctx: CanvasRenderingContext2D, x: number, y: number, o: UnitDrawOpts): void {
  const s = o.scale;
  const bob = o.moving ? Math.abs(Math.sin(o.t * 14)) * 1.2 : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(x, y, 19 * s, 6 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(x, y - bob);
  ctx.scale(s * o.facing, s);
  // body
  ctx.beginPath();
  ctx.moveTo(-17, -4);
  ctx.lineTo(-17, -20);
  ctx.quadraticCurveTo(-17, -24, -13, -24);
  ctx.lineTo(8, -24);
  ctx.lineTo(15, -15);
  ctx.lineTo(18, -13);
  ctx.lineTo(18, -4);
  ctx.closePath();
  ctx.fillStyle = '#f4efe4';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  // stripe
  ctx.fillStyle = C.navy;
  ctx.fillRect(-16, -12, 33, 3);
  // windows
  ctx.fillStyle = '#9fd3f0';
  ctx.lineWidth = 1.4;
  for (const wx of [-14, -7, 0]) {
    ctx.fillRect(wx, -21, 5.5, 6);
    ctx.strokeRect(wx, -21, 5.5, 6);
  }
  ctx.beginPath();
  ctx.moveTo(7.5, -21);
  ctx.lineTo(8, -21);
  ctx.lineTo(13, -15);
  ctx.lineTo(7.5, -15);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // globe
  ctx.beginPath();
  ctx.arc(-9, -8, 3.2, 0, Math.PI * 2);
  ctx.fillStyle = '#4aa3df';
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C.green;
  ctx.fillRect(-10.5, -9.5, 2.2, 2);
  ctx.fillRect(-8.2, -7.5, 1.8, 1.6);
  // headlight
  ctx.fillStyle = C.gold;
  ctx.fillRect(16, -10, 2, 3);
  // wheels
  for (const wx of [-10, 10]) {
    ctx.beginPath();
    ctx.arc(wx, -3, 4.2, 0, Math.PI * 2);
    ctx.fillStyle = '#2a2a33';
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(wx, -3, 1.6, 0, Math.PI * 2);
    ctx.fillStyle = '#c8ccd2';
    ctx.fill();
  }
  ctx.restore();
  if (o.flash && o.flash > 0) {
    ctx.globalAlpha = o.flash * 0.6;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(x, y - 13 * s, 18 * s, 12 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (o.frozen) {
    ctx.fillStyle = 'rgba(170,225,255,0.55)';
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(x - 20 * s, y - 28 * s, 40 * s, 28 * s);
    ctx.fill();
    ctx.stroke();
  }
}

export function drawUnit(ctx: CanvasRenderingContext2D, x: number, y: number, type: UnitType, o: UnitDrawOpts, enemy = false): void {
  if (type === 'goteam') return drawVan(ctx, x, y, o);
  const s = o.scale;
  const of = OUTFIT[type];
  const bob = o.moving ? Math.abs(Math.sin(o.t * 12)) * 2.5 : Math.sin(o.t * 3) * 0.6;
  const squash = o.moving ? 1 + Math.sin(o.t * 24) * 0.05 : 1 + Math.sin(o.t * 3) * 0.02;
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(x, y, 9 * s, 4.5 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(x, y - bob);
  ctx.scale(s * o.facing / squash, s * squash);

  // legs
  const step = o.moving ? Math.sin(o.t * 12) * 3 : 0;
  ctx.fillStyle = of.legs;
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.rect(-5, -8 + step * 0.3, 4, 8 - step * 0.3);
  ctx.rect(1, -8 - step * 0.3, 4, 8 + step * 0.3);
  ctx.fill();
  ctx.stroke();

  // back accessories
  if (type === 'freshman') rr(ctx, -9, -20, 6, 10, 2, '#e4572e'); // backpack
  if (type === 'gomember') rr(ctx, -9.5, -21, 6.5, 12, 2, '#2f6f4f'); // trip backpack
  if (type === 'president') {
    // cape-ish sash behind
    ctx.fillStyle = C.gold;
    ctx.fillRect(-8, -20, 3, 12);
  }

  // body
  const bodyW = type === 'athlete' || type === 'ra' ? 16 : type === 'runner' ? 11 : 13;
  const bodyH = type === 'theology' || type === 'prof' ? 15 : 12;
  rr(ctx, -bodyW / 2, -8 - bodyH, bodyW, bodyH + 2, 4, of.body);
  if (type === 'theology') {
    // robe extends down
    ctx.fillStyle = of.body;
    ctx.beginPath();
    ctx.moveTo(-7, -10);
    ctx.lineTo(7, -10);
    ctx.lineTo(8, -2);
    ctx.lineTo(-8, -2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  if (type === 'athlete') {
    ctx.fillStyle = C.navy;
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('1', 0, -12);
  }
  if (type === 'nurse') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(-1.5, -17, 3, 7);
    ctx.fillRect(-3.5, -15, 7, 3);
  }
  if (type === 'freshman') {
    // lanyard
    ctx.strokeStyle = C.gold;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-3, -19);
    ctx.lineTo(0, -12);
    ctx.lineTo(3, -19);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillRect(-2, -12, 4, 3);
  }
  if (type === 'president') {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(-2, -19);
    ctx.lineTo(0, -14);
    ctx.lineTo(2, -19);
    ctx.fill();
    ctx.fillStyle = C.red;
    ctx.fillRect(-1, -17, 2, 6);
  }
  if (type === 'fan') {
    ctx.fillStyle = C.black;
    ctx.fillRect(-6, -16, 12, 2.5);
  }
  if (type === 'business') {
    // shirt front + tie
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(-2.5, -19);
    ctx.lineTo(0, -12);
    ctx.lineTo(2.5, -19);
    ctx.fill();
    ctx.fillStyle = '#2f9a5f';
    ctx.fillRect(-1, -18, 2, 8);
  }
  if (type === 'music') {
    // bow tie
    ctx.fillStyle = C.black;
    ctx.beginPath();
    ctx.moveTo(-3, -19.5);
    ctx.lineTo(0, -17.5);
    ctx.lineTo(-3, -15.5);
    ctx.moveTo(3, -19.5);
    ctx.lineTo(0, -17.5);
    ctx.lineTo(3, -15.5);
    ctx.fill();
  }
  if (type === 'runner') {
    // shorts + race bib
    ctx.fillStyle = C.navy;
    ctx.fillRect(-5.5, -9, 11, 4);
    ctx.fillStyle = '#fff';
    ctx.fillRect(-3.5, -17, 7, 5);
    ctx.fillStyle = C.navy;
    ctx.font = 'bold 5px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('26', 0, -12.8);
  }
  if (type === 'ra') {
    ctx.fillStyle = C.gold;
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('RA', 0, -12);
  }
  if (type === 'gomember') {
    // globe on the team t-shirt
    ctx.beginPath();
    ctx.arc(0, -14, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#4aa3df';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = OUT;
    ctx.stroke();
  }

  // arm + held item (swing when attacking)
  const swing = o.attacking > 0 ? Math.sin(o.attacking * Math.PI) * 1.4 : 0;
  ctx.save();
  ctx.translate(5, -16);
  ctx.rotate(-0.4 + swing);
  ctx.fillStyle = of.body;
  ctx.fillRect(-1.5, 0, 3.5, 8);
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 1.4;
  ctx.strokeRect(-1.5, 0, 3.5, 8);
  drawHeld(ctx, type);
  ctx.restore();

  // head
  const hy = -8 - bodyH - 6;
  circle(ctx, 0, hy, 7, C.skin);
  // hair / hats
  drawHead(ctx, type, hy, of.hair);
  // eyes
  ctx.fillStyle = OUT;
  if (o.stunned) {
    ctx.font = 'bold 6px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('x  x', 2, hy + 2);
  } else {
    ctx.fillRect(1, hy - 1, 1.8, 2.6);
    ctx.fillRect(4.5, hy - 1, 1.8, 2.6);
  }
  if (type === 'prof') {
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(0, hy - 2, 3, 3);
    ctx.strokeRect(4, hy - 2, 3, 3);
    // beard
    ctx.fillStyle = of.hair;
    ctx.beginPath();
    ctx.arc(2, hy + 4, 4.5, 0, Math.PI);
    ctx.fill();
  }
  if (enemy) {
    // face paint stripe for defenders
    ctx.fillStyle = C.navy;
    ctx.fillRect(-1, hy + 1, 7, 1.8);
  }
  ctx.restore();

  if (o.flash && o.flash > 0) {
    ctx.globalAlpha = o.flash * 0.6;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(x, y - 16 * s, 9 * s, 14 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (o.frozen) {
    ctx.fillStyle = 'rgba(170,225,255,0.55)';
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    const w = 13 * s;
    ctx.beginPath();
    ctx.moveTo(x - w, y - 2);
    ctx.lineTo(x - w * 0.9, y - 34 * s);
    ctx.lineTo(x - w * 0.2, y - 40 * s);
    ctx.lineTo(x + w * 0.9, y - 33 * s);
    ctx.lineTo(x + w, y - 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - w * 0.5, y - 30 * s);
    ctx.lineTo(x - w * 0.2, y - 12 * s);
    ctx.stroke();
  }
  if (o.stunned) {
    for (let i = 0; i < 3; i++) {
      const a = o.t * 5 + (i * Math.PI * 2) / 3;
      ctx.fillStyle = C.gold;
      ctx.font = '8px sans-serif';
      ctx.fillText('★', x + Math.cos(a) * 9 * s, y - 40 * s + Math.sin(a) * 3);
    }
  }
}

function drawHeld(ctx: CanvasRenderingContext2D, type: UnitType): void {
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = OUT;
  switch (type) {
    case 'freshman':
      // campus map
      ctx.fillStyle = '#fff6d6';
      ctx.fillRect(-2, 6, 8, 6);
      ctx.strokeRect(-2, 6, 8, 6);
      break;
    case 'engineer':
      // wrench
      ctx.fillStyle = '#9aa3ad';
      ctx.fillRect(0, 6, 2.5, 10);
      ctx.strokeRect(0, 6, 2.5, 10);
      ctx.beginPath();
      ctx.arc(1.2, 17, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    case 'nurse':
      ctx.fillStyle = '#fff';
      ctx.fillRect(-1, 7, 7, 5);
      ctx.strokeRect(-1, 7, 7, 5);
      ctx.fillStyle = C.green;
      ctx.fillRect(1.5, 8, 2, 3);
      break;
    case 'theology':
      ctx.fillStyle = '#3a1a1a';
      ctx.fillRect(-2, 6, 7, 8);
      ctx.strokeRect(-2, 6, 7, 8);
      ctx.fillStyle = C.gold;
      ctx.fillRect(1, 8, 1.2, 4);
      break;
    case 'athlete':
      // football
      ctx.fillStyle = '#8b4a1e';
      ctx.beginPath();
      ctx.ellipse(1, 10, 5, 3.2, 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    case 'prof':
      // red pen
      ctx.fillStyle = C.red;
      ctx.fillRect(0, 6, 2, 9);
      ctx.strokeRect(0, 6, 2, 9);
      break;
    case 'president':
      // gavel/scepter
      ctx.fillStyle = C.gold;
      ctx.fillRect(0, 4, 2, 12);
      ctx.strokeRect(0, 4, 2, 12);
      ctx.beginPath();
      ctx.arc(1, 17, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    case 'business':
      // briefcase
      ctx.fillStyle = '#6b4526';
      ctx.fillRect(-3, 8, 9, 7);
      ctx.strokeRect(-3, 8, 9, 7);
      ctx.strokeRect(0, 6, 3, 2);
      break;
    case 'music':
      // trumpet
      ctx.fillStyle = C.gold;
      ctx.fillRect(0, 6, 2.5, 9);
      ctx.strokeRect(0, 6, 2.5, 9);
      ctx.beginPath();
      ctx.moveTo(-2, 19);
      ctx.lineTo(1.2, 14);
      ctx.lineTo(4.5, 19);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    case 'runner':
      // water bottle
      ctx.fillStyle = '#7fd0f5';
      ctx.fillRect(0, 7, 3, 6);
      ctx.strokeRect(0, 7, 3, 6);
      break;
    case 'ra':
      // clipboard
      ctx.fillStyle = '#b98a4a';
      ctx.fillRect(-3, 6, 8, 10);
      ctx.strokeRect(-3, 6, 8, 10);
      ctx.fillStyle = '#fff';
      ctx.fillRect(-2, 8, 6, 7);
      break;
    case 'gomember':
      // work glove + trowel
      ctx.fillStyle = '#9aa3ad';
      ctx.fillRect(0, 7, 2, 7);
      ctx.strokeRect(0, 7, 2, 7);
      ctx.beginPath();
      ctx.moveTo(-1.5, 14);
      ctx.lineTo(1, 19);
      ctx.lineTo(3.5, 14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    case 'fan':
      // foam finger
      ctx.fillStyle = C.gold;
      ctx.fillRect(-2, 6, 6, 7);
      ctx.strokeRect(-2, 6, 6, 7);
      ctx.fillRect(0, 12, 2.5, 6);
      ctx.strokeRect(0, 12, 2.5, 6);
      break;
  }
}

function drawHead(ctx: CanvasRenderingContext2D, type: UnitType, hy: number, hair: string): void {
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = OUT;
  switch (type) {
    case 'engineer':
      // hard hat
      ctx.fillStyle = C.gold;
      ctx.beginPath();
      ctx.arc(0, hy - 2, 7.5, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillRect(-9, hy - 2.5, 18, 2.5);
      ctx.strokeRect(-9, hy - 2.5, 18, 2.5);
      break;
    case 'nurse':
      ctx.fillStyle = hair;
      ctx.beginPath();
      ctx.arc(0, hy - 2, 7.2, Math.PI * 0.95, Math.PI * 2.05);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-4, hy - 10, 8, 3.5);
      ctx.strokeRect(-4, hy - 10, 8, 3.5);
      break;
    case 'prof':
    case 'president': {
      ctx.fillStyle = hair;
      ctx.beginPath();
      ctx.arc(-1, hy - 2, 7, Math.PI * 0.9, Math.PI * 1.6);
      ctx.fill();
      if (type === 'prof') {
        // mortarboard
        ctx.fillStyle = C.black;
        ctx.beginPath();
        ctx.moveTo(-10, hy - 8);
        ctx.lineTo(0, hy - 12);
        ctx.lineTo(10, hy - 8);
        ctx.lineTo(0, hy - 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = C.gold;
        ctx.beginPath();
        ctx.moveTo(0, hy - 8);
        ctx.lineTo(8, hy - 4);
        ctx.lineTo(8, hy + 1);
        ctx.stroke();
      }
      break;
    }
    case 'athlete':
      // headband
      ctx.fillStyle = hair;
      ctx.beginPath();
      ctx.arc(0, hy - 2, 7.2, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.navy;
      ctx.fillRect(-7, hy - 4, 14, 2.5);
      break;
    case 'theology':
      ctx.fillStyle = hair;
      ctx.beginPath();
      ctx.arc(0, hy - 3, 7, Math.PI, Math.PI * 2);
      ctx.fill();
      break;
    case 'business':
      // slick side part
      ctx.fillStyle = hair;
      ctx.beginPath();
      ctx.arc(0, hy - 2, 7.3, Math.PI * 0.95, Math.PI * 2.05);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-3, hy - 6, 4.5, Math.PI * 1.1, Math.PI * 2);
      ctx.fill();
      break;
    case 'music':
      // beret
      ctx.fillStyle = hair;
      ctx.beginPath();
      ctx.arc(0, hy - 2, 7.2, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.black;
      ctx.beginPath();
      ctx.ellipse(-1.5, hy - 7, 8, 3.6, -0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    case 'runner':
      // sweatband
      ctx.fillStyle = hair;
      ctx.beginPath();
      ctx.arc(0, hy - 2, 7.2, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-7, hy - 4.5, 14, 2.5);
      break;
    case 'ra':
    case 'gomember':
      // ball cap
      ctx.fillStyle = type === 'ra' ? C.navy : '#e4572e';
      ctx.beginPath();
      ctx.arc(0, hy - 2, 7.4, Math.PI, Math.PI * 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillRect(2, hy - 3.5, 9, 2.2);
      ctx.strokeRect(2, hy - 3.5, 9, 2.2);
      break;
    case 'fan':
      // painted head
      ctx.fillStyle = C.gold;
      ctx.beginPath();
      ctx.arc(0, hy, 7, Math.PI, Math.PI * 2);
      ctx.fill();
      break;
    default:
      // freshman: messy hair + beanie sometimes
      ctx.fillStyle = hair;
      ctx.beginPath();
      ctx.arc(0, hy - 2, 7.3, Math.PI * 1.0, Math.PI * 2.0);
      ctx.fill();
      ctx.fillStyle = C.navy;
      ctx.beginPath();
      ctx.arc(0, hy - 4, 6.6, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = C.gold;
      ctx.beginPath();
      ctx.arc(0, hy - 11, 2, 0, Math.PI * 2);
      ctx.fill();
  }
}

/** Little Facilities Crew worker hammering on construction sites. */
export function drawBuilder(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(x, y, 7, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#3d4e66';
  ctx.fillRect(-4, -7, 3, 7);
  ctx.fillRect(1, -7, 3, 7);
  rr(ctx, -5.5, -17, 11, 11, 3, C.orange);
  circle(ctx, 0, -22, 5.5, C.skin, 1.6);
  ctx.fillStyle = C.gold;
  ctx.beginPath();
  ctx.arc(0, -24, 6, Math.PI, 0);
  ctx.fill();
  ctx.stroke();
  const sw = Math.sin(t * 10);
  ctx.save();
  ctx.translate(4, -14);
  ctx.rotate(-1 + sw * 0.9);
  ctx.fillStyle = C.wood;
  ctx.fillRect(0, -1, 10, 2);
  ctx.fillStyle = '#777';
  ctx.fillRect(8, -3, 4, 6);
  ctx.restore();
  ctx.restore();
}
