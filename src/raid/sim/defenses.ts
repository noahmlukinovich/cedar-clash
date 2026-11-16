// Defensive building behaviours: towers, the Cedar Sprayer, the Bible Prof Tower, the Stinger
// Statue, Yellow Jacket nests and The Hive.
import { BUILDINGS } from '../../config/buildings';
import { dist, distToRect } from '../../core/iso';
import type { RaidSim } from './sim';
import { type RB, type RU, beamStage } from './types';

const rectDist = (u: RU, b: RB): number => distToRect(u.x, u.y, b.x, b.y, b.size, b.size);

/** Living attackers that might be within `range` of building b's footprint (exact test is the caller's). */
function attackersNear(sim: RaidSim, b: RB, range: number): RU[] {
  return sim.grid.inBox(b.x - range, b.y - range, b.x + b.size + range, b.y + b.size + range).filter((u) => u.side === 'atk');
}

/**
 * Nearest attacker in range of a building's footprint (or of a point, without `b`).
 * With `taunted`, an RA in range is picked ahead of anyone closer. Ties go to the earlier unit.
 */
export function nearestAttacker(sim: RaidSim, x: number, y: number, range: number, b?: RB, taunted = false): RU | null {
  let best: RU | null = null;
  let bd = Infinity;
  const cands = b ? attackersNear(sim, b, range) : sim.grid.near(x, y, range).filter((u) => u.side === 'atk');
  for (const u of cands) {
    let d = b ? rectDist(u, b) : dist(u.x, u.y, x, y);
    if (d > range) continue;
    if (taunted && u.def?.taunt) d -= 1000;
    if (d < bd) {
      bd = d;
      best = u;
    }
  }
  return best;
}

export function updateShooter(sim: RaidSim, b: RB, dt: number): void {
  const d = b.def!;
  const inRange = (u: RU): boolean => !u.dead && rectDist(u, b) <= d.range;
  if (!b.target || !inRange(b.target)) b.target = nearestAttacker(sim, b.cx, b.cy, d.range, b, true);
  else if (!b.target.def?.taunt) {
    // an RA walking into range pulls fire off whoever was being shot at
    const ra = nearestAttacker(sim, b.cx, b.cy, d.range, b, true);
    if (ra?.def?.taunt) b.target = ra;
  }
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
  let any = false;
  for (const u of attackersNear(sim, b, d.range)) {
    if (u.dead || rectDist(u, b) > d.range) continue;
    any = true;
    u.slowUntil = sim.time + 0.25;
    u.slowMul = 1 - (d.slow ?? 0.4);
    sim.damageUnit(u, d.dps * dt, 'spray', true);
  }
  b.charge = Math.min(1, b.charge + dt / (d.freezeCharge ?? 6));
  if (b.charge >= 1 && any) {
    b.charge = 0;
    for (const u of attackersNear(sim, b, d.range)) if (rectDist(u, b) <= d.range) u.frozenUntil = sim.time + (d.freezeTime ?? 2);
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
        if (Math.random() < dt * 2) sim.events.push({ e: 'bless', b: w }); // cosmetic only
      }
    }
  }
  b.cd -= dt;
  const r = d.splash ?? 1.5;
  if (b.prayT > 0) {
    b.prayT -= dt;
    if (b.prayT <= 0 && b.prayTarget) {
      const { x, y } = b.prayTarget;
      for (const u of sim.grid.near(x, y, r)) {
        if (u.dead || u.side !== 'atk') continue;
        if (dist(u.x, u.y, x, y) <= r) sim.damageUnit(u, d.dps * d.rate, 'pray');
      }
      sim.events.push({ e: 'pray', b, x, y, r });
      b.prayTarget = null;
    }
    return;
  }
  if (b.cd > 0) return;
  // pick the densest clump in range (frozen clumps are juicy)
  let best: RU | null = null;
  let bestScore = -1;
  for (const u of attackersNear(sim, b, d.range)) {
    if (rectDist(u, b) > d.range) continue;
    let score = 0;
    for (const o of sim.grid.near(u.x, u.y, r)) if (o.side === 'atk' && dist(o.x, o.y, u.x, u.y) <= r) score += o.frozenUntil > sim.time ? 1.5 : 1;
    if (score > bestScore) {
      bestScore = score;
      best = u;
    }
  }
  if (best) {
    b.cd = d.rate;
    b.prayT = 0.45;
    b.prayTarget = { x: best.x, y: best.y };
    b.aim = Math.atan2(best.y - b.cy, best.x - b.cx);
  }
}

/** Stinger Statue: continuous beam on the nearest raider; damage ramps while the lock holds. */
export function updateStinger(sim: RaidSim, b: RB, dt: number): void {
  const d = b.def!;
  const t = b.target;
  if (!t || t.dead || rectDist(t, b) > d.range) {
    b.target = nearestAttacker(sim, b.cx, b.cy, d.range, b);
    b.beamT = 0;
  }
  if (!b.target) {
    b.charge = 0;
    return;
  }
  const before = beamStage(d, b.beamT);
  b.beamT += dt;
  const stage = beamStage(d, b.beamT);
  if (stage > before) sim.events.push({ e: 'ramp', b, stage });
  const times = d.rampTimes ?? [];
  b.charge = times.length ? Math.min(1, b.beamT / times[times.length - 1]) : 1;
  b.aim = Math.atan2(b.target.y - b.cy, b.target.x - b.cx);
  b.firing = 1;
  sim.damageUnit(b.target, (d.ramp?.[stage] ?? d.dps) * dt, 'beam', true);
}

export function updateTrap(sim: RaidSim, b: RB): void {
  if (!b.hidden) return;
  // An RA's room check reaches further than a normal trigger, so look a little wider.
  for (const u of sim.grid.near(b.cx, b.cy, 3)) {
    if (u.side !== 'atk' || u.ignoreTrapsUntil > sim.time) continue;
    const roomCheck = u.def?.taunt;
    if (dist(u.x, u.y, b.cx, b.cy) < (roomCheck ? roomCheck.trapRange : 1.2)) {
      if (roomCheck) sim.events.push({ e: 'roomcheck', u });
      const L = BUILDINGS.nest.levels[b.level - 1];
      b.hidden = false;
      b.dead = true;
      sim.zones.push({ kind: 'swarm', x: b.cx, y: b.cy, r: L.trapRadius ?? 2, until: sim.time + (L.trapDuration ?? 5), start: sim.time, dps: L.trapDps ?? 20 });
      sim.events.push({ e: 'swarm', x: b.cx, y: b.cy, r: L.trapRadius ?? 2 });
      return;
    }
  }
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
