// Chuck's Casserole Catapult: long-range lobbed splash with a blind spot and knockback.
import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/config/buildings';
import { newGame } from '../src/game/state';
import type { BasePiece } from '../src/raid/basegen';
import { TICK } from '../src/raid/engine';
import { RaidSim, type SimEvent } from '../src/raid/sim';

function sim(seed = 7, extra: BasePiece[] = []): RaidSim {
  const pieces: BasePiece[] = [
    { type: 'dmc', x: 4, y: 4, level: 1 },
    { type: 'catapult', x: 20, y: 20, level: 1 },
    ...extra,
  ];
  return new RaidSim(
    { name: 'Test U', tagline: '', dmc: 5, pieces, loot: { tuition: 0, coffee: 0 }, trophiesWin: 30, trophiesLose: 10 },
    { troopLevels: newGame().troopLevels, heroLevels: { prof: 1, president: 1 }, ringBySpring: false, wind: false, elephant: false, seed },
  );
}

function tick(s: RaidSim, seconds: number, seen: SimEvent[] = []): SimEvent[] {
  for (let t = 0; t < seconds; t += TICK) {
    s.update(TICK);
    seen.push(...s.events);
    s.events.length = 0;
  }
  return seen;
}

const D = BUILDINGS.catapult.levels[0].defense!;
const tough = (s: RaidSim, x: number, y: number) => {
  const u = s.spawnTroop('freshman', x, y);
  u.speed = 0;
  u.hp = u.maxHp = 1e6;
  return u;
};

describe("Chuck's Casserole Catapult", () => {
  it('lobs a tray at a clump in range and knocks everyone back', () => {
    const s = sim();
    // a clump 6 tiles off the catapult's footprint (x 20..23)
    const us = [0, 1, 2].map((i) => tough(s, 29 + i * 0.4, 21.5));
    const before = us.map((u) => ({ x: u.x, y: u.y }));
    const ev = tick(s, 0.6 + D.lobTime! + 0.5);
    const splat = ev.find((e) => e.e === 'splat');
    expect(splat).toBeDefined();
    for (const u of us) expect(u.hp).toBeLessThan(u.maxHp);
    // the centre troop takes the full hit, the others less (falloff)
    const dmg = us.map((u) => u.maxHp - u.hp);
    expect(Math.max(...dmg)).toBeCloseTo(D.dps * D.rate, 0);
    expect(Math.min(...dmg)).toBeLessThan(D.dps * D.rate);
    // shoved outwards from the impact
    const sx = (splat as { x: number }).x;
    for (let i = 0; i < us.length; i++) {
      const d0 = Math.abs(before[i].x - sx);
      const d1 = Math.abs(us[i].x - sx);
      expect(d1).toBeGreaterThan(d0 + 0.5);
    }
  });

  it('never fires at anything inside its blind spot', () => {
    const s = sim();
    tough(s, 24.5, 21.5); // 1.5 tiles off the footprint
    tough(s, 21.5, 25.5);
    const ev = tick(s, 10);
    expect(ev.filter((e) => e.e === 'shoot' || e.e === 'splat')).toHaveLength(0);
  });

  it('cannot reach past its range', () => {
    const s = sim();
    tough(s, 23 + D.range + 1, 21.5);
    const ev = tick(s, 6);
    expect(ev.filter((e) => e.e === 'shoot')).toHaveLength(0);
  });

  it('lands on the spot, not the troop: a raider who moves away is missed', () => {
    const s = sim();
    const u = tough(s, 30, 21.5);
    tick(s, 0.6); // the tray is now in the air
    expect(s.projectiles.some((p) => p.splash)).toBe(true);
    u.x = 34; // sprints clear of the shadow
    const ev = tick(s, D.lobTime!);
    expect(ev.some((e) => e.e === 'splat')).toBe(true);
    expect(u.hp).toBe(u.maxHp);
  });

  it('a knocked-back raider stops at walls', () => {
    const open = sim();
    const free = tough(open, 30.5, 21.5);
    tick(open, 0.6 + D.lobTime! + 0.5);
    expect(free.x).toBeGreaterThan(31.2); // flies on, away from the catapult

    const walled = sim(7, [{ type: 'wall', x: 31, y: 21, level: 1 }]);
    const u = tough(walled, 30.5, 21.5);
    tick(walled, 0.6 + D.lobTime! + 0.5);
    expect(u.hp).toBeLessThan(u.maxHp);
    expect(u.x).toBeLessThan(31); // slammed into the wall instead
  });

  it('replays identically from the same seed', () => {
    const run = () => {
      const s = sim(42);
      for (let i = 0; i < 12; i++) s.spawnTroop('freshman', 30 + (i % 4) * 0.5, 18 + Math.floor(i / 4) * 0.6);
      tick(s, 15);
      return s.units.map((u) => [u.x.toFixed(6), u.y.toFixed(6), u.hp.toFixed(6), u.dead]);
    };
    expect(run()).toEqual(run());
  });
});
