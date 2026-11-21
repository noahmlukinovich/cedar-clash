// Chunky procedural characters for troops, heroes, fans, builders.
import type { UnitType, BuildingType, TroopType } from '../config/types';
import { C, OUT } from './draw';
import { BUILDINGS } from '../config/buildings';
import { TROOPS } from '../config/troops';

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

/** Campus paint schemes: the first three follow the supplied photographs. */
const ROCK_PAINT = [
  { base: '#f0d332', accent: '#164f9b', text: 'WELCOME', sub: 'home', pattern: 'gold' },
  { base: '#ccd1cf', accent: '#234a9b', text: 'welcome', sub: '', pattern: 'silver' },
  { base: '#172c3c', accent: '#e9da85', text: 'CU FRIDAY', sub: 'Thanks for visiting', pattern: 'event' },
  { base: '#173b6b', accent: '#ffdb57', text: 'GO JACKETS', sub: '', pattern: 'classic' },
  { base: '#f4efe4', accent: '#bf3544', text: 'MARRY ME?', sub: '', pattern: 'classic' },
  { base: '#34614d', accent: '#f4efe4', text: "CLASS OF '27", sub: '', pattern: 'classic' },
  { base: '#a84270', accent: '#ffda5b', text: 'HAPPY 21ST', sub: '', pattern: 'classic' },
  { base: '#e6ae31', accent: '#173b6b', text: 'JOHN 3:16', sub: '', pattern: 'classic' },
  { base: '#745084', accent: '#f4efe4', text: 'PRAY 4 FINALS', sub: '', pattern: 'classic' },
] as const;

const rockPaths = new Map<string, Path2D>();
function rockPath(path: string): Path2D {
  let p = rockPaths.get(path);
  if (!p) { p = new Path2D(path); rockPaths.set(path, p); }
  return p;
}

/** A broad campus boulder brought to life; its repainting remains visible at every level. */
function drawRock(ctx: CanvasRenderingContext2D, x: number, y: number, o: UnitDrawOpts, pebble: boolean): void {
  const level = Math.max(1, Math.min(7, Math.floor(o.level ?? 1)));
  const scale = o.scale * (pebble ? .43 : .78);
  const paint = ROCK_PAINT[Math.abs(Math.floor(o.variant ?? 0)) % ROCK_PAINT.length];
  const step = o.moving ? Math.sin(o.t * 6) : 0;
  const swing = Math.sin(Math.max(0, Math.min(1, o.attacking)) * Math.PI);
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(x, y, 33 * scale, 7.5 * scale, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(x + swing * o.facing * scale * 2, y - Math.abs(step) * scale * 1.4);
  ctx.scale(scale * o.facing, scale);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const shape = (d: string, fill: string | CanvasGradient, width = 1.65, stroke = '#172331'): void => {
    const p = rockPath(d); ctx.fillStyle = fill; ctx.fill(p);
    if (width) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(p); }
  };
  const seam = (d: string, color = '#3b4851', width = 1): void => { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(rockPath(d)); };
  // Split stone feet and short, load-bearing legs, with the existing walking timing.
  for (const side of [-1, 1]) {
    ctx.save(); ctx.translate(side * 10, -Math.max(0, step * side) * 3);
    shape('M-6-15 3-16 6-8 5-2-6-2-8-8Z', '#535e64');
    shape('M-7-7 4-8 8-3 7 1-9 1-10-2Z', '#788187');
    shape('M-7-6 2-7 5-4-8-3Z', '#aab0ae', 0);
    seam('M-3-2V1M2-2 3 1', '#44505a', .85); ctx.restore();
  }
  shape('M-14-25 13-25 16-15 8-10-9-10-17-16Z', '#394850');
  shape('M-7-22 6-23 8-15 0-12-9-16Z', '#6e797d', 1);
  // Heavy original stone arms. The torso, rather than a separate stone head, is the campus rock.
  if (!pebble) for (const side of [-1, 1]) {
    ctx.save(); ctx.scale(side, 1); ctx.translate(0, side === 1 ? -swing * 5 : swing * 2);
    ctx.translate(25, -42); ctx.scale(.9, .92); ctx.translate(-25, 42);
    ctx.translate(25, -42); ctx.rotate((side === 1 ? -swing * .40 : swing * .12) + step * side * .045); ctx.translate(-25, 42);
    shape('M22-49 31-49 39-42 39-32 31-27 22-32 19-40Z', '#89918e');
    shape('M24-47 31-46 35-40 27-39 22-42Z', '#b8beb5', 0);
    shape('M31-38 39-39 43-29 39-21 29-23 26-30Z', '#616d74');
    shape('M35-33 40-32 41-27 36-24 30-26Z', '#9aa29d', 0);
    shape('M29-27 40-27 46-19 44-10 36-7 27-12 25-19Z', '#808985');
    shape('M29-24 39-24 42-20 35-18 28-20Z', '#b1b7ac', 0);
    seam('M29-18 30-15 29-12M34-17 35-14 34-10M40-18 39-14 40-11', '#3d4d54', 1.1);
    shape('M23-47 28-46 29-42 24-42Z', paint.base, .6);
    if (level >= 3) { shape('M29-32 39-33 40-30 30-29Z', '#24486c', .8); seam('M30-31 38-32', '#eac84d', .75); }
    if (level >= 6) seam('M32-46 37-41 37-36', '#d6d9cf', .8);
    ctx.restore();
  }
  // Broad, low and asymmetrical, with the ridge and missing corner visible in the campus photos.
  const body = 'M-34-35Q-37-38-34-41L-30-43-28-47Q-25-48-22-48L-19-51-13-52-9-54-4-53 1-55 7-54 11-52 18-52Q24-51 27-47L31-43Q34-39 35-33L34-28Q33-24 29-23L21-22 11-22 3-23-7-22-17-23-24-22Q-29-23-29-27L-28-31-31-31Z';
  const base = pebble ? '#89918e' : paint.base;
  const bodyGradient = ctx.createLinearGradient(-19, -54, 24, -22);
  bodyGradient.addColorStop(0, pebble ? '#b6bbb5' : paint.pattern === 'gold' ? '#f9e56c' : paint.pattern === 'silver' ? '#eceddf' : paint.pattern === 'event' ? '#4b6370' : paint.base);
  bodyGradient.addColorStop(.45, base); bodyGradient.addColorStop(1, pebble ? '#68757b' : paint.pattern === 'gold' ? '#c8ac22' : paint.pattern === 'silver' ? '#9aa9ad' : paint.pattern === 'event' ? '#142532' : paint.base);
  shape(body, bodyGradient, 2);
  ctx.save(); ctx.clip(rockPath(body));
  // Uneven natural planes; no regular brick or armor pattern across the painted face.
  shape('M-35-40-27-46-17-50-9-52 2-53 15-50 25-46 32-37 25-44 14-47 2-49-10-48-24-44Z', 'rgba(255,255,255,.20)', 0);
  shape('M-35-39-29-35-27-31-28-26-24-23-17-22-26-21-33-27Z', 'rgba(10,27,39,.26)', 0);
  shape('M26-47 34-38 35-29 29-23 20-21 18-24 29-29Z', 'rgba(10,27,39,.17)', 0);
  if (!pebble && paint.pattern === 'silver') {
    shape('M-38-47-13-56-5-53-15-21-36-20Z', '#efce39', 0);
    shape('M-12-53-8-54-20-21-23-21Z', '#a3b5ba', 0);
    shape('M-15-21-6-39 3-20Z', '#234a9b', 0);
  }
  if (pebble) shape('M-25-42-9-51 3-50-5-36-18-34Z', paint.base, 0);
  // Fixed-position flecks suggest many layers of paint without per-frame randomness.
  for (let n = 0; n < 28; n++) {
    const fx = -32 + ((n * 19 + 7) % 65), fy = -53 + ((n * 13 + 3) % 30);
    ctx.fillStyle = n % 3 ? 'rgba(255,255,255,.13)' : 'rgba(16,35,49,.13)';
    ctx.beginPath(); ctx.ellipse(fx, fy, .35 + (n % 3) * .18, .3 + (n % 2) * .22, n, 0, Math.PI * 2); ctx.fill();
  }
  // Old coats peek out only at the rim, leaving the painted message clear.
  shape('M-30-33-27-31-27-27-30-28Z', '#405b70', .4);
  shape('M17-22 23-25 28-24 25-22Z', '#e6e2ca', .4);
  seam('M-25-46-19-47-15-46M4-54 8-51 14-51M32-34 29-31', 'rgba(18,36,49,.25)', .75);
  ctx.restore();
  if (!pebble) {
    // Keep the campus lettering readable in both movement directions.
    ctx.save(); ctx.scale(o.facing, 1); ctx.fillStyle = paint.accent;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (paint.pattern === 'gold') {
      ctx.font = '900 6.2px sans-serif'; ctx.fillText('WELCOME', 0, -38, 45);
      ctx.font = 'italic 8.4px cursive'; ctx.fillText('home', 1, -29.2, 37);
    } else if (paint.pattern === 'silver') {
      ctx.font = 'italic 7.6px cursive'; ctx.fillText('welcome', 6, -33, 39);
    } else if (paint.pattern === 'event') {
      ctx.font = '4.0px sans-serif'; ctx.fillText(paint.sub, 0, -38.5, 45);
      ctx.font = '900 6.8px sans-serif'; ctx.fillText(paint.text, 0, -29.5, 46);
    } else {
      ctx.font = `900 ${paint.text.length > 10 ? 5.1 : 6.3}px sans-serif`; ctx.fillText(paint.text, 0, -33, 46);
    }
    ctx.restore();
    // A distinct stone head sits ABOVE the campus boulder: no eyes or mask on its painted face.
    shape('M-6-52-7-58 7-59 9-52 4-49-4-49Z', '#455963', 1.15);
    shape('M-10-55-13-62-11-69-6-73 3-74 10-71 14-65 12-57 7-53-3-53Z', '#8d9796', 1.65);
    shape('M-10-65-7-70 2-72 8-69 10-65 2-66-4-64Z', '#c4c9be', 0);
    shape('M8-69 13-64 11-57 6-54 3-56 7-61Z', '#63757c', 0);
    // Eyes only: no mouth, brows, eyelids or mask to imply an expression.
    for (const ex of [-4.5, 5.5]) {
      ctx.beginPath(); ctx.ellipse(ex, -62, 2.4, 2.65, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#b0e4ed'; ctx.fill(); ctx.strokeStyle = '#314c59'; ctx.lineWidth = .65; ctx.stroke();
    }
    seam('M4-72 3-69 6-68', '#63777e', .8);

  } else {
    for (const ex of [-4, 5]) { circle(ctx, ex, -36, 2.4, '#e5edf0', .9); dot(ctx, ex + .5, -35.8, .9); }
  }
  // Existing frozen and hit-flash cues cover the new silhouette too.
  if (o.flash && o.flash > 0) { ctx.save(); ctx.globalAlpha *= o.flash * .65; shape(body, '#fff', 0); ctx.restore(); }
  if (o.frozen) { shape(body, 'rgba(170,225,255,.4)', 1.2, '#e7faff'); }
  ctx.restore();
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

/** Reference-matched hero art; only drawing changes, all battle behavior stays in the simulation. */
function drawRefinedHero(ctx: CanvasRenderingContext2D, kind: 'prof' | 'president', o: UnitDrawOpts, lv: number): void {
  const ink = OUT, gold = lv >= 3 ? '#efb820' : '#c49b48', skin = '#ffc783';
  const attack = o.attacking > 0 ? Math.sin(o.attacking * Math.PI) : 0;
  const step = o.moving ? Math.sin(o.t * 12) * 9 : 0;
  const shade = (h: string, k: number): string => '#' + h.slice(1).match(/../g)!.map(v => Math.min(255, Math.round(parseInt(v,16)*k)).toString(16).padStart(2,'0')).join('');
  const p = (d: string, f: string, s = ink, w = 5): void => {
    if (/^#[0-9a-f]{6}$/i.test(f)) { const g = ctx.createLinearGradient(-70,-70,90,190); g.addColorStop(0,shade(f,1.28)); g.addColorStop(.46,f); g.addColorStop(1,shade(f,.67)); ctx.fillStyle = g; } else ctx.fillStyle = f;
    ctx.strokeStyle = s; ctx.lineWidth = w*.8; ctx.lineJoin='round'; ctx.lineCap='round';
    const path = new Path2D(d); ctx.fill(path); if(w) ctx.stroke(path);
  };
  const line = (d: string, col = ink, w = 5): void => { ctx.strokeStyle=col; ctx.lineWidth=w; ctx.lineCap='round'; ctx.stroke(new Path2D(d)); };
  const ell = (x: number, y: number, rx: number, ry: number, f: string, s = ink, w = 4): void => { ctx.beginPath(); ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2); ctx.fillStyle=f; ctx.fill(); if(w) {ctx.strokeStyle=s;ctx.lineWidth=w;ctx.stroke();} };
  ctx.save(); ctx.scale(.135,.135); ctx.translate(0,-200);
if(kind==='prof'){
// lined academic cape, robe and shoes
p('M-48 57 L-96 172 Q-76 166-60 181 L65 183 L45 61Z','#8b3927');p('M-65 89 L-88 165 L-69 168 L-45 97Z','#bd5535','',0);
ctx.save();ctx.translate(0, step);p('M-22 176 L-26 190 Q-48 190-43 201 L-3 199 L2 181Z','#392e22');ctx.restore();ctx.save();ctx.translate(0,-step);p('M26 176 L33 190 Q54 188 57 200 L17 200 L12 179Z','#392e22');
ctx.restore();p('M-43 63 Q-20 48 22 60 L47 93 L62 181 Q8 197-53 180 L-43 111Z','#684521');p('M-20 85 L-36 179 L-7 186 L4 90Z','#80582d','',0);p('M29 88 L44 183 L54 181 L38 90Z','#b98225','',0);
p('M-38 61 L-3 103 L29 61 L38 71 L-2 122 L-47 74Z',gold);p('M-19 62 L-3 89 L12 64Z','#f4eee0');p('M-4 67 L2 75 L-2 86 L-8 75Z','#9b631d',ink,2);
line('M-34 114 L-46 179',gold,7);line('M29 116 L47 184',gold,7);
// substantial folds and gold embroidered robe edges
p('M-23 116 L-33 179 L-15 182 L-9 133Z','#51371f','',0);
p('M5 124 L0 185 L15 185 L12 132Z','#9c7138','',0);
p('M26 129 L37 181 L28 182 L17 137Z','#4c321d','',0);
line('M-38 123 L-48 178','#ffe279',2);
line('M35 124 L48 178','#ffd269',2);
line('M-45 74 L-2 114 L35 72','#ffdc59',3);
ctx.save(); ctx.translate(-38, 65); ctx.rotate(-attack * 0.18); ctx.translate(38, -65);
// outstretched teaching arm
p('M-41 69 L-79 55 L-88 101 Q-65 119-35 101Z','#67411f');p('M-78 57 Q-89 73-81 101 L-73 103 Q-79 78-70 61Z',gold,ink,2);
p('M-78 58 Q-92 52-106 45 Q-120 38-119 31 Q-117 24-103 29 L-91 36 Q-94 17-87 18 Q-81 20-80 35 L-72 47Z',skin);
line('M-113 33 L-98 40','#d58b4a',2);
p('M-72 69 Q-77 87-68 99 L-48 102 Q-64 88-62 73Z','#8c5a2c','',0);
p('M-70 101 Q-53 100-38 92 L-37 101 Q-50 112-70 106Z','#432d1c','',0);
ctx.restore();
// head and hair
p('M-32 8 Q-44-25-21-40 Q9-57 34-31 L38 21 Q27 51-4 50 Q-30 47-32 8Z','#c7c3b6');p('M-20-25 Q8-42 32-24 L35 15 Q31 36 8 40 L-17 26Z',skin);ell(-24,13,11,13,skin);line('M-28 10 Q-20 5-19 18','#e9a163',3);
p('M-33-3 Q-36-24-6-37 L9-31 Q-4-11-29-7Z','#dcd9c9');line('M-28-18 L-7-27','#aaa89f',3);
// sculpted silver hair and cheek planes
p('M-19-26 Q-9-38 13-33 Q0-26-14-21Z','#efebdc','',0);
p('M-32-12 Q-30-23-16-25 L-24-13 L-30 3Z','#96968e','',0);
p('M23-18 Q32-14 34-3 L34 20 L26 25 L24 5Z','#eaa362','',0);
line('M-23 24 Q-16 30-9 29','#c38553',2);
// beard and moustache
p('M-19 19 Q-15 29-6 26 Q8 14 24 21 L33 24 Q40 37 32 46 Q29 52 23 49 Q18 57 12 52 Q7 59 0 53 Q-7 58-12 50 Q-20 54-24 45 Q-31 35-19 19Z','#d1cfc2');p('M-5 24 Q7 13 19 22 L27 29 Q15 25 9 29 Q4 23-7 31Z','#e4dfd0',ink,2);line('M3 36 Q12 31 19 36',ink,3);
// layered beard locks
p('M-23 30 Q-24 45-14 46 L-16 34Z','#aaa99e','',0);
p('M-13 35 Q-13 52-4 51 L-6 37Z','#eeeadd','',0);
p('M-3 40 Q-2 52 5 51 L4 39Z','#eeeadd','',0);
p('M10 39 Q11 53 17 48 L18 39Z','#eeeadd','',0);
p('M24 33 Q30 44 23 49 L30 43 L34 30Z','#999b94','',0);
// glasses and brows
line('M-18-5 Q-9-9 1-5 M14-5 L27-8',ink,4);p('M-23 1 Q-13-1 1 0 L1 13 Q0 21-10 20 L-18 18 Q-23 14-23 1Z','rgba(255,255,255,0.1)',ink,3);p('M13 0 Q26-3 34-2 L35 11 Q35 19 27 19 L20 19 Q14 18 14 11Z','rgba(255,255,255,0.1)',ink,3);line('M2 6 L13 5',ink,3);ell(-3,8,3,7,ink,'',0);ell(24,7,3,7,ink,'',0);
// mortarboard
p('M-64-39 Q-67-41-62-45 L-7-75 Q-4-77 2-75 L58-63 Q64-61 67-57 L72-50 L12-24Z','#1d2c46');p('M-37-28 Q-6-55 35-49 L38-36 Q-6-38-37-16Z','#17253c');line('M-61-40 L-5-69 L27-64','#73798d',3);line('M34-64 Q70-65 77-33',gold,5);ell(77,-29,4,5,gold);p('M74-24 L70-7 Q77-3 83-7 L80-24Z',gold,ink,3);
// full tassel and highlighted mortarboard
p('M29-64 Q38-66 42-59 L48-60 Q53-54 60-54 L66-45 L53-48 L46-44 L38-52 L32-52Z','#f8bf22',ink,2);
line('M35-62 L40-55 M47-57 L53-49 M76-23 L75-10 M79-23 L80-10','#ffe38b',2);
// open Bible with pages, cover and cross
p('M36 75 Q55 54 76 69 Q94 53 111 62 L99 119 L65 126 L32 109Z','#152945');p('M38 72 Q55 59 75 74 Q94 60 108 64 L102 73 Q91 66 75 82 Q55 67 39 81Z','#f4edda',ink,3);p('M38 81 L75 87 L108 74 L100 119 L65 130 L31 112Z','#203955');line('M74 86 L65 128','#0e182b',4);line('M91 87 L86 110 M80 97 L98 93',gold,4);line('M45 88 L41 108',gold,3);p('M68 125 Q68 116 74 115 Q79 115 78 123 L81 119 Q82 107 88 109 Q93 111 89 124 Q96 116 99 123 Q99 132 87 138 Q78 144 66 136Z',skin);
line('M41 76 Q57 66 74 79 M78 77 Q91 66 103 68','#b7ae95',1.2);
line('M44 73 Q59 65 73 76 M79 74 Q92 64 103 66','#b7ae95',1);
line('M34 110 L64 122 L98 114','#456084',2);
}else{
// cape and navy suit
p('M-41 58 L-86 176 Q-53 189-35 178 L48 178 L30 60Z','#1b3157');p('M-80 168 L-45 177 L-41 187 L-84 179Z',gold);p('M35 79 L57 172 L42 182 L26 87Z',gold);
p('M-32 144 L-37 190 L-5 193 L6 158 L17 192 L45 190 L34 142Z','#182940');ctx.save();ctx.translate(0,step);p('M-37 188 Q-54 191-47 202 L-6 200 L-4 190Z','#282522');ctx.restore();ctx.save();ctx.translate(0,-step);p('M18 189 L18 200 L57 201 Q62 192 43 187Z','#282522');
ctx.restore();p('M-39 64 Q-5 47 30 63 L45 130 L31 153 L6 143 L-20 154 L-45 129Z','#243a59');p('M-20 60 L3 94 L24 60Z','#f2f0e8');p('M2 73 L9 81 L6 101 L-3 91 L-4 81Z','#224c80');p('M-26 61 L-14 101 L1 94 L-6 113 L-27 147 L-41 126Z','#192b46');p('M26 61 L14 98 L4 94 L8 116 L29 147 L39 127Z','#17253b');
p('M-41 68 Q-56 68-58 85 L-61 135 L-31 137 L-26 87Z','#263d5e');p('M-57 135 L-56 146 Q-55 159-43 159 Q-37 166-33 156 Q-23 161-24 151 L-26 138Z',skin);
p('M31 72 Q43 68 49 84 L59 107 L81 99 L88 121 Q62 144 44 125 L32 107Z','#213653');
// tailored suit planes and cape folds
p('M-46 92 L-53 129 L-36 130 L-30 98Z','#314c75','',0);
p('M-74 162 L-60 113 L-49 100 L-60 170Z','#314c77','',0);
line('M-75 171 L-48 179','#ffe16b',2);
p('M-21 150 L-28 182 L-13 183 L0 154Z','#304763','',0);
p('M17 155 L23 181 L37 181 L31 152Z','#101f33','',0);
line('M-19 116 L-27 141 M16 118 L29 143','#486080',2);
ell(4,127,1.6,1.6,'#b3a073','',0);
// neck and head
p('M-17 52 L-15 64 Q3 77 21 58 L19 43Z',skin);p('M-33-25 Q-17-49 18-33 Q42-26 43 1 L44 33 Q40 54 15 57 L-13 54 Q-36 45-37 20Z',skin);p('M27-27 Q42-24 44-7 L35-17Z','#172337');ell(-33,26,12,14,skin);line('M-38 23 Q-30 18-29 31','#df985d',3);
// swept silver hair
p('M-40 24 Q-61-5-41-26 Q-43-52-4-60 Q31-67 40-44 Q45-34 30-31 Q8-13-14-19 Q-8-7-19 5 L-19 24 L-28 22 Q-35 10-40 24Z','#b8b6ad');p('M-38-26 Q-27-53 13-54 Q31-56 35-45 Q10-36-14-32 Q-29-28-38-26Z','#e4dfcf','',0);p('M-14-32 Q4-36 25-48 L8-30 Q-5-21-22-22Z','#8f908d','',0);line('M-47-7 L-31-18 M-42 2 L-24-8','#ded9cb',4);
line('M-8 3 L7 5 M24 4 L36 1',ink,5);ell(2,15,3,7,ink,'',0);ell(32,14,3,7,ink,'',0);line('M15 37 L28 36',ink,2.5);
// face planes and layered silver hair
p('M33-14 Q41 2 40 28 Q39 44 23 49 L9 50 L16 55 Q43 53 44 33 L43 1Z','#e6a163','',0);
line('M-38 22 Q-33 17-28 24','#f3bb7e',2);
p('M-42-23 Q-34-38-19-41 L-30-25 L-43-14Z','#d7d3c5','',0);
p('M-27-37 Q-8-50 11-52 L-6-42 L-16-34Z','#fff7e4','',0);
line('M-38-8 Q-30-18-20-20 M-43 3 Q-33-8-24-11','#8b8d89',2);
// ceremonial gold chain
line('M-36 63 Q-21 90 5 102 Q28 94 35 65',gold,7);for(let i=0;i<9;i++){let t=i/8;ell(-33+67*t,66+34*Math.sin(t*Math.PI),2.2,3,'#ffdb54','',0)}ell(5,106,14,15,gold,ink,2);ell(5,106,9,10,'#f4c32b','#b88414',2);
ell(1,102,5,8,'#ffe577','',0);
ctx.save(); ctx.translate(80, 120); ctx.rotate(attack * 0.18); ctx.translate(-80, -120);
// staff with crowned round university seal
p('M79 57 L88 58 L79 193 Q75 203 68 194Z',gold,ink,4);line('M82 64 L73 187','#ffe172',2);p('M69 61 L89 63 L91 52 L71 49Z',gold);
p('M66-5 L62-14 L70-13 L73-23 L80-18 L87-31 L94-19 L103-22 L105-13 L114-11 L111-1 L118 3 L112 11Z',gold);
ell(88,17,29,33,gold);ell(88,17,24,27,'#1d3d67','#b37c0c',3);line('M74 5 L103 8 M76 11 L101 14 M78 32 L99 35',gold,4);line('M81 16 L79 29 M89 17 L87 30 M97 18 L95 31',gold,3);
p('M80 100 Q71 95 65 99 Q60 103 64 108 Q59 113 64 117 Q60 122 65 126 Q62 132 70 133 L81 132 Q91 127 89 112 Q88 105 80 100Z',skin);
ctx.restore();
}

  if (o.stunned) {
    ctx.fillStyle = skin; ctx.fillRect(-5,0,10,20); ctx.fillRect(21,0,14,20);
    line('M-3 3 L4 15 M4 3 L-3 15 M24 3 L31 15 M31 3 L24 15',ink,3);
  }
  ctx.restore();
}

export function drawUnit(ctx: CanvasRenderingContext2D, x: number, y: number, type: UnitType, o: UnitDrawOpts, enemy = false): void {
  const rawContext = ctx;
  const themeTier = troopThemeTier(type, o.level ?? 1);
  if (themeTier !== null) ctx = troopThematicContext(ctx, themeTier, type);

  if (type === 'goteam') return drawVan(ctx, x, y, o);
  if (type === 'rock' || type === 'pebble') return drawRock(rawContext, x, y, o, type === 'pebble');
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

  if ((['prof', 'president'] as UnitType[]).includes(type)) {
    drawRefinedHero(ctx, type as 'prof' | 'president', o, lv);
  } else {
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
  }
  ctx = rawContext; // Keep defender markings and status overlays in their original colors.
  if (enemy) {
    const hy = type === 'prof' ? -29 : -26;
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


// Visual tier comes from existing unlock data, never from troop level alone.
function troopThemeTier(type: UnitType, level: number): number | null {
  if (type === 'prof' || type === 'president') return null;
  const L = Math.max(1, Math.floor(level));
  const dmc = (building: BuildingType, n: number): number => building === 'dmc' ? n : BUILDINGS[building].levels[Math.min(n, BUILDINGS[building].levels.length) - 1].dmc;
  if (type === 'fan') return Math.max(1, dmc('hive', L));
  const parent = type === 'gomember' ? 'goteam' : type === 'pebble' ? 'rock' : type;
  const def = TROOPS[parent as TroopType];
  const research = def.levels[Math.min(L, def.levels.length) - 1].libraryLevel;
  return Math.max(1, dmc(def.barracks, def.barracksLevel), research > 0 ? dmc('library', research) : 0);
}
const troopContextCache = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasRenderingContext2D>>();
const troopThemes=[
 {name:'Timber',body:'#a8713c',trim:'#c99a62',roof:'#a8713c',floor:'#c9b48a'},
 {name:'Brick',body:'#bf5a3f',trim:'#d97a5f',roof:'#bd5c43',floor:'#c3b5a1'},
 {name:'Dark brick + stone',body:'#a34a3a',trim:'#b8b2a7',roof:'#a34a3a',floor:'#b8b2a7'},
 {name:'Grey + silver',body:'#9aa0a8',trim:'#dfe3e8',roof:'#c4c9cf',floor:'#aeb4bb'},
 {name:'Gold',body:'#c9a13a',trim:'#f5c32c',roof:'#f5c32c',floor:'#b9aa7c'},
 {name:'Blue + gold',body:'#2e63b8',trim:'#f5c32c',roof:'#2e63b8',floor:'#a6adb6'},
 {name:'Navy + gold',body:'#1c3d7a',trim:'#f5c32c',roof:'#1c3d7a',floor:'#959eac'},
 {name:'Obsidian black',body:'#272c34',trim:'#525b68',roof:'#171b22',floor:'#454c57'}
];
type RGB=[number,number,number];
function rgb(s:string):RGB|null{
 if(s.startsWith('#')){let x=s.slice(1);if(x.length===3)x=x.split('').map(c=>c+c).join('');if(x.length!==6)return null;return [parseInt(x.slice(0,2),16),parseInt(x.slice(2,4),16),parseInt(x.slice(4,6),16)];}
 let m=s.match(/^rgb\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)\s*\)$/);return m?[+m[1],+m[2],+m[3]]:null;
}
function output(v:RGB){return `rgb(${v.map(n=>Math.max(0,Math.min(255,Math.round(n)))).join(',')})`;}
function shaded(target:string, n:number){const v=rgb(target)!;return output(v.map(x=>n>=0?x+(255-x)*n:x*(1+n)) as RGB);}
const materials:[string,string][]=[
 ['#bf5a3f','body'],['#93402c','body'],['#c87952','body'],['#ce8050','body'],['#b98652','body'],['#a8713c','body'],
 ['#b8b2a7','body'],['#8f897e','body'],['#f1e4c6','trim'],['#f8f0dc','trim'],['#f4efe4','trim'],['#f5c32c','trim'],['#c9971a','trim'],
 ['#2e63b8','roof'],['#1c3d7a','roof'],['#4f5262','roof'],['#53657d','roof'],['#272d39','roof'],
 ['#d9d2c3','floor'],['#e6dfd0','floor'],['#c9b48a','floor']
];
function troopThematicContext(ctx: CanvasRenderingContext2D,tier:number,type:string): CanvasRenderingContext2D{
 const key=type+':'+tier;
 let contexts=troopContextCache.get(ctx);
 if(!contexts){contexts=new Map();troopContextCache.set(ctx,contexts);}
 const existing=contexts.get(key);if(existing)return existing;
 const t:any=troopThemes[tier-1];
 const cache=new Map();
 const natural=new Set(['#ffe7a2','#edb864','#f2c87f','#f2c49b','#e8b890','#5a3a1e','#2a1d14','#8a5a2b','#654120','#1a1410','#3a2a1a','#7a4a22','#4a3020','#a66a36','#fff','#ffffff']);
 if(type==='runner'){natural.add('#ffd23f');natural.add('#f5c32c');}
 if(type==='business'){natural.add('#19191c');natural.add('#29292d');natural.add('#46464b');}
 const recolor=(s:any)=>{
  if(typeof s!=='string')return s;if(natural.has(s.toLowerCase()))return s;if(cache.has(s))return cache.get(s);
  const v=rgb(s);if(!v)return s;
  const [r,g,b]=v,hi=Math.max(...v),lo=Math.min(...v),sat=hi-lo;
  // Leave ink, transparency, vegetation, water/glass, warm lamps and skin readable.
  if(s.toLowerCase()==='#1e1b2b'||hi<42)return s;
  if(g>r*1.13&&g>b*1.05)return s;
  if(b>r*1.16&&g>r*1.12&&g>b*.66&&hi>130)return tier===8&&type==='ssc'?'#465765':s;
  if(r>225&&g>175&&g<220&&b>135&&b<185)return s;
  if(['#ffd870','#ffe9a8','#ffd877','#ffe6a0'].includes(s.toLowerCase()))return s;
  if(type==='lake'&&(b>r||g>r))return s;
  // Closely match source materials, including their normal shaded variants.
  let best=Infinity,role='body',amount=0;
  for(const [hex,k]of materials){const src=rgb(hex)!;for(const a of [-.4,-.3,-.25,-.2,-.18,-.15,-.12,-.1,0,.08,.12,.18,.2,.25]){
   const candidate=src.map(x=>a>=0?x+(255-x)*a:x*(1+a));const e=candidate.reduce((p,x,j)=>p+(x-v[j])**2,0);
   if(e<best){best=e;role=k;amount=a;}
  }}
  let result;
  if(best<300) result=shaded(t[role],amount);
  else if(r>g*1.2&&r>b*1.2) result=shaded(t.body,(hi-170)/600);
  else if(b>r*1.05&&b>g*.95)result=shaded(t.roof,(hi-120)/700);
  else if(sat<38){
   const lum=(r+g+b)/3;result=shaded(lum>205?t.trim:lum>135?t.floor:lum>75?t.body:t.roof,(lum>205?(lum-230)/800:(lum-130)/1000));
  }else if(r>g&&g>b)result=shaded(hi>210?t.trim:t.body,(hi-180)/700);
  else result=tier===8?shaded(t.body,(hi-130)/850):shaded(t.roof,(hi-130)/850);
  // Keep native clothing/material character; use tier colors as a softer overlay.
  const target=rgb(result)!;
  const strength=role==='trim'?.90:role==='roof'?.82:.72;
  const base=tier===8?v.map(n=>n*.45):v;
  result=output(target.map((n,i)=>n*strength+base[i]*(1-strength)) as RGB);
  cache.set(s,result);return result;
 };
 const proxy = new Proxy(ctx as any,{
  set(obj,key,val){obj[key]=(key==='fillStyle'||key==='strokeStyle')?recolor(val):val;return true;},
  get(obj,key){if(key==='createLinearGradient'||key==='createRadialGradient')return (...args:any[])=>{const gradient=obj[key](...args);const add=gradient.addColorStop.bind(gradient);gradient.addColorStop=(p:number,c:string)=>add(p,recolor(c));return gradient;};if(key==='fillText')return (...args:any[])=>{const c=obj.fillStyle; obj.fillStyle=type==='runner'?'#1e1b2b':tier===8?'#bcc5d1':(tier===1||tier===4||tier===5)?'#1e1b2b':'#f4efe4';obj.fillText(...args);obj.fillStyle=c;};const v=obj[key];return typeof v==='function'?v.bind(obj):v;}
 }) as CanvasRenderingContext2D;
 contexts.set(key,proxy);return proxy;
}
