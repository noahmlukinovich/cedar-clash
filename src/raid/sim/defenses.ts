// Defensive building behaviours: towers, the sprayer, the Bible Prof, traps, The Hive.
import { BUILDINGS } from '../../config/buildings';
import { dist, distToRect } from '../../core/iso';
import type { RaidSim } from './sim';
import type { RB, RU } from './types';

const rectDist = (u: RU, b: RB): number => distToRect(u.x, u.y, b.x, b.y, b.size, b.size);

/** Visit living attackers within `range` of building b's footprint. */
function attackersInRange(sim: RaidSim, b: RB, range: number, fn: (u: RU, d: number) => void): void {
  sim.grid.forEachInBox(b.x - range, b.y - range, b.x + b.size + range, b.y + b.size + range, (u) => {
    if (u.side !== 'atk') return;
    const d = rectDist(u, b);
    if (d <= range) fn(u, d);
  });
}

/** Nearest living attacker to a building's footprint (or to a point, if no building is given). */
export function nearestAttacker(sim: RaidSim, x: number, y: number, range: number, b?: RB): RU | null {
  let best: RU | null = null;
  let bd = Infinity;
  const consider = (u: RU, d: number): void => {
    if (d < bd || (d === bd && best && u.uid < best.uid)) {
      bd = d;
      best = u;
    }
  };
  if (b) attackersInRange(sim, b, range, consider);
  else
    sim.grid.forEachNear(x, y, range, (u) => {
      if (u.side !== 'atk') return;
      const d = dist(u.x, u.y, x, y);
      if (d <= range) consider(u, d);
    });
  return best;
}

export function updateShooter(sim: RaidSim, b: RB, dt: number): void {
  const d = b.def!;
  if (!b.target || b.target.dead || rectDist(b.target, b) > d.range) b.target = nearestAttacker(sim, b.cx, b.cy, d.range, b);
  b.cd -= dt;
  if (!b.target) return;
  b.aim = Math.atan2(b.target.y - b.cy, b.target.x - b.cx);
  if (b.cd > 0) return;
  b.cd = d.rate;
  b.firing = 1;
  const kind = b.type === 'ratower' ? 'writeup' : 'ticket';
  const dd = dist(b.cx, b.cy, b.target.x, b.target.y);
  const sz = b.type === 'ratower' ? 75 + b.level * 5 : 40;
  sim.projectiles.push({
    x: b.cx,
    y: b.cy,
    z: sz,
    sx: b.cx,
    sy: b.cy,
    sz,
    tx: b.target.x,
    ty: b.target.y,
    target: b.target,
    dmg: d.dps * d.rate,
    t: 0,
    dur: Math.max(0.12, dd / (d.projectileSpeed ?? 12)),
    kind,
  });
  sim.events.push({ e: 'shoot', b, kind });
}

export function updateSprayer(sim: RaidSim, b: RB, dt: number): void {
  const d = b.def!;
  const hit: RU[] = [];
  attackersInRange(sim, b, d.range, (u) => hit.push(u));
  for (const u of hit) {
    u.slowUntil = sim.time + 0.25;
    u.slowMul = 1 - (d.slow ?? 0.4);
    sim.damageUnit(u, d.dps * dt, 'spray', true);
  }
  b.charge = Math.min(1, b.charge + dt / (d.freezeCharge ?? 6));
  if (b.charge >= 1 && hit.length) {
    b.charge = 0;
    for (const u of hit) if (!u.dead) u.frozenUntil = sim.time + (d.freezeTime ?? 2);
    sim.events.push({ e: 'freeze', b });
  }
}

export function updateBibleProf(sim: RaidSim, b: RB, dt: number): void {
  const d = b.def!;
  // blessing: heal nearby walls
  if (d.blessHeal) {
    for (const w of sim.walls) {
      if (w.dead || w.hp >= w.maxHp) continue;
      if (dist(w.cx, w.cy, b.cx, b.cy) <= 4.5) {
        w.hp = Math.min(w.maxHp, w.hp + w.maxHp * d.blessHeal * dt);
        if (sim.rng.next() < dt * 2) sim.events.push({ e: 'bless', b: w });
      }
    }
  }
  b.cd -= dt;
  const r = d.splash ?? 1.5;
  if (b.prayT > 0) {
    b.prayT -= dt;
    if (b.prayT <= 0 && b.prayTarget) {
      const { x, y } = b.prayTarget;
      const hit: RU[] = [];
      sim.grid.forEachNear(x, y, r, (u) => {
        if (u.side === 'atk' && dist(u.x, u.y, x, y) <= r) hit.push(u);
      });
      for (const u of hit) sim.damageUnit(u, d.dps * d.rate, 'pray');
      sim.events.push({ e: 'pray', b, x, y, r });
      b.prayTarget = null;
    }
    return;
  }
  if (b.cd > 0) return;
  // pick the densest clump in range (frozen clumps are juicy)
  let best: RU | null = null;
  let bestScore = -1;
  attackersInRange(sim, b, d.range, (u) => {
    let score = 0;
    sim.grid.forEachNear(u.x, u.y, r, (o) => {
      if (o.side === 'atk' && dist(o.x, o.y, u.x, u.y) <= r) score += o.frozenUntil > sim.time ? 1.5 : 1;
    });
    if (score > bestScore || (score === bestScore && best && u.uid < best.uid)) {
      bestScore = score;
      best = u;
    }
  });
  const tgt = best as RU | null;
  if (tgt) {
    b.cd = d.rate;
    b.prayT = 0.45;
    b.prayTarget = { x: tgt.x, y: tgt.y };
    b.aim = Math.atan2(tgt.y - b.cy, tgt.x - b.cx);
  }
}

export function updateTrap(sim: RaidSim, b: RB): void {
  if (!b.hidden) return;
  let sprung = false;
  sim.grid.forEachNear(b.cx, b.cy, 1.2, (u) => {
    if (u.side === 'atk' && u.ignoreTrapsUntil <= sim.time && dist(u.x, u.y, b.cx, b.cy) < 1.2) sprung = true;
  });
  if (!sprung) return;
  const L = BUILDINGS.nest.levels[b.level - 1];
  b.hidden = false;
  b.dead = true;
  sim.zones.push({ kind: 'swarm', x: b.cx, y: b.cy, r: L.trapRadius ?? 2, until: sim.time + (L.trapDuration ?? 5), start: sim.time, dps: L.trapDps ?? 20 });
  sim.events.push({ e: 'swarm', x: b.cx, y: b.cy, r: L.trapRadius ?? 2 });
}

export function updateHive(sim: RaidSim, b: RB, dt: number): void {
  if (b.fansLeft <= 0) return;
  if (b.fanTimer > 0) {
    b.fanTimer -= dt;
    if (b.fanTimer <= 0) {
      sim.spawnFan(b);
      b.fansLeft--;
      if (b.fansLeft > 0) b.fanTimer = 0.35;
    }
    return;
  }
  if (nearestAttacker(sim, b.cx, b.cy, 7, b)) {
    b.fanTimer = 0.05;
    sim.events.push({ e: 'fans', b });
  }
}
