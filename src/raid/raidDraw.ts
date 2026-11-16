// Renders a raid: ground, deploy zone, spell zones, depth-sorted buildings and units,
// projectiles, beams and health bars.
import { STINGER_TIP_Z } from '../render/buildingSprites';
import { GRID } from '../config/balance';
import { TROOPS } from '../config/troops';
import type { TroopType } from '../config/types';
import { toWorld } from '../core/iso';
import { C, OUT, P, poly } from '../render/draw';
import { drawUnit } from '../render/unitSprites';
import { drawBar, drawBuildingAt, drawGround, drawLabel, drawTree } from '../render/world';
import { beamStage } from './sim';
import type { Archetype } from './basegen';
import type { RaidScene } from './raidScene';


export interface Beam {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  t: number;
  color: string;
}

export interface Grave {
  x: number;
  y: number;
  t: number;
}


/** A faint wash over the grass so different kinds of rival campus read differently at a glance. */
const LAYOUT_TINT: Record<Archetype, string | undefined> = {
  fortress: undefined,
  compartments: 'rgba(150,120,200,0.07)',
  sprawl: 'rgba(215,190,120,0.09)',
  lakeside: 'rgba(90,170,230,0.08)',
  corner: 'rgba(60,110,70,0.10)',
  donut: 'rgba(230,150,90,0.07)',
};

function groundTint(sc: RaidScene): string | undefined {
  if (sc.kind === 'elephant') return 'rgba(255,200,120,0.08)';
  return sc.base.archetype && !sc.setup.defender ? LAYOUT_TINT[sc.base.archetype] : undefined;
}

export function drawRaid(ctx: CanvasRenderingContext2D, dpr: number, sc: RaidScene): void {
  const sim = sc.sim;
  const t = sc.time;
  sc.cam.apply(ctx, dpr);
  drawGround(ctx, { border: 0, grid: false, tint: groundTint(sc) });

  // deploy zone overlay
  const c = sc.cards[sc.sel];
  if (!sc.ended && c && c.kind !== 'spell') {
    const a = 0.12 + sc.forbidFlash * 0.35;
    ctx.save();
    ctx.transform(32, 16, -32, 16, 0, 0);
    ctx.fillStyle = sc.forbidFlash > 0 ? `rgba(255,70,70,${a})` : `rgba(255,255,255,${a})`;
    if (!sc.forbidPath) {
      sc.forbidPath = new Path2D();
      for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) if (sim.forbid[y * GRID + x]) sc.forbidPath.rect(x, y, 1, 1);
    }
    ctx.fill(sc.forbidPath);
    ctx.restore();
  }

  // zones on ground
  for (const z of sim.zones) {
    const p = toWorld(z.x, z.y);
    const life = (sim.time - z.start) / Math.max(0.01, z.until - z.start);
    let col = 'rgba(255,255,255,0.2)';
    if (z.kind === 'allnighter') col = `rgba(255,79,163,${0.22 + Math.sin(t * 10) * 0.06})`;
    else if (z.kind === 'snowday') col = 'rgba(160,220,255,0.28)';
    else if (z.kind === 'announcement') col = `rgba(255,216,74,${0.2 + Math.sin(t * 6) * 0.05})`;
    else if (z.kind === 'swarm') col = 'rgba(255,200,0,0.12)';
    else if (z.kind === 'quiz') col = `rgba(255,255,255,${0.5 * (1 - life)})`;
    else if (z.kind === 'convo') col = `rgba(245,195,44,${0.4 * (1 - life)})`;
    const rr = z.kind === 'quiz' || z.kind === 'convo' ? z.r * Math.min(1, life * 3) : z.r;
    ctx.fillStyle = col;
    ctx.strokeStyle = col.replace(/[\d.]+\)$/, '0.9)');
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rr * 45.25, rr * 22.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  const vis = (gx: number, gy: number, m = 150): boolean => {
    const w = toWorld(gx, gy);
    return sc.cam.visible(w.x, w.y, m);
  };
  type D = { depth: number; fn: () => void };
  const list: D[] = [];
  const walls = new Set<number>();
  for (const b of sim.buildings) if (b.isWall && !b.dead) walls.add(b.y * GRID + b.x);
  for (const b of sim.buildings) {
    if (b.hidden || !vis(b.cx, b.cy, 220)) continue;
    if (b.dead) {
      if (b.isTrap) continue;
      list.push({ depth: b.x + b.y + b.size - 0.5, fn: () => drawRubble(ctx, b.x, b.y, b.size, b.isWall) });
      continue;
    }
    let variant = 0;
    if (b.isWall) {
      if (walls.has(b.y * GRID + b.x + 1)) variant |= 1;
      if (walls.has((b.y + 1) * GRID + b.x)) variant |= 2;
    }
    const fill = b.type === 'registrar' ? 1 - b.lootTaken.tuition / Math.max(1, b.loot.tuition) : b.type === 'rinnova' ? 1 - b.lootTaken.coffee / Math.max(1, b.loot.coffee) : b.type === 'admissions' || b.type === 'coffeecart' ? 0.5 : undefined;
    list.push({
      depth: b.x + b.y + b.size,
      fn: () => {
        drawBuildingAt(ctx, {
          type: b.type,
          level: b.level,
          x: b.x,
          y: b.y,
          variant,
          t,
          fill,
          aim: b.aim,
          firing: b.firing,
          charge: b.charge,
          praying: b.prayT > 0 ? 1 : 0,
          squash: b.hitT > 0 ? 0.25 : 0,
          frozen: b.frozenUntil > sim.time,
          stunned: b.stunUntil > sim.time,
        });
      },
    });
  }
  for (const tr of sc.trees) if (vis(tr.x, tr.y)) list.push({ depth: tr.x + tr.y, fn: () => drawTree(ctx, tr) });
  for (const g of sc.graves) {
    list.push({ depth: g.x + g.y - 0.1, fn: () => drawGrave(ctx, g) });
  }
  // elephant run hand-holding lines
  if (sc.kind === 'elephant') {
    list.push({
      depth: -1000,
      fn: () => {
        ctx.strokeStyle = C.skin;
        ctx.lineWidth = 3;
        for (const u of sim.units) {
          if (!u.elephant || u.dead || !u.leader || u.leader.dead) continue;
          const a = toWorld(u.x, u.y);
          const b = toWorld(u.leader.x, u.leader.y);
          if (Math.hypot(a.x - b.x, a.y - b.y) > 120) continue;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y - 12);
          ctx.lineTo(b.x, b.y - 12);
          ctx.stroke();
        }
      },
    });
  }
  for (const u of sim.units) {
    if (u.dead || !vis(u.x, u.y, 80)) continue;
    list.push({
      depth: u.x + u.y,
      fn: () => {
        const p = toWorld(u.x, u.y);
        const scale = (u.hero ? 1.35 : u.type === 'fan' ? 0.9 : u.type === 'gomember' ? 0.95 : TROOPS[u.type as TroopType]?.size ?? 1) * 0.9;
        // glow rings for buffs
        if (u.rageUntil > sim.time || u.convoUntil > sim.time) {
          ctx.strokeStyle = u.convoUntil > sim.time ? 'rgba(245,195,44,0.9)' : 'rgba(255,79,163,0.9)';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, 11 * scale, 5.5 * scale, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (u.type === 'theology') {
          ctx.fillStyle = `rgba(180,120,255,${0.08 + Math.sin(t * 3) * 0.03})`;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, 3 * 45, 3 * 22.6, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        drawUnit(ctx, p.x, p.y, u.type, {
          t: u.t,
          facing: u.face,
          moving: u.moving,
          attacking: u.attackT,
          scale,
          frozen: u.frozenUntil > sim.time,
          flash: u.flash,
          stunned: u.stunUntil > sim.time,
          level: u.level,
        }, u.side === 'def');
        // level pips under the feet, so a troop's level reads in a crowd (heroes show a label instead)
        if (!u.hero && u.level >= 2) {
          const n = Math.min(5, u.level);
          const gap = 4.2 * scale;
          ctx.lineWidth = 1;
          ctx.strokeStyle = OUT;
          ctx.fillStyle = u.side === 'atk' ? C.gold : '#ff8a7a';
          for (let i = 0; i < n; i++) {
            const px = p.x + (i - (n - 1) / 2) * gap;
            const py = p.y + 6 * scale;
            ctx.beginPath();
            ctx.moveTo(px, py - 2.2 * scale);
            ctx.lineTo(px + 1.9 * scale, py);
            ctx.lineTo(px, py + 2.2 * scale);
            ctx.lineTo(px - 1.9 * scale, py);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          }
        }
        if (u.pairedUntil > sim.time && Math.sin(t * 3 + u.uid) > 0.95) {
          sc.particles.add({ kind: 'heart', x: p.x, y: p.y, z: 34, vz: 30, max: 0.8, size: 12, color: '#ff6fa8' });
        }
        if (u.hp < u.maxHp) drawBar(ctx, p.x, p.y - 44 * scale, u.hero ? 34 : 22, u.hp / u.maxHp, u.side === 'atk' ? '#5ad05a' : '#ff5a4a');
        if (u.hero) drawLabel(ctx, p.x, p.y - 52 * scale, `Lv${u.level}`, C.gold, 10);
      },
    });
  }
  list.sort((a, b) => a.depth - b.depth);
  for (const d of list) d.fn();

  // projectiles
  for (const pr of sim.projectiles) {
    const p = toWorld(pr.x, pr.y);
    const y = p.y - pr.z;
    ctx.save();
    ctx.translate(p.x, y);
    ctx.rotate(pr.t * 12);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = OUT;
    if (pr.kind === 'writeup') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(-4, -5, 8, 10);
      ctx.strokeRect(-4, -5, 8, 10);
      ctx.fillStyle = '#9aa';
      ctx.fillRect(-2, -2, 4, 1);
      ctx.fillRect(-2, 1, 4, 1);
    } else {
      ctx.fillStyle = '#ffd1e0';
      ctx.fillRect(-6, -3.5, 12, 7);
      ctx.strokeRect(-6, -3.5, 12, 7);
      ctx.fillStyle = C.red;
      ctx.fillRect(-4, -1, 5, 2);
    }
    ctx.restore();
  }
  // Hebrew letters from the Bible Prof's crossbow
  for (const l of sc.letters) {
    const k = Math.min(1, l.t);
    const a = toWorld(l.fx, l.fy);
    const b = toWorld(l.tx, l.ty);
    const x = a.x + (b.x - a.x) * k;
    const y = a.y - 26 + (b.y - 14 - (a.y - 26)) * k - Math.sin(k * Math.PI) * 10;
    const size = l.big ? 30 : 18;
    ctx.save();
    ctx.font = `900 ${size}px "Arial Hebrew", "Noto Sans Hebrew", "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = l.big ? 5 : 3.5;
    ctx.strokeStyle = OUT;
    ctx.strokeText(l.ch, x, y);
    ctx.fillStyle = l.big ? C.gold : '#fff6d6';
    ctx.fillText(l.ch, x, y);
    ctx.restore();
  }
  // beams
  for (const bm of sc.beams) {
    ctx.strokeStyle = bm.color;
    ctx.globalAlpha = Math.min(1, bm.t * 4);
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(bm.x1, bm.y1);
    ctx.lineTo(bm.x2, bm.y2);
    ctx.stroke();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // stinger statue beams
  for (const b of sim.buildings) {
    if (b.dead || b.type !== 'stinger' || !b.target || b.target.dead || !b.def) continue;
    const stage = beamStage(b.def, b.beamT);
    const from = toWorld(b.cx, b.cy);
    const to = toWorld(b.target.x, b.target.y);
    const x1 = from.x;
    const y1 = from.y - STINGER_TIP_Z;
    const x2 = to.x;
    const y2 = to.y - 12;
    const w = [3, 6, 10][Math.min(stage, 2)] * (0.85 + Math.random() * 0.3);
    ctx.save();
    ctx.lineCap = 'round';
    const line = (): void => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };
    ctx.strokeStyle = 'rgba(70,160,255,0.3)';
    ctx.lineWidth = w * 2.4;
    line();
    ctx.strokeStyle = '#4aa8ff';
    ctx.lineWidth = w;
    line();
    ctx.strokeStyle = '#eef8ff';
    ctx.lineWidth = Math.max(1.2, w * 0.4);
    line();
    // crackling strands once the beam is ramped up
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const nx = -(y2 - y1) / len;
    const ny = (x2 - x1) / len;
    ctx.strokeStyle = 'rgba(200,232,255,0.9)';
    ctx.lineWidth = 1.4;
    for (let s = 0; s < stage; s++) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      for (let i = 1; i < 7; i++) {
        const k = i / 7;
        const off = (Math.random() - 0.5) * (8 + stage * 5);
        ctx.lineTo(x1 + (x2 - x1) * k + nx * off, y1 + (y2 - y1) * k + ny * off);
      }
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    // impact glow
    const g = ctx.createRadialGradient(x2, y2, 1, x2, y2, w * 2.2 + 6);
    g.addColorStop(0, 'rgba(235,248,255,0.95)');
    g.addColorStop(1, 'rgba(70,160,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x2, y2, w * 2.2 + 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // building hp bars
  for (const b of sim.buildings) {
    if (b.dead || b.hidden || b.hp >= b.maxHp || b.type === 'lake') continue;
    const p = toWorld(b.cx, b.cy);
    drawBar(ctx, p.x, p.y - 30 - b.size * 20, b.isWall ? 24 : 50, b.hp / b.maxHp, '#ff9f2e');
  }
  // sprayer charge rings
  for (const b of sim.buildings) {
    if (b.dead || b.type !== 'sprayer') continue;
    const p = toWorld(b.cx, b.cy);
    if (b.charge > 0.7) {
      ctx.strokeStyle = `rgba(190,240,255,${(b.charge - 0.7) * 2})`;
      ctx.lineWidth = 2;
      const r = (b.def?.range ?? 5) * b.charge;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r * 45, r * 22.6, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  sc.particles.draw(ctx);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (sc.sim.windOn) {
    ctx.fillStyle = 'rgba(220,235,255,0.08)';
    ctx.fillRect(0, 0, sc.cam.width, sc.cam.height);
  }
  sc.particles.drawFlyers(ctx);
}

function drawRubble(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, wall: boolean): void {
  const c = toWorld(x + size / 2, y + size / 2);
  ctx.save();
  ctx.translate(c.x, c.y);
  const s = wall ? 0.35 : size / 2 - 0.3;
  poly(ctx, [P(-s, -s), P(s, -s), P(s, s), P(-s, s)], 'rgba(90,70,55,0.55)', false);
  if (!wall) {
    const n = size * 3;
    for (let i = 0; i < n; i++) {
      const u = (((i * 37) % 17) / 17 - 0.5) * s * 1.6;
      const v = (((i * 53) % 13) / 13 - 0.5) * s * 1.6;
      const [px, py] = P(u, v, 2);
      ctx.fillStyle = i % 3 === 0 ? '#8f897e' : i % 3 === 1 ? '#a34a3a' : '#6e665c';
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(px, py, 5 + (i % 4), 3 + (i % 3), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // smoke wisp
    ctx.fillStyle = 'rgba(80,80,80,0.18)';
    ctx.beginPath();
    ctx.arc(0, -12, 10, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawGrave(ctx: CanvasRenderingContext2D, g: Grave): void {
  const p = toWorld(g.x, g.y);
  const a = Math.max(0, 1 - g.t / 20);
  if (a <= 0) return;
  ctx.globalAlpha = a;
  ctx.fillStyle = '#b8b2a7';
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(p.x - 5, p.y);
  ctx.lineTo(p.x - 5, p.y - 9);
  ctx.arc(p.x, p.y - 9, 5, Math.PI, 0);
  ctx.lineTo(p.x + 5, p.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = OUT;
  ctx.font = 'bold 5px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('RIP', p.x, p.y - 6);
  ctx.globalAlpha = 1;
}
