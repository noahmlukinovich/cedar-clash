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
  /** Research / hero level: higher levels wear better gear. Defaults to 1. */
  level?: number;
  /** Picks a look that differs between units of the same type (The Rock's paint job). */
  variant?: number;
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
  freshman: { body: '#123e69', legs: '#163b60', hair: '#5a3a1e' },
  engineer: { body: '#173f63', legs: '#3d4e66', hair: '#2a1d14' },
  nurse: { body: '#174a70', legs: '#174a70', hair: '#8a5a2b' },
  theology: { body: '#33363b', legs: '#33363b', hair: '#654120' },
  athlete: { body: '#123e69', legs: '#f5c32c', hair: '#1a1410' },
  prof: { body: '#8a6a4a', legs: '#4a3a30', hair: '#d8d8d8' },
  president: { body: '#1c3d7a', legs: '#1c2440', hair: '#bcbcbc' },
  fan: { body: '#ffd23f', legs: '#1c3d7a', hair: '#1a1410' },
  business: { body: '#19191c', legs: '#19191c', hair: '#3a2a1a' },
  music: { body: '#123e69', legs: '#2a2a33', hair: '#1a1410' },
  runner: { body: '#ffd23f', legs: '#e8b890', hair: '#7a4a22' },
  ra: { body: '#123e69', legs: '#173f63', hair: '#4a3020' },
  goteam: { body: '#f4efe4', legs: '#333', hair: '#333' },
  gomember: { body: '#e4572e', legs: '#4a6a8a', hair: '#5a3a1e' },
  rock: { body: '#8a8478', legs: '#5a554c', hair: '#5a554c' },
  pebble: { body: '#8a8478', legs: '#5a554c', hair: '#5a554c' },
  senior: { body: '#23264a', legs: '#23264a', hair: '#4a3020' },
  thesis: { body: '#6b2f3a', legs: '#4a4e57', hair: '#3a2a1a' },
};

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = OUT;
  ctx.fill();
}

/** Paint jobs for The Rock: base coat, accent, and what's written on it. */
const ROCK_PAINT: { base: string; accent: string; text: string }[] = [
  { base: '#1c3d7a', accent: '#f5c32c', text: 'GO JACKETS' },
  { base: '#f4efe4', accent: '#c8323c', text: 'MARRY ME?' },
  { base: '#2f6f4f', accent: '#f4efe4', text: "CLASS OF '27" },
  { base: '#b23a6f', accent: '#ffd23f', text: 'HAPPY 21ST' },
  { base: '#f2a20c', accent: '#1c3d7a', text: 'JOHN 3:16' },
  { base: '#7b3fa0', accent: '#f4efe4', text: 'PRAY 4 FINALS' },
];

/**
 * The Rock: a lumpy painted boulder on stubby legs. Higher levels carry more coats of paint
 * (drips, then a second coat, then a gold rim). Pebbles are small chips of it with a fleck of paint.
 */
function drawRock(ctx: CanvasRenderingContext2D, x: number, y: number, o: UnitDrawOpts, pebble: boolean): void {
  const lv = Math.max(1, Math.min(5, Math.floor(o.level ?? 1)));
  const s = o.scale * (pebble ? 0.55 : 1);
  const paint = ROCK_PAINT[Math.abs(Math.floor(o.variant ?? 0)) % ROCK_PAINT.length];
  const step = o.moving ? Math.sin(o.t * 6) : 0;
  const lean = o.attacking > 0 ? o.attacking * 3 : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(x, y, 17 * s, 6 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s * o.facing, s);
  // stubby legs, stomping
  ctx.lineWidth = 2;
  ctx.strokeStyle = OUT;
  ctx.fillStyle = '#5a554c';
  for (const [lx, ph] of [[-7, 1], [5, -1]] as const) {
    const lift = Math.max(0, step * ph) * 3;
    ctx.fillRect(lx, -7 - lift, 5, 7);
    ctx.strokeRect(lx, -7 - lift, 5, 7);
  }
  ctx.translate(lean, -Math.abs(step) * 1.2);
  // the boulder
  const body = (): void => {
    ctx.beginPath();
    ctx.moveTo(-17, -8);
    ctx.quadraticCurveTo(-20, -22, -12, -30);
    ctx.quadraticCurveTo(-4, -37, 6, -34);
    ctx.quadraticCurveTo(17, -31, 18, -19);
    ctx.quadraticCurveTo(19, -8, 12, -5);
    ctx.quadraticCurveTo(0, -2, -10, -4);
    ctx.closePath();
  };
  body();
  ctx.fillStyle = pebble ? '#8a8478' : paint.base;
  ctx.fill();
  ctx.save();
  body();
  ctx.clip();
  if (pebble) {
    // a fleck of the old paint job
    ctx.fillStyle = paint.base;
    ctx.beginPath();
    ctx.ellipse(4, -24, 9, 6, 0.4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // older coats showing through where it's chipped
    ctx.fillStyle = paint.accent;
    ctx.beginPath();
    ctx.ellipse(-12, -11, 6, 4, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8a8478';
    ctx.beginPath();
    ctx.ellipse(13, -9, 4, 3, -0.4, 0, Math.PI * 2);
    ctx.fill();
    if (lv >= 3) {
      // second coat swooped over the top
      ctx.fillStyle = paint.accent;
      ctx.beginPath();
      ctx.moveTo(-20, -24);
      ctx.quadraticCurveTo(0, -34, 20, -26);
      ctx.lineTo(20, -36);
      ctx.lineTo(-20, -36);
      ctx.closePath();
      ctx.fill();
    }
    if (lv >= 2) {
      // drips
      // paint drips running down from the top, clear of the face
      ctx.fillStyle = paint.accent;
      for (const [dx, len] of [[-13, 10], [-7, 7], [14, 8]] as const) {
        ctx.beginPath();
        ctx.moveTo(dx - 1.3, -36);
        ctx.lineTo(dx - 1.3, -36 + len);
        ctx.arc(dx, -36 + len, 1.3, Math.PI, 0, true);
        ctx.lineTo(dx + 1.3, -36);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
  // shading on the underside
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(2, -2, 22, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  body();
  ctx.lineWidth = 2;
  ctx.strokeStyle = lv >= 5 && !pebble ? C.gold : OUT;
  ctx.stroke();
  if (!pebble) {
    // what this week's painters wrote (mirrored back when facing left, so it always reads)
    ctx.save();
    ctx.scale(o.facing, 1);
    ctx.fillStyle = paint.accent;
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 0.8;
    ctx.font = 'bold 6px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(paint.text, 0, -18, 30);
    ctx.restore();
    // eyes: two painted-on googly eyes
    for (const ex of [3, 10]) {
      circle(ctx, ex, -26, 2.6, '#fff', 1.2);
      dot(ctx, ex + 0.8, -25.6, 1.1);
    }
  } else {
    circle(ctx, 8, -24, 1.8, '#fff', 1);
    dot(ctx, 8.5, -23.8, 0.8);
  }
  ctx.restore();
  if (o.flash && o.flash > 0) {
    ctx.globalAlpha = o.flash * 0.6;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(x, y - 16 * s, 19 * s, 15 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (o.frozen) {
    ctx.fillStyle = 'rgba(170,225,255,0.55)';
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(x - 21 * s, y - 38 * s, 42 * s, 38 * s);
    ctx.fill();
    ctx.stroke();
  }
}

/** The GO Team's van: a white fifteen-passenger with a blue stripe and a globe on the side. */
function drawVan(ctx: CanvasRenderingContext2D, x: number, y: number, o: UnitDrawOpts): void {
  const lv = Math.max(1, Math.min(5, Math.floor(o.level ?? 1)));
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
  // stripe (a second, gold one once the trips are well funded)
  ctx.fillStyle = C.navy;
  ctx.fillRect(-16, -12, 33, 3);
  if (lv >= 4) {
    ctx.fillStyle = C.gold;
    ctx.fillRect(-16, -8.5, 33, 1.6);
  }
  if (lv >= 2) {
    // roof rack, then luggage on it
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-13, -24);
    ctx.lineTo(-13, -27);
    ctx.lineTo(6, -27);
    ctx.lineTo(6, -24);
    ctx.stroke();
    if (lv >= 3) {
      ctx.fillStyle = '#b98652';
      ctx.fillRect(-11, -31.5, 7, 4.5);
      ctx.strokeRect(-11, -31.5, 7, 4.5);
      ctx.fillStyle = C.red;
      ctx.fillRect(-3, -30.5, 6, 3.5);
      ctx.strokeRect(-3, -30.5, 6, 3.5);
    }
    if (lv >= 5) {
      // trip flag
      ctx.beginPath();
      ctx.moveTo(-15, -24);
      ctx.lineTo(-15, -37);
      ctx.stroke();
      ctx.fillStyle = C.gold;
      ctx.beginPath();
      ctx.moveTo(-15, -37);
      ctx.lineTo(-7, -34.5);
      ctx.lineTo(-15, -32);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.lineWidth = 2;
  }
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
  ctx.fillStyle = C.navy;
  ctx.fillRect(-16, -14, 32, 8);
  ctx.fillStyle = C.gold;
  ctx.beginPath(); ctx.moveTo(-16, -5); ctx.quadraticCurveTo(-3, -12, 15, -6); ctx.lineTo(15, -4); ctx.lineTo(-16, -4); ctx.fill();
  campusBadge(ctx, -11, -10, 0.8);
  ctx.save(); ctx.scale(o.facing, 1);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 3px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('CEDARVILLE', 2, -9.5, 20);
  ctx.fillStyle = C.gold; ctx.font = '2px sans-serif'; ctx.fillText('UNIVERSITY', 2, -7, 17);
  ctx.restore();
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
    ctx.fillStyle = lv >= 5 ? C.gold : '#c8ccd2';
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
  if (type === 'rock' || type === 'pebble') return drawRock(ctx, x, y, o, type === 'pebble');
  const lv = Math.max(1, Math.min(5, Math.floor(o.level ?? 1)));
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

  if (isCampusTroop(type)) {
    // Rounded shoes and white sole trim follow the existing animated feet.
    for (const [fx, sy] of [[-3, step * 0.3], [3, -step * 0.3]]) {
      rr(ctx, fx - 2.8, -1 + sy, 6.5, 3, 1.5, type === 'business' ? '#19191c' : C.navy);
      ctx.fillStyle = '#f7f3df'; ctx.fillRect(fx - 2, 0.7 + sy, 5, 0.8);
    }
  }

  // back accessories
  if (type === 'freshman') {
    rr(ctx, -11, -22, 8, 14, 3, C.gold);
    rr(ctx, -11, -15, 5, 6, 1.4, '#efb916');
    ctx.strokeStyle='#fff0a0';ctx.lineWidth=0.8;ctx.beginPath();ctx.moveTo(-9,-20);ctx.lineTo(-9,-17);ctx.stroke();
  }
  if (type === 'gomember') rr(ctx, -9.5, -21, 6.5, 12, 2, lv >= 4 ? C.navy : '#2f6f4f'); // trip backpack
  if ((type === 'prof' && lv >= 4) || (type === 'fan' && lv >= 4)) {
    // cape
    ctx.fillStyle = type === 'prof' ? C.red : C.navy;
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-6, -21);
    ctx.lineTo(-11, -4);
    ctx.lineTo(-4, -6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  if (type === 'freshman' && lv >= 2 && lv < 5) {
    // hoodie hood
    ctx.fillStyle = lv >= 3 ? C.navy : '#2f5fa8';
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(-3, -22, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  if (type === 'president') {
    // cape-ish sash behind
    ctx.fillStyle = C.gold;
    ctx.fillRect(-8, -20, 3, 12);
  }

  // body
  const bodyW = type === 'athlete' ? (lv >= 3 ? 19 : 16) : type === 'ra' || type === 'thesis' ? 16 : type === 'runner' ? 11 : 13;
  const bodyCol = type === 'gomember' && lv >= 5 ? C.gold : of.body;
  const bodyH = type === 'theology' || type === 'prof' ? 15 : 12;
  rr(ctx, -bodyW / 2, -8 - bodyH, bodyW, bodyH + 2, 4, bodyCol);
  if (isCampusTroop(type)) {
    // The reference silhouettes have a visible relaxed far arm and rounded hand.
    rr(ctx, -bodyW / 2 - 2.5, -19, 4, 10, 2, bodyCol);
    circle(ctx, -bodyW / 2 - 0.5, -9, 2, C.skin, 1);
  }
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
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.save(); ctx.scale(o.facing, 1); ctx.fillText('12', 0, -12); ctx.restore();
  }
  if (type === 'nurse') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(-1.5, -17, 3, 7);
    ctx.fillRect(-3.5, -15, 7, 3);
  }
  if (type === 'freshman') {
    ctx.strokeStyle='#e9e5d6';ctx.lineWidth=0.6;
    for (const dx of [-2,2]) {ctx.beginPath();ctx.moveTo(dx,-21);ctx.lineTo(dx,-18);ctx.stroke();}
    ctx.strokeStyle='#335777';ctx.beginPath();ctx.moveTo(-3,-11);ctx.lineTo(3,-11);ctx.stroke();
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
    ctx.fillStyle = '#29292d';
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
    // yellow running kit + race bib
    ctx.fillStyle = C.gold;
    ctx.fillRect(-5.5, -9, 11, 4);
    ctx.fillStyle = '#fff';
    ctx.fillRect(-3.5, -17, 7, 5);
    ctx.fillStyle = C.navy;
    ctx.font = 'bold 5px sans-serif';
    ctx.textAlign = 'center';
    ctx.save(); ctx.scale(o.facing, 1); ctx.fillText('275', 0, -12.8); ctx.restore();
  }
  if (type === 'ra') {
    ctx.fillStyle = C.gold;
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.save(); ctx.scale(o.facing, 1); ctx.fillText('RA', 0, -12); ctx.restore();
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

  if (!campusGear(ctx, type, lv, o.facing)) gear(ctx, type, lv);

  // arm + held item (swing when attacking)
  const swing = o.attacking > 0 ? Math.sin(o.attacking * Math.PI) * 1.4 : 0;
  ctx.save();
  ctx.translate(5, -16);
  ctx.rotate(-0.4 + swing);
  ctx.fillStyle = bodyCol;
  ctx.fillRect(-1.5, 0, 3.5, 8);
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 1.4;
  ctx.strokeRect(-1.5, 0, 3.5, 8);
  drawHeld(ctx, type, lv);
  ctx.restore();

  // head
  const hy = -8 - bodyH - 6;
  circle(ctx, 0, hy, 7, C.skin);
  if (isCampusTroop(type)) {
    const face = ctx.createLinearGradient(-5, hy - 5, 6, hy + 6);
    face.addColorStop(0, '#ffe7a2'); face.addColorStop(1, '#edb864');
    ctx.fillStyle = face; ctx.beginPath(); ctx.ellipse(0, hy, 7.2, 7.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    circle(ctx, -6, hy + 1, 1.6, '#f2c87f', 0.8);
  }
  // hair / hats
  drawHead(ctx, type, hy, of.hair, lv);
  // eyes
  ctx.fillStyle = OUT;
  if (o.stunned) {
    ctx.font = 'bold 6px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('x  x', 2, hy + 2);
  } else {
    if (isCampusTroop(type)) {
      for (const ex of [-1.5, 3.5]) { ctx.beginPath(); ctx.ellipse(ex, hy + 0.4, 1.1, 2.2, 0, 0, Math.PI * 2); ctx.fill(); }
    } else {
      ctx.fillRect(1, hy - 1, 1.8, 2.6);
      ctx.fillRect(4.5, hy - 1, 1.8, 2.6);
    }
  }
  if ((type === 'athlete' && lv >= 4) || (type === 'fan' && lv >= 2)) {
    // eye black / face paint
    ctx.fillStyle = type === 'fan' ? C.navy : OUT;
    ctx.fillRect(0.5, hy + 2.2, 2.6, 1.2);
    ctx.fillRect(4.2, hy + 2.2, 2.6, 1.2);
  }
  if (type === 'thesis') {
    // big round glasses and the bags under the eyes that came with them
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(2, hy, 2.3, 0, Math.PI * 2);
    ctx.moveTo(7.8, hy);
    ctx.arc(5.5, hy, 2.3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(110,80,140,0.45)';
    ctx.fillRect(0.6, hy + 2.6, 2.8, 1);
    ctx.fillRect(4.1, hy + 2.6, 2.8, 1);
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

/** Level gear worn on the body. Each troop picks up something new at most levels. */
function gear(ctx: CanvasRenderingContext2D, type: UnitType, lv: number): void {
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = OUT;
  const stripe = (y: number, color: string, w = 12, h = 2): void => {
    ctx.fillStyle = color;
    ctx.fillRect(-w / 2, y, w, h);
  };
  switch (type) {
    case 'thesis':
      // cardigan: open front over a white shirt, buttons down one side
      ctx.fillStyle = '#f4efe4';
      ctx.fillRect(-2.5, -21, 5, 13);
      ctx.fillStyle = '#d9c9a0';
      for (const by of [-18, -14, -10]) ctx.fillRect(-4.5, by, 1.6, 1.6);
      if (lv >= 2) {
        // lanyard with a grad-office keycard
        ctx.strokeStyle = C.navy;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-2, -21);
        ctx.lineTo(0.5, -13);
        ctx.lineTo(2, -21);
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.fillRect(-1, -13, 3.5, 4);
        ctx.strokeStyle = OUT;
      }
      if (lv >= 3) {
        // a coffee stain that is now part of the cardigan
        ctx.fillStyle = 'rgba(90,55,25,0.55)';
        ctx.beginPath();
        ctx.ellipse(5, -12, 2.2, 1.6, 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      if (lv >= 4) {
        // elbow-patch-brown leather messenger strap
        ctx.strokeStyle = '#7a4e2a';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(-7, -21);
        ctx.lineTo(7, -9);
        ctx.stroke();
        ctx.strokeStyle = OUT;
      }
      break;
    case 'senior':
      if (lv >= 2) {
        // gold stole
        ctx.fillStyle = C.gold;
        ctx.fillRect(-5, -21, 2, 13);
        ctx.fillRect(3, -21, 2, 13);
      }
      if (lv >= 4) {
        // honor cords, gold and white
        ctx.strokeStyle = '#fff6d6';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-2, -21);
        ctx.lineTo(-1, -9);
        ctx.moveTo(1, -21);
        ctx.lineTo(1.5, -9);
        ctx.stroke();
        ctx.strokeStyle = OUT;
      }
      break;
    case 'freshman':
      if (lv >= 3 && lv < 5) {
        // letterman jacket
        ctx.fillStyle = C.gold;
        ctx.font = 'bold 7px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('C', 3.5, -13);
      }
      if (lv >= 5) stripe(-20, C.gold, 12, 1.6); // graduation stole
      break;
    case 'engineer':
      if (lv >= 2) {
        // tool belt
        stripe(-9.5, '#6b4526', 13, 2.6);
        ctx.fillStyle = '#9aa3ad';
        ctx.fillRect(-5, -9, 2.5, 4);
        ctx.fillRect(2, -9, 2.5, 4);
      }
      if (lv >= 5) stripe(-20, '#9aa3ad', 13, 3); // exo shoulder plate
      break;
    case 'nurse':
      if (lv >= 2) {
        // stethoscope
        ctx.strokeStyle = '#33415a';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(0, -17, 4, 0.15, Math.PI - 0.15);
        ctx.stroke();
        ctx.fillStyle = '#c8ccd2';
        ctx.beginPath();
        ctx.arc(3.5, -12.5, 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = OUT;
      }
      if (lv >= 4) stripe(-9.5, C.teal, 13, 2); // white coat, teal hem
      break;
    case 'theology':
      if (lv >= 2) {
        // gold stole
        ctx.fillStyle = C.gold;
        ctx.fillRect(-5, -21, 2, lv >= 4 ? 16 : 11);
        ctx.fillRect(3, -21, 2, lv >= 4 ? 16 : 11);
      }
      break;
    case 'athlete':
      if (lv >= 2) {
        stripe(-21.5, C.navy, 16, 1.6);
        stripe(-10, C.navy, 16, 1.6);
      }
      if (lv >= 3) {
        // shoulder pads
        ctx.fillStyle = '#fff';
        ctx.fillRect(-10, -22.5, 5, 3.5);
        ctx.strokeRect(-10, -22.5, 5, 3.5);
        ctx.fillRect(5, -22.5, 5, 3.5);
        ctx.strokeRect(5, -22.5, 5, 3.5);
      }
      if (lv >= 4) {
        // captain's patch
        ctx.fillStyle = C.navy;
        ctx.fillRect(-7.5, -18, 4, 4);
        ctx.fillStyle = C.gold;
        ctx.font = 'bold 4px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('C', -5.5, -14.6);
      }
      break;
    case 'business':
      if (lv >= 2) {
        // blazer lapels
        ctx.fillStyle = '#1f2838';
        ctx.beginPath();
        ctx.moveTo(-6, -21);
        ctx.lineTo(-2.5, -19);
        ctx.lineTo(-4, -11);
        ctx.lineTo(-6, -11);
        ctx.closePath();
        ctx.moveTo(6, -21);
        ctx.lineTo(2.5, -19);
        ctx.lineTo(4, -11);
        ctx.lineTo(6, -11);
        ctx.closePath();
        ctx.fill();
      }
      if (lv >= 3) {
        // pocket square
        ctx.fillStyle = C.gold;
        ctx.fillRect(-5.5, -16.5, 2.4, 2);
      }
      if (lv >= 5) {
        // gold tie
        ctx.fillStyle = C.gold;
        ctx.fillRect(-1, -18, 2, 8);
      }
      break;
    case 'music':
      if (lv >= 3) {
        // band-uniform epaulettes and buttons
        ctx.fillStyle = C.gold;
        ctx.fillRect(-7.5, -21.5, 4, 2);
        ctx.fillRect(3.5, -21.5, 4, 2);
        for (const y of [-14, -11]) {
          ctx.beginPath();
          ctx.arc(0, y, 0.9, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (lv >= 5) {
        // sash
        ctx.strokeStyle = C.gold;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-6, -20);
        ctx.lineTo(6, -9);
        ctx.stroke();
        ctx.strokeStyle = OUT;
      }
      break;
    case 'runner':
      if (lv >= 2) stripe(-20.5, C.navy, 11, 1.6);
      if (lv >= 4) {
        // racing flats
        ctx.fillStyle = '#c6ff3a';
        ctx.fillRect(-5.5, -2, 5, 2.2);
        ctx.fillRect(0.5, -2, 5, 2.2);
      }
      if (lv >= 5) {
        // finisher's medal
        ctx.strokeStyle = C.red;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(-3, -21);
        ctx.lineTo(3.5, -11.5);
        ctx.moveTo(3, -21);
        ctx.lineTo(3.5, -11.5);
        ctx.stroke();
        ctx.fillStyle = C.gold;
        ctx.strokeStyle = OUT;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(3.5, -10.5, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      break;
    case 'ra':
      if (lv >= 2) {
        // walkie-talkie on the belt
        stripe(-9.5, '#2a2733', 16, 2);
        ctx.fillStyle = '#2a2733';
        ctx.fillRect(-7.5, -13, 3, 5);
        ctx.fillRect(-6.5, -16, 1, 3);
      }
      if (lv >= 4) {
        // whistle on a lanyard
        ctx.strokeStyle = C.gold;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-3, -21.5);
        ctx.lineTo(4, -15);
        ctx.lineTo(3, -21.5);
        ctx.stroke();
        ctx.strokeStyle = OUT;
      }
      if (lv >= 5) {
        // "Head RA" sash
        ctx.strokeStyle = C.gold;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(-7, -21);
        ctx.lineTo(7, -9);
        ctx.stroke();
        ctx.strokeStyle = OUT;
      }
      break;
    case 'gomember':
      if (lv >= 2) stripe(-10, C.navy, 12, 1.6);
      if (lv >= 3) {
        // bandana
        ctx.fillStyle = C.navy;
        ctx.beginPath();
        ctx.moveTo(-4, -21.5);
        ctx.lineTo(4, -21.5);
        ctx.lineTo(0, -17.5);
        ctx.closePath();
        ctx.fill();
      }
      break;
    case 'fan':
      if (lv >= 3) {
        // pom-pom in the other hand
        ctx.fillStyle = C.navy;
        ctx.beginPath();
        ctx.arc(-8, -13, 3.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      break;
    case 'prof':
      if (lv >= 2) {
        // academic hood: blue, then gold-lined
        ctx.strokeStyle = lv >= 3 ? C.gold : C.roofBlue;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-5, -23);
        ctx.lineTo(0, -15);
        ctx.lineTo(5, -23);
        ctx.stroke();
        ctx.strokeStyle = OUT;
      }
      break;
    case 'president':
      if (lv >= 3) {
        // gold epaulettes
        ctx.fillStyle = C.gold;
        ctx.fillRect(-8, -21.5, 4.5, 2.2);
        ctx.fillRect(3.5, -21.5, 4.5, 2.2);
      }
      break;
  }
}

function drawHeld(ctx: CanvasRenderingContext2D, type: UnitType, lv = 1): void {
  if (campusHeld(ctx, type)) return;
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = OUT;
  switch (type) {
    case 'thesis': {
      // the thesis: a slab of a book, thicker with every revision, gold spine from Lv3
      const thick = lv >= 4 ? 8 : 6.5;
      rr(ctx, -thick / 2 + 1, 3, thick, 17, 1.5, '#7a1f2b');
      ctx.fillStyle = lv >= 3 ? C.gold : '#c9b48a';
      ctx.fillRect(-thick / 2 + 1, 3, 1.8, 17);
      // page edges
      ctx.fillStyle = '#f4efe4';
      ctx.fillRect(thick / 2 - 0.6, 4, 1.4, 15);
      // sticky-note tabs from Lv2
      if (lv >= 2) {
        ctx.fillStyle = '#ffe066';
        ctx.fillRect(thick / 2 + 0.6, 6, 2, 2);
        ctx.fillStyle = '#ff8fb8';
        ctx.fillRect(thick / 2 + 0.6, 11, 2, 2);
        ctx.fillStyle = '#7fd8ff';
        ctx.fillRect(thick / 2 + 0.6, 15, 2, 2);
      }
      if (lv >= 5) {
        // the committee signed it: a red APPROVED seal on the cover
        ctx.strokeStyle = '#e03a3a';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(1.5, 11.5, 2.6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0.3, 11.6);
        ctx.lineTo(1.3, 12.7);
        ctx.lineTo(2.9, 10.3);
        ctx.stroke();
        ctx.strokeStyle = OUT;
      }
      break;
    }
    case 'senior':
      if (lv >= 5) {
        // the diploma, finally
        ctx.fillStyle = '#fff6d6';
        ctx.fillRect(-1, 4, 4, 12);
        ctx.strokeRect(-1, 4, 4, 12);
        ctx.fillStyle = C.navy;
        ctx.fillRect(-1, 9, 4, 2);
      } else {
        // a large iced coffee: the only thing keeping them going
        ctx.fillStyle = '#d9b48a';
        ctx.fillRect(-1, 5, 6, 10);
        ctx.strokeRect(-1, 5, 6, 10);
        ctx.strokeStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(3, 5);
        ctx.lineTo(4.5, 1);
        ctx.stroke();
        ctx.strokeStyle = OUT;
      }
      break;
    case 'freshman':
      if (lv >= 5) {
        // diploma
        ctx.fillStyle = '#fff6d6';
        ctx.fillRect(-1, 5, 3, 11);
        ctx.strokeRect(-1, 5, 3, 11);
        ctx.fillStyle = C.red;
        ctx.fillRect(-1, 9, 3, 2);
      } else if (lv >= 4) {
        // coffee cup: knows where Rinnova is now
        ctx.fillStyle = '#fff';
        ctx.fillRect(-1, 6, 6, 8);
        ctx.strokeRect(-1, 6, 6, 8);
        ctx.fillStyle = C.coffee;
        ctx.fillRect(-1, 8, 6, 2.5);
      } else {
        // campus map
        ctx.fillStyle = '#fff6d6';
        ctx.fillRect(-2, 6, 8, 6);
        ctx.strokeRect(-2, 6, 8, 6);
      }
      break;
    case 'engineer':
      // wrench (bigger and golden at the top level)
      ctx.fillStyle = lv >= 5 ? C.gold : '#9aa3ad';
      ctx.fillRect(0, 6, 2.5, lv >= 3 ? 12 : 10);
      ctx.strokeRect(0, 6, 2.5, lv >= 3 ? 12 : 10);
      ctx.beginPath();
      ctx.arc(1.2, lv >= 3 ? 19 : 17, lv >= 5 ? 4.4 : lv >= 3 ? 3.8 : 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    case 'nurse':
      if (lv >= 3) {
        // med bag
        ctx.fillStyle = C.red;
        ctx.fillRect(-3, 8, 10, 7);
        ctx.strokeRect(-3, 8, 10, 7);
        ctx.fillStyle = '#fff';
        ctx.fillRect(1, 9.5, 2, 4);
        ctx.fillRect(0, 10.5, 4, 2);
      } else {
        ctx.fillStyle = '#fff';
        ctx.fillRect(-1, 7, 7, 5);
        ctx.strokeRect(-1, 7, 7, 5);
        ctx.fillStyle = C.green;
        ctx.fillRect(1.5, 8, 2, 3);
      }
      break;
    case 'theology': {
      // the Bible gets bigger and better bound
      const bw = lv >= 3 ? 9 : 7;
      const bh = lv >= 3 ? 10 : 8;
      ctx.fillStyle = lv >= 3 ? '#5a2a1a' : '#3a1a1a';
      ctx.fillRect(-2, 6, bw, bh);
      ctx.strokeRect(-2, 6, bw, bh);
      ctx.fillStyle = C.gold;
      ctx.fillRect(-2 + bw / 2 - 0.6, 8, 1.2, bh - 4);
      if (lv >= 3) ctx.fillRect(-2 + bw / 2 - 2, 9.5, 4, 1.2);
      break;
    }
    case 'athlete':
      // football (a gold game ball at the top level)
      ctx.fillStyle = lv >= 5 ? C.gold : '#8b4a1e';
      ctx.beginPath();
      ctx.ellipse(1, 10, 5, 3.2, 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    case 'prof':
      // crossbow, held out front with a letter on the rail: plain wood, gold limbs from
      // level 3, a gold-trimmed stock at level 5
      ctx.save();
      ctx.translate(1, 9);
      ctx.rotate(0.5);
      // stock, pointing forward
      ctx.fillStyle = C.woodDark;
      ctx.fillRect(-2.5, -1.5, 13, 3);
      ctx.strokeRect(-2.5, -1.5, 13, 3);
      if (lv >= 5) {
        ctx.fillStyle = C.gold;
        ctx.fillRect(-2.5, -1.5, 3, 3);
        ctx.fillRect(4.5, -1.5, 1.6, 3);
      }
      // limbs
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(6.5, -8);
      ctx.quadraticCurveTo(12.5, 0, 6.5, 8);
      ctx.stroke();
      ctx.strokeStyle = lv >= 3 ? C.gold : '#c99a62';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(6.5, -8);
      ctx.quadraticCurveTo(12.5, 0, 6.5, 8);
      ctx.stroke();
      // string
      ctx.strokeStyle = '#f4efe4';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(6.5, -8);
      ctx.lineTo(2.5, 0);
      ctx.lineTo(6.5, 8);
      ctx.stroke();
      // the next letter, loaded
      ctx.fillStyle = lv >= 3 ? C.gold : '#fff6d6';
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 1;
      ctx.fillRect(9.5, -2, 4, 4);
      ctx.strokeRect(9.5, -2, 4, 4);
      ctx.restore();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = OUT;
      break;
    case 'president':
      // scepter; a full ceremonial mace at level 3
      ctx.fillStyle = C.gold;
      ctx.fillRect(0, 4, 2, lv >= 3 ? 15 : 12);
      ctx.strokeRect(0, 4, 2, lv >= 3 ? 15 : 12);
      ctx.beginPath();
      ctx.arc(1, lv >= 3 ? 20 : 17, lv >= 3 ? 4.4 : 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (lv >= 3) {
        ctx.fillStyle = C.red;
        ctx.beginPath();
        ctx.arc(1, 20, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'business':
      // briefcase: leather, then black with gold clasps
      ctx.fillStyle = lv >= 3 ? '#23262e' : '#6b4526';
      ctx.fillRect(-3, 8, 9, 7);
      ctx.strokeRect(-3, 8, 9, 7);
      ctx.strokeRect(0, 6, 3, 2);
      if (lv >= 3) {
        ctx.fillStyle = C.gold;
        ctx.fillRect(-1.5, 10.5, 1.6, 1.6);
        ctx.fillRect(3, 10.5, 1.6, 1.6);
      }
      if (lv >= 5) {
        // second phone
        ctx.fillStyle = '#9fd3f0';
        ctx.fillRect(6.5, 4, 3, 5);
        ctx.strokeRect(6.5, 4, 3, 5);
      }
      break;
    case 'music':
      // trumpet: brass, then silver, then gold with a bigger bell
      ctx.fillStyle = lv >= 5 ? C.gold : lv >= 3 ? '#dfe3e8' : '#d8a23a';
      ctx.fillRect(0, 6, 2.5, 9);
      ctx.strokeRect(0, 6, 2.5, 9);
      if (lv >= 2) {
        // sheet music clipped on
        ctx.save();
        ctx.fillStyle = '#fff';
        ctx.fillRect(-4.5, 7, 4, 5);
        ctx.strokeRect(-4.5, 7, 4, 5);
        ctx.restore();
        ctx.fillStyle = lv >= 5 ? C.gold : lv >= 3 ? '#dfe3e8' : '#d8a23a';
      }
      ctx.beginPath();
      ctx.moveTo(lv >= 4 ? -3.5 : -2, lv >= 4 ? 21 : 19);
      ctx.lineTo(1.2, 14);
      ctx.lineTo(lv >= 4 ? 6 : 4.5, lv >= 4 ? 21 : 19);
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
      if (lv >= 3) {
        // master-key ring
        ctx.strokeStyle = C.gold;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(6.5, 14, 2.4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = OUT;
      }
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

function drawHead(ctx: CanvasRenderingContext2D, type: UnitType, hy: number, hair: string, lv = 1): void {
  if (campusHead(ctx, type, hy, hair)) return;
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = OUT;
  switch (type) {
    case 'thesis': {
      // hasn't had a haircut since the proposal: tufts sticking up, pencil tucked behind the ear
      ctx.fillStyle = hair;
      ctx.beginPath();
      ctx.arc(0, hy - 2, 7.6, Math.PI, Math.PI * 2);
      ctx.fill();
      for (const [tx, ty] of [[-5, -8], [-1, -10], [3, -9.5], [6, -7]] as const) {
        ctx.beginPath();
        ctx.arc(tx, hy + ty, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.save();
      ctx.translate(-4.5, hy + 0.5);
      ctx.rotate(0.3);
      ctx.fillStyle = C.gold;
      ctx.fillRect(-1, -4, 2, 7);
      ctx.fillStyle = '#ff8fb8';
      ctx.fillRect(-1, -5.5, 2, 1.8);
      ctx.restore();
      break;
    }
    case 'senior': {
      // mortarboard: skull cap, a flat board, and a tassel (gold from Lv3)
      ctx.fillStyle = '#1a1c33';
      ctx.beginPath();
      ctx.arc(0, hy - 3, 7, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-11, hy - 8);
      ctx.lineTo(0, hy - 12.5);
      ctx.lineTo(11, hy - 8);
      ctx.lineTo(0, hy - 3.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = lv >= 3 ? C.gold : '#9aa3ad';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, hy - 8);
      ctx.lineTo(8, hy - 6);
      ctx.lineTo(8, hy + 1);
      ctx.stroke();
      ctx.strokeStyle = OUT;
      break;
    }
    case 'engineer':
      // hard hat (white for the senior engineers)
      ctx.fillStyle = lv >= 4 ? '#f4f7f8' : C.gold;
      ctx.beginPath();
      ctx.arc(0, hy - 2, 7.5, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillRect(-9, hy - 2.5, 18, 2.5);
      ctx.strokeRect(-9, hy - 2.5, 18, 2.5);
      if (lv >= 3) {
        // safety goggles pushed up on the hat
        ctx.fillStyle = '#9fd3f0';
        ctx.fillRect(-1, hy - 7.5, 8, 3.2);
        ctx.strokeRect(-1, hy - 7.5, 8, 3.2);
      }
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
      if (type === 'president' && lv >= 2) {
        // presidential medallion on a chain
        ctx.strokeStyle = C.gold;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(1, hy + 9, 5, 0.1, Math.PI - 0.1);
        ctx.stroke();
        ctx.fillStyle = C.gold;
        ctx.strokeStyle = OUT;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(1, hy + 14.5, 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.lineWidth = 1.6;
      }
      if (type === 'prof') {
        // mortarboard (gold-trimmed for the senior faculty)
        ctx.fillStyle = lv >= 5 ? C.navy : C.black;
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
      if (lv >= 5) {
        // gold helmet
        ctx.fillStyle = C.gold;
        ctx.beginPath();
        ctx.arc(0, hy - 1.5, 8, Math.PI, Math.PI * 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = C.navy;
        ctx.fillRect(-1, hy - 9.5, 2, 8);
      } else {
        ctx.fillStyle = lv >= 2 ? C.gold : C.navy;
        ctx.fillRect(-7, hy - 4, 14, 2.5);
      }
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
      if (lv >= 4) {
        // marching-band shako with a plume
        ctx.fillStyle = C.navy;
        ctx.fillRect(-5.5, hy - 14, 11, 9);
        ctx.strokeRect(-5.5, hy - 14, 11, 9);
        ctx.fillStyle = C.gold;
        ctx.fillRect(-5.5, hy - 8, 11, 2);
        ctx.fillStyle = lv >= 5 ? C.gold : '#fff';
        ctx.beginPath();
        ctx.ellipse(0, hy - 18, 2.6, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillStyle = C.black;
        ctx.beginPath();
        ctx.ellipse(-1.5, hy - 7, 8, 3.6, -0.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
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
      ctx.fillStyle = type === 'ra' ? (lv >= 5 ? C.gold : C.navy) : lv >= 5 ? C.gold : '#e4572e';
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
      // freshman: messy hair + beanie; a mortarboard once they finally graduate
      ctx.fillStyle = hair;
      ctx.beginPath();
      ctx.arc(0, hy - 2, 7.3, Math.PI * 1.0, Math.PI * 2.0);
      ctx.fill();
      if (type === 'freshman' && lv >= 5) {
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
        break;
      }
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


// Reference-inspired Cedarville uniforms. These helpers only draw; they never touch balance.
function campusBadge(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1): void {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  ctx.strokeStyle = C.gold; ctx.lineWidth = 0.7;
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(Math.cos(a), Math.sin(a)); ctx.lineTo(Math.cos(a) * 2.7, Math.sin(a) * 2.7); ctx.stroke(); }
  ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(0, 0, 1.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.fillRect(-0.6, 0, 1.2, 4); ctx.restore();
}
function campusGear(ctx: CanvasRenderingContext2D, type: UnitType, lv: number, facing: number): boolean {
  if (!['freshman','athlete','engineer','theology','nurse','business','music','runner','ra'].includes(type)) return false;
  ctx.save();
  if (type === 'engineer') {
    ctx.fillStyle = C.gold; ctx.fillRect(-6,-20,3,12); ctx.fillRect(3,-20,3,12); ctx.fillRect(-6,-11,12,3);
    ctx.fillStyle = '#fff'; ctx.fillRect(-5,-19,1,7); ctx.fillRect(4,-19,1,7);
  } else if (type === 'theology') {
    ctx.fillStyle = '#fff'; ctx.fillRect(-5,-23,3,19); ctx.fillRect(2,-23,3,19); campusBadge(ctx,3.5,-11,0.5);
  } else if (type === 'nurse') {
    ctx.fillStyle = OUTFIT.nurse.body; ctx.fillRect(-4,-18,8,9);
    ctx.strokeStyle = '#d7e5e9'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0,-18,3,0,Math.PI); ctx.lineTo(2,-12); ctx.stroke();
    circle(ctx,2,-12,1.2,'#cdd4dc',0.6);
    ctx.fillStyle = '#fff'; ctx.fillRect(-4,-11,3,3);
  } else if (type === 'music') {
    ctx.strokeStyle = C.gold; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-6,-20); ctx.lineTo(5,-9); ctx.stroke();
    ctx.fillStyle = C.gold; ctx.fillRect(-7,-21,4,2); ctx.fillRect(3,-21,4,2);
  } else if (type === 'ra') {
    ctx.strokeStyle = C.gold; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-4,-20); ctx.lineTo(3,-12); ctx.lineTo(5,-20); ctx.stroke();
    rr(ctx,1,-12,4,5,0.5,'#fff');
  } else if (type === 'freshman') {
    ctx.fillStyle = '#fff'; ctx.font = 'bold 2.6px sans-serif'; ctx.textAlign = 'center'; ctx.scale(facing, 1); ctx.fillText('CEDARVILLE',0,-16,11);
  }
  ctx.strokeStyle = type === 'business' ? '#46464b' : '#3d6683'; ctx.lineWidth = 0.5; ctx.beginPath();ctx.moveTo(-5,-18);ctx.lineTo(-5,-10);ctx.stroke();
  if (type === 'business' || type === 'music') {
    ctx.fillStyle=C.gold;for (const by of [-16,-13,-10]) {ctx.beginPath();ctx.arc(2,by,0.55,0,Math.PI*2);ctx.fill();}
  }
  if (type === 'business') campusBadge(ctx,-4,-17,0.5);
  if (lv >= 3) { ctx.fillStyle=C.gold; ctx.fillRect(-6,-9,2,1); }
  if (lv >= 5) { ctx.fillStyle=C.gold; ctx.fillRect(-6,-7,2,1); }
  ctx.restore(); return true;
}
function campusHeld(ctx: CanvasRenderingContext2D, type: UnitType): boolean {
  ctx.save();
  if (type === 'freshman') { rr(ctx,-1,6,6,10,1,'#a53332'); ctx.fillStyle='#fff'; ctx.fillRect(1,7,1,8); ctx.fillRect(3,7,1,8); }
  else if (type === 'engineer') { rr(ctx,-1,3,4,14,1,'#9fd3f0'); circle(ctx,1,3,2,'#d7edf7',1); }
  else if (type === 'nurse') { rr(ctx,-1,5,8,11,1,'#fff'); rr(ctx,1,4,4,2,0.5,'#7d8d9a'); campusBadge(ctx,3,10,0.7); }
  else if (type === 'athlete') { ctx.fillStyle='#94501f'; ctx.beginPath(); ctx.ellipse(1,10,4,6,-0.4,0,Math.PI*2);ctx.fill();ctx.strokeStyle=OUT;ctx.lineWidth=1;ctx.stroke();ctx.strokeStyle='#fff';ctx.beginPath();ctx.moveTo(0,7);ctx.lineTo(2,12);ctx.stroke(); }
  else if (type === 'music') { ctx.strokeStyle='#ffdc49';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,4);ctx.lineTo(0,10);ctx.quadraticCurveTo(0,14,5,14);ctx.lineTo(8,10);ctx.stroke();ctx.fillStyle=C.gold;ctx.beginPath();ctx.moveTo(5,9);ctx.lineTo(11,8);ctx.lineTo(9,14);ctx.closePath();ctx.fill();ctx.strokeStyle=OUT;ctx.lineWidth=1;ctx.stroke();ctx.fillStyle='#b17614';ctx.beginPath();ctx.ellipse(9,10.5,1.2,2,-0.4,0,Math.PI*2);ctx.fill();for(const vx of [0,2,4]){ctx.fillStyle='#ffed91';ctx.fillRect(vx,8,1,3);} }
  else if (type === 'runner' || type === 'ra') { circle(ctx,1,8,2,C.skin,1); }
  else { ctx.restore(); return false; }
  ctx.restore(); return true;
}
function isCampusTroop(type: UnitType): boolean {
  return ['freshman', 'athlete', 'engineer', 'theology', 'nurse', 'business', 'music', 'runner', 'ra'].includes(type);
}

function campusHead(ctx: CanvasRenderingContext2D, type: UnitType, hy: number, hair: string): boolean {
  if (!isCampusTroop(type)) return false;
  ctx.save(); ctx.translate(0, hy); ctx.strokeStyle = OUT; ctx.lineWidth = 1.15;
  const navy = ctx.createLinearGradient(-8, -12, 8, 0);
  navy.addColorStop(0, '#276792'); navy.addColorStop(0.55, '#103c64'); navy.addColorStop(1, C.navy);
  const gold = ctx.createLinearGradient(-7, -11, 6, 0);
  gold.addColorStop(0, '#fff19b'); gold.addColorStop(0.4, '#ffcf18'); gold.addColorStop(1, '#d99c08');
  // Swept hair, rather than a flat semicircle, echoes the illustrated portraits.
  if (type === 'theology' || type === 'business' || type === 'runner') {
  ctx.fillStyle = hair; ctx.beginPath(); ctx.moveTo(-7, 0); ctx.bezierCurveTo(-11, -8, -4, -11, 0, -8);
  ctx.bezierCurveTo(5, -10, 7, -7, 9, -10); ctx.bezierCurveTo(11, -5, 4, -3, -1, -5);
  ctx.lineTo(-4, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#a66a36'; ctx.lineWidth = 0.65; ctx.beginPath();ctx.moveTo(-5,-6);ctx.quadraticCurveTo(0,-9,5,-7);ctx.stroke();
  } else {
    ctx.fillStyle=hair;ctx.beginPath();ctx.arc(0,-2,7.3,Math.PI,Math.PI*2);ctx.fill();
  }
  ctx.strokeStyle = OUT; ctx.lineWidth = 1.15;
  if (type === 'freshman' || type === 'ra') {
    if (type === 'ra') { ctx.fillStyle = hair; ctx.beginPath();ctx.moveTo(-6,-2);ctx.bezierCurveTo(-7,4,-13,8,-10,13);ctx.quadraticCurveTo(-4,15,-4,3);ctx.fill();ctx.stroke(); }
    ctx.fillStyle = navy; ctx.beginPath();ctx.moveTo(-8,-3);ctx.bezierCurveTo(-9,-15,6,-15,8,-4);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.strokeStyle='#397fa4';ctx.lineWidth=0.6;ctx.beginPath();ctx.moveTo(-1,-12);ctx.quadraticCurveTo(-3,-7,-2,-4);ctx.stroke();
    ctx.strokeStyle=OUT;ctx.lineWidth=1;ctx.fillStyle=gold;ctx.beginPath();ctx.moveTo(-4,-4);ctx.quadraticCurveTo(7,-7,11,-3);ctx.quadraticCurveTo(4,0,-4,-2);ctx.closePath();ctx.fill();ctx.stroke();campusBadge(ctx,1,-8,0.6);
  } else if (type === 'engineer' || type === 'athlete') {
    ctx.fillStyle=gold;ctx.beginPath();ctx.arc(0,-3,8.8,Math.PI,0);ctx.lineTo(8,-1);ctx.lineTo(-8,-1);ctx.closePath();ctx.fill();ctx.stroke();
    if(type==='athlete') {
      ctx.fillStyle=C.navy;ctx.beginPath();ctx.moveTo(-2,-11);ctx.lineTo(1,-11);ctx.lineTo(3,-3);ctx.lineTo(-1,-3);ctx.fill();
      ctx.strokeStyle='#fff';ctx.lineWidth=0.6;ctx.beginPath();ctx.moveTo(-3,-11);ctx.lineTo(-2,-3);ctx.stroke();
      rr(ctx,-5,-3,12,3,0.7,C.navy);ctx.strokeStyle=C.navy;ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(-5,-1);ctx.lineTo(-4,5);ctx.lineTo(7,5);ctx.lineTo(8,-2);ctx.stroke();
    } else {
      rr(ctx,-9,-3,18,2,0.6,C.gold);ctx.fillStyle='#fff3a0';ctx.fillRect(-2,-10,1,6);
      rr(ctx,-5,-1,12,4,1,'#eaf6fa');ctx.fillStyle='#8ec3dd';ctx.fillRect(-3.5,-0.5,3,3);ctx.fillRect(2,-0.5,3,3);campusBadge(ctx,2,-7,0.5);
    }
  } else if(type==='music') {
    ctx.fillStyle=navy;ctx.beginPath();ctx.moveTo(-8,-5);ctx.lineTo(-9,-13);ctx.lineTo(6,-15);ctx.lineTo(8,-5);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.strokeStyle=C.gold;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-8,-6);ctx.lineTo(8,-7);ctx.stroke();
    ctx.fillStyle=gold;ctx.strokeStyle=OUT;ctx.lineWidth=0.8;
    for(let i=0;i<5;i++){ctx.beginPath();ctx.ellipse(-1+(i-2)*0.8,-16-Math.abs(2-i)*0.3,1.4,3.8,(i-2)*0.35,0,Math.PI*2);ctx.fill();ctx.stroke();}campusBadge(ctx,0,-10,0.6);
  } else if(type==='runner') {rr(ctx,-7,-5,14,2.5,0.6,C.gold);campusBadge(ctx,2,-4,0.4);}
  else if(type==='nurse') {circle(ctx,-6,-7,3,hair,1);ctx.strokeStyle='#fff';ctx.lineWidth=2.4;ctx.beginPath();ctx.arc(0,-2,7,Math.PI*1.04,Math.PI*1.94);ctx.stroke();}
  else if(type==='theology') {ctx.strokeStyle=OUT;ctx.lineWidth=1;ctx.strokeRect(-4,-2,4,5);ctx.strokeRect(2,-2,4,5);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(2,0);ctx.stroke();}
  ctx.restore();return true;
}
