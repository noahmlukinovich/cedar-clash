// Unit behaviours: targeting, pathing, movement, melee, healing, crowd separation.
import { GRID } from '../../config/balance';
import { TROOPS } from '../../config/troops';
import type { TroopType } from '../../config/types';
import { dist, distToRect } from '../../core/iso';
import { findPath } from '../pathfind';
import { nearestAttacker } from './defenses';
import type { RaidSim } from './sim';
import type { RB, RU } from './types';

function pickTarget(sim: RaidSim, u: RU): RB | null {
  const pref = u.hero || u.type === 'fan' ? 'any' : TROOPS[u.type as TroopType].prefers;
  const choose = (filter: (b: RB) => boolean): RB | null => {
    let best: RB | null = null;
    let bd = Infinity;
    for (const b of sim.buildings) {
      if (b.dead || b.isTrap || b.type === 'lake' || !filter(b)) continue;
      const d = distToRect(u.x, u.y, b.x, b.y, b.size, b.size);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  };
  if (pref === 'defense') return choose((b) => b.isDefense) ?? choose((b) => !b.isWall);
  if (pref === 'wall') {
    // nearest wall that stands between us and the nearest non-wall building
    const goal = choose((b) => !b.isWall);
    if (!goal) return choose((b) => b.isWall);
    const reach = dist(u.x, u.y, goal.cx, goal.cy) + 2;
    let best: RB | null = null;
    let bd = Infinity;
    for (const b of sim.walls) {
      if (b.dead) continue;
      const d2 = dist(b.cx, b.cy, goal.cx, goal.cy);
      const score = dist(u.x, u.y, b.cx, b.cy) + d2 * 0.8;
      if (score < bd && d2 < reach) {
        bd = score;
        best = b;
      }
    }
    return best ?? goal;
  }
  return choose((b) => !b.isWall);
}

export function updateAttacker(sim: RaidSim, u: RU, dt: number): void {
  const sp = u.speed * sim.mulSpeed(u);
  // engage nearby defenders first
  if (!u.tu || u.tu.dead) {
    u.tu = null;
    if (sim.defendersAlive > 0) {
      const reach = 2.2 + u.range;
      let bd = Infinity;
      sim.grid.forEachNear(u.x, u.y, reach, (o) => {
        if (o.side !== 'def') return;
        const d = dist(o.x, o.y, u.x, u.y);
        if (d < reach && (d < bd || (d === bd && u.tu && o.uid < u.tu.uid))) {
          bd = d;
          u.tu = o;
        }
      });
    }
  }
  if (u.type === 'nurse') return updateHealer(sim, u, dt, sp);
  if (u.tu) {
    fightUnit(sim, u, u.tu, dt, sp);
    if (u.tu?.dead) {
      u.tu = null;
      u.needsPath = true;
    }
    return;
  }
  // Freshmen get lost
  if (u.wanderUntil > sim.time) {
    const nx = u.x + u.wdx * sp * 0.6 * dt;
    const ny = u.y + u.wdy * sp * 0.6 * dt;
    if (sim.walkable(nx, ny)) {
      u.x = nx;
      u.y = ny;
      u.moving = true;
      u.face = u.wdx - u.wdy >= 0 ? 1 : -1;
    }
    return;
  }
  if (!u.tb || u.tb.dead) {
    u.tb = pickTarget(sim, u);
    u.needsPath = true;
    if (!u.tb) {
      u.idleT += dt;
      return;
    }
    if (u.type === 'freshman' && sim.rng.next() < 0.18) {
      u.wanderUntil = sim.time + 1.2 + sim.rng.next();
      const a = sim.rng.next() * Math.PI * 2;
      u.wdx = Math.cos(a);
      u.wdy = Math.sin(a);
      sim.events.push({ e: 'wander', u });
      return;
    }
  }
  const tgt = u.wall ?? u.tb;
  if (distToRect(u.x, u.y, tgt.x, tgt.y, tgt.size, tgt.size) <= u.range + 0.15) {
    attackBuilding(sim, u, tgt, dt);
    return;
  }
  if (u.needsPath) {
    if (sim.pathBudget <= 0) return;
    computePath(sim, u);
  }
  followPath(sim, u, dt, sp);
}

function computePath(sim: RaidSim, u: RU): void {
  u.needsPath = false;
  u.wall = null;
  const t = u.tb;
  if (!t) return;
  const range = Math.max(0.5, u.range - 0.2);
  const start = Math.min(GRID - 1, Math.max(0, Math.floor(u.y))) * GRID + Math.min(GRID - 1, Math.max(0, Math.floor(u.x)));
  // Troops deployed in a clump share a start tile and a target, so share the search too.
  const key = `${start}:${t.uid}:${range}`;
  let p = sim.pathCache.get(key);
  if (p === undefined) {
    sim.pathBudget--;
    p = findPath(sim.cost, start % GRID, (start / GRID) | 0, { x: t.x, y: t.y, w: t.size, h: t.size }, range) ?? [];
    sim.pathCache.set(key, p);
  }
  u.path = p; // shared and never mutated in place
  u.pathI = 0;
  // does the path go through a wall? then attack that wall first
  for (let i = 0; i < p.length; i++) {
    const b = sim.tileB[p[i]];
    if (b && b.isWall && !b.dead) {
      u.wall = b;
      u.path = p.slice(0, i);
      break;
    }
  }
}

function followPath(sim: RaidSim, u: RU, dt: number, sp: number): void {
  if (u.pathI >= u.path.length) {
    // reached end of path but not in range: walk straight at target
    const t = u.wall ?? u.tb;
    if (!t) return;
    const tx = Math.max(t.x, Math.min(t.x + t.size, u.x));
    const ty = Math.max(t.y, Math.min(t.y + t.size, u.y));
    stepToward(u, tx, ty, sp * dt);
    u.idleT += dt;
    if (u.idleT > 1.5) {
      u.idleT = 0;
      u.needsPath = true;
    }
    return;
  }
  const idx = u.path[u.pathI];
  const tx = (idx % GRID) + 0.5;
  const ty = Math.floor(idx / GRID) + 0.5;
  if (dist(u.x, u.y, tx, ty) < 0.15) {
    u.pathI++;
    return;
  }
  stepToward(u, tx, ty, sp * dt);
}

function face(u: RU, dx: number, dy: number): void {
  const sx = dx - dy; // screen-space x direction
  if (Math.abs(sx) > 0.01) u.face = sx > 0 ? 1 : -1;
}

function stepToward(u: RU, tx: number, ty: number, step: number): void {
  const dx = tx - u.x;
  const dy = ty - u.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.001) return;
  const k = Math.min(step, d) / d;
  u.x += dx * k;
  u.y += dy * k;
  u.moving = true;
  face(u, dx, dy);
}

function attackBuilding(sim: RaidSim, u: RU, b: RB, dt: number): void {
  u.idleT = 0;
  face(u, b.cx - u.x, b.cy - u.y);
  u.cd -= dt;
  if (u.cd > 0) return;
  u.cd = u.rate;
  u.attackT = 1;
  let dmg = u.dps * u.rate * sim.mulDmg(u);
  if (b.isWall && u.type === 'engineer') dmg *= TROOPS.engineer.wallMul ?? 1;
  if (u.hero === 'prof' || (u.range > 1.5 && u.type !== 'nurse')) {
    // ranged: red pen / thrown book (visual only, damage applies instantly)
    sim.events.push({ e: 'hit', x: b.cx, y: b.cy, dmg, kind: 'pen' });
  } else {
    sim.events.push({ e: 'hit', x: (u.x + b.cx) / 2, y: (u.y + b.cy) / 2, dmg, kind: 'melee' });
  }
  sim.damageBuilding(b, dmg, u);
}

function fightUnit(sim: RaidSim, u: RU, o: RU, dt: number, sp: number): void {
  if (dist(u.x, u.y, o.x, o.y) > u.range + 0.3) {
    stepToward(u, o.x, o.y, sp * dt);
    return;
  }
  face(u, o.x - u.x, o.y - u.y);
  u.cd -= dt;
  if (u.cd > 0) return;
  u.cd = u.rate;
  u.attackT = 1;
  sim.damageUnit(o, u.dps * u.rate * (u.side === 'atk' ? sim.mulDmg(u) : 1), 'melee');
}

function updateHealer(sim: RaidSim, u: RU, dt: number, sp: number): void {
  const d = TROOPS.nurse;
  const healPerSec = u.dps; // nurses use dps as heal/sec
  // find most hurt ally nearby, else follow nearest ally
  let best: RU | null = null;
  let bestScore = Infinity;
  for (const o of sim.units) {
    if (o.dead || o.side !== 'atk' || o === u || o.type === 'nurse') continue;
    const score = dist(o.x, o.y, u.x, u.y) + (o.hp / o.maxHp) * 6;
    if (score < bestScore) {
      bestScore = score;
      best = o;
    }
  }
  if (!best) return;
  if (dist(best.x, best.y, u.x, u.y) > 1.6) stepToward(u, best.x, best.y, sp * dt);
  u.cd -= dt;
  if (u.cd > 0) return;
  u.cd = 1;
  const r = d.healRadius ?? 2;
  const bx = best.x;
  const by = best.y;
  let healed = false;
  sim.grid.forEachNear(bx, by, r, (o) => {
    if (o.side !== 'atk' || o.type === 'nurse' || o.hp >= o.maxHp || dist(o.x, o.y, bx, by) > r) return;
    o.hp = Math.min(o.maxHp, o.hp + healPerSec);
    healed = true;
    sim.events.push({ e: 'heal', u: o });
  });
  if (healed) u.attackT = 1;
}

export function updateDefender(sim: RaidSim, u: RU, dt: number): void {
  if (!u.tu || u.tu.dead) u.tu = nearestAttacker(sim, u.x, u.y, 14);
  if (!u.tu) return;
  fightUnit(sim, u, u.tu, dt, u.speed);
}

const MIN_GAP = 0.38;

/** Push overlapping units apart so a crowd doesn't collapse onto one tile. */
export function separate(sim: RaidSim, dt: number): void {
  const k = 0.5 * Math.min(1, dt * 8);
  for (const a of sim.units) {
    if (a.dead) continue;
    sim.grid.forEachNear(a.x, a.y, MIN_GAP, (b) => {
      if (b.uid <= a.uid) return; // each pair once
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= 0 || d2 >= MIN_GAP * MIN_GAP) return;
      const d = Math.sqrt(d2);
      const push = ((MIN_GAP - d) / d) * k;
      const ax = a.x - dx * push;
      const ay = a.y - dy * push;
      const bx = b.x + dx * push;
      const by = b.y + dy * push;
      if (sim.walkable(ax, ay)) {
        a.x = ax;
        a.y = ay;
      }
      if (sim.walkable(bx, by)) {
        b.x = bx;
        b.y = by;
      }
    });
  }
}
