// Unit behaviours: targeting, pathing, movement, attacks, healing, and crowd separation.
import { GRID } from '../../config/balance';
import { HEROES, TROOPS } from '../../config/troops';
import { dist, distToRect } from '../../core/iso';
import { findPath } from '../pathfind';
import { nearestAttacker } from './defenses';
import type { RaidSim } from './sim';
import { HEBREW_LETTERS, RESOURCE_TYPES, type RB, type RU, WANDER_DIRS } from './types';

function pickTarget(sim: RaidSim, u: RU): RB | null {
  const pref = u.def?.prefers ?? 'any';
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
  if (pref === 'resource') return choose((b) => RESOURCE_TYPES.includes(b.type)) ?? choose((b) => !b.isWall);
  if (pref === 'wall') {
    // nearest wall that stands between us and the nearest non-wall building
    const goal = choose((b) => !b.isWall);
    if (!goal) return choose((b) => b.isWall);
    let best: RB | null = null;
    let bd = Infinity;
    for (const b of sim.walls) {
      if (b.dead) continue;
      const d1 = dist(u.x, u.y, b.cx, b.cy);
      const d2 = dist(b.cx, b.cy, goal.cx, goal.cy);
      const score = d1 + d2 * 0.8;
      if (score < bd && d2 < dist(u.x, u.y, goal.cx, goal.cy) + 2) {
        bd = score;
        best = b;
      }
    }
    return best ?? goal;
  }
  return choose((b) => !b.isWall);
}

export function updateAttacker(sim: RaidSim, u: RU, dt: number): void {
  const j = u.def?.jumps;
  if (j && u.slowUntil > sim.time) u.runT = 0; // soaked by a Cedar Sprayer: momentum gone
  const sp = u.speed * sim.mulSpeed(u);
  // engage nearby defenders first (the earliest-spawned one in reach)
  if (!u.tu || u.tu.dead) {
    u.tu = null;
    const reach = 2.2 + u.range;
    for (const o of sim.grid.near(u.x, u.y, reach)) {
      if (o.side !== 'def') continue;
      if (dist(o.x, o.y, u.x, u.y) < reach) {
        u.tu = o;
        break;
      }
    }
  }
  if (u.type === 'nurse') return updateHealer(sim, u, dt, sp);
  if (u.tu && u.def?.unload) return sim.unloadVan(u); // fans in the way: everybody out
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
      const [wx, wy] = WANDER_DIRS[Math.floor(sim.rng.next() * WANDER_DIRS.length)];
      u.wdx = wx;
      u.wdy = wy;
      sim.events.push({ e: 'wander', u });
      return;
    }
  }
  const tgt = u.wall ?? u.tb;
  if (distToRect(u.x, u.y, tgt.x, tgt.y, tgt.size, tgt.size) <= u.range + 0.15) {
    if (u.def?.unload) return sim.unloadVan(u);
    attackBuilding(sim, u, tgt, dt);
    return;
  }
  if (j && u.slowUntil <= sim.time) u.runT += dt;
  if (u.needsPath) {
    if (sim.pathBudget <= 0) return;
    sim.pathBudget--;
    computePath(sim, u);
  }
  followPath(sim, u, dt, sp);
}

function computePath(sim: RaidSim, u: RU): void {
  u.needsPath = false;
  u.wall = null;
  const t = u.tb;
  if (!t) return;
  const jumps = !!u.def?.jumps;
  const range = Math.max(0.5, u.range - 0.2);
  const sx = Math.floor(u.x);
  const sy = Math.floor(u.y);
  // Troops deployed together share a start tile, a target and a range, so they share the
  // search too. The cache is cleared whenever the walkable map changes.
  const key = `${sx},${sy}:${t.uid}:${range}:${jumps ? 1 : 0}`;
  let p = sim.pathCache.get(key);
  if (p === undefined) {
    p = findPath(jumps ? sim.costJump : sim.cost, sx, sy, { x: t.x, y: t.y, w: t.size, h: t.size }, range) ?? [];
    sim.pathCache.set(key, p);
  }
  u.path = p; // shared between units: never modified in place
  u.pathI = 0;
  if (jumps) return; // walls are not in the way
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
    stepToward(sim, u, tx, ty, sp * dt, true);
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
  stepToward(sim, u, tx, ty, sp * dt, true);
}

function face(u: RU, dx: number, dy: number): void {
  const sxDir = dx - dy; // screen-space x direction
  if (Math.abs(sxDir) > 0.01) u.face = sxDir > 0 ? 1 : -1;
}

function stepToward(sim: RaidSim, u: RU, tx: number, ty: number, step: number, loose: boolean): void {
  const dx = tx - u.x;
  const dy = ty - u.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 0.001) return;
  const k = Math.min(step, d) / d;
  const nx = u.x + dx * k;
  const ny = u.y + dy * k;
  if (loose || u.side === 'def' || sim.walkable(nx, ny) || !sim.walkable(u.x, u.y)) {
    u.x = nx;
    u.y = ny;
  }
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
  const j = u.def?.jumps;
  if (j) {
    // the first hit after a run carries the momentum
    dmg *= 1 + Math.min(u.runT, j.maxRun) * j.dmg;
    u.runT = 0;
  }
  const ch = u.def?.chorus;
  u.hits++;
  if (ch && u.hits % ch.every === 0) {
    dmg *= ch.mul;
    sim.events.push({ e: 'chorus', x: b.cx, y: b.cy });
  }
  if (u.hero === 'prof') {
    dmg *= letterShot(sim, u, b.cx, b.cy);
  } else if (u.range > 1.5 && u.type !== 'nurse') {
    // ranged: thrown book (visual only, damage applies instantly)
    sim.events.push({ e: 'hit', x: b.cx, y: b.cy, dmg, kind: 'pen' });
  } else {
    sim.events.push({ e: 'hit', x: (u.x + b.cx) / 2, y: (u.y + b.cy) / 2, dmg, kind: 'melee' });
  }
  sim.damageBuilding(b, dmg, u);
}

function fightUnit(sim: RaidSim, u: RU, o: RU, dt: number, sp: number): void {
  if (dist(u.x, u.y, o.x, o.y) > u.range + 0.3) {
    stepToward(sim, u, o.x, o.y, sp * dt, true);
    return;
  }
  face(u, o.x - u.x, o.y - u.y);
  u.cd -= dt;
  if (u.cd > 0) return;
  u.cd = u.rate;
  u.attackT = 1;
  let dmg = u.dps * u.rate * (u.side === 'atk' ? sim.mulDmg(u) : 1);
  if (u.hero === 'prof') {
    u.hits++;
    dmg *= letterShot(sim, u, o.x, o.y);
  }
  sim.damageUnit(o, dmg, 'melee');
}

/**
 * The Bible Prof's crossbow. Shot number `u.hits` (already counted) fires the next Hebrew
 * letter; every Nth is a big one. Returns the damage multiplier. The flying letter is drawn
 * by the scene and damage still lands instantly, so raid timing is unchanged.
 */
function letterShot(sim: RaidSim, u: RU, tx: number, ty: number): number {
  const bolt = HEROES.prof.bolt;
  const big = !!bolt && u.hits % bolt.every === 0;
  sim.events.push({ e: 'bolt', fx: u.x, fy: u.y, tx, ty, n: (u.hits - 1) % HEBREW_LETTERS, big });
  return big ? bolt.mul : 1;
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
  if (dist(best.x, best.y, u.x, u.y) > 1.6) stepToward(sim, u, best.x, best.y, sp * dt, true);
  u.cd -= dt;
  if (u.cd > 0) return;
  u.cd = 1;
  const r = d.healRadius ?? 2;
  let healed = false;
  for (const o of sim.grid.near(best.x, best.y, r)) {
    if (o.side !== 'atk' || o.type === 'nurse') continue;
    if (dist(o.x, o.y, best.x, best.y) <= r && o.hp < o.maxHp) {
      o.hp = Math.min(o.maxHp, o.hp + healPerSec);
      healed = true;
      sim.events.push({ e: 'heal', u: o });
    }
  }
  if (healed) u.attackT = 1;
}

export function updateDefender(sim: RaidSim, u: RU, dt: number): void {
  if (!u.tu || u.tu.dead) u.tu = nearestAttacker(sim, u.x, u.y, 14);
  if (!u.tu) return;
  fightUnit(sim, u, u.tu, dt, u.speed);
}

const MIN_GAP = 0.38;

/** Push overlapping units apart so a crowd doesn't collapse onto one spot. */
export function separate(sim: RaidSim, dt: number): void {
  const k = 0.5 * Math.min(1, dt * 8);
  for (const a of sim.units) {
    if (a.dead) continue;
    for (const b of sim.grid.near(a.x, a.y, MIN_GAP)) {
      if (b.uid <= a.uid || b.dead) continue; // each pair once, in the same order as a full scan
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= 0 || d2 >= MIN_GAP * MIN_GAP) continue;
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
    }
  }
}
