// Fire Alarm: a hidden DMC 7 trap that files raiders out and makes them stand around outside.
import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/config/buildings';
import { newGame } from '../src/game/state';
import type { BasePiece } from '../src/raid/basegen';
import { generateBase } from '../src/raid/basegen';
import { TICK } from '../src/raid/engine';
import { RaidSim, type RU, type SimEvent } from '../src/raid/sim';

const AX = 20; // alarm tile; its centre is (20.5, 20.5)
const C = AX + 0.5;
const L1 = BUILDINGS.firealarm.levels[0];

function sim(level = 1, extra: BasePiece[] = []): RaidSim {
  const pieces: BasePiece[] = [{ type: 'dmc', x: 4, y: 4, level: 1 }, { type: 'firealarm', x: AX, y: AX, level }, ...extra];
  return new RaidSim(
    { name: 'Test U', tagline: '', dmc: 7, pieces, loot: { tuition: 0, coffee: 0 }, trophiesWin: 30, trophiesLose: 10 },
    { troopLevels: newGame().troopLevels, heroLevels: { prof: 1, president: 1 }, ringBySpring: false, wind: false, elephant: false, seed: 3 },
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

const still = (u: RU): RU => {
  u.speed = 0;
  u.hp = u.maxHp = 1e6;
  return u;
};
const alarm = (s: RaidSim) => s.buildings.find((b) => b.type === 'firealarm')!;
const d = (u: RU): number => Math.hypot(u.x - C, u.y - C);

describe('Fire Alarm', () => {
  it('is a hidden DMC 7 trap that does not count towards destruction', () => {
    expect(BUILDINGS.firealarm.category).toBe('trap');
    expect(BUILDINGS.firealarm.levels.map((l) => l.dmc)).toEqual([7, 7, 8]);
    const s = sim();
    const b = alarm(s);
    expect(b.hidden).toBe(true);
    expect(b.isTrap).toBe(true);
    expect(b.counts).toBe(false);
  });

  it('files everyone in range out, once, and leaves raiders outside the radius alone', () => {
    const s = sim();
    const near = still(s.spawnTroop('freshman', C + 0.6, C));
    const mid = still(s.spawnTroop('freshman', C, C - 1.5));
    const far = still(s.spawnTroop('freshman', C + 4, C + 4));
    const d0 = [d(near), d(mid), d(far)];
    const ev = tick(s, 0.5);
    const al = ev.filter((e) => e.e === 'alarm');
    expect(al).toHaveLength(1);
    expect(al[0]).toMatchObject({ n: 2, r: L1.trapRadius });
    expect(alarm(s).dead).toBe(true);
    expect(alarm(s).hidden).toBe(false);
    // pushed straight out by about trapPush tiles
    expect(d(near)).toBeGreaterThan(d0[0] + L1.trapPush! * 0.8);
    expect(d(mid)).toBeGreaterThan(d0[1] + L1.trapPush! * 0.8);
    expect(d(far)).toBeCloseTo(d0[2], 5);
    expect(near.stunUntil).toBeGreaterThan(s.time);
    expect(far.stunUntil).toBe(0);
    // it doesn't go off again
    expect(tick(s, 3).some((e) => e.e === 'alarm')).toBe(false);
  });

  it('makes raiders stand around for trapStun seconds, then they carry on', () => {
    const s = sim();
    const u = s.spawnTroop('freshman', C + 0.6, C);
    u.hp = u.maxHp = 1e6;
    tick(s, 0.5); // triggered and filed out
    const at = { x: u.x, y: u.y };
    tick(s, L1.trapStun! - 0.4);
    expect(u.x).toBeCloseTo(at.x, 5);
    expect(u.y).toBeCloseTo(at.y, 5);
    tick(s, 1);
    expect(Math.hypot(u.x - at.x, u.y - at.y)).toBeGreaterThan(0.2);
  });

  it('heroes stay out half as long; The Rock is stopped but not moved', () => {
    const s = sim();
    const f = still(s.spawnTroop('freshman', C + 0.6, C));
    const h = s.spawnHero('prof', C - 0.6, C);
    h.speed = 0;
    const rock = still(s.spawnTroop('rock', C, C + 0.8));
    const rockAt = { x: rock.x, y: rock.y };
    tick(s, TICK * 2);
    const t0 = s.time;
    expect(h.stunUntil - t0).toBeCloseTo((f.stunUntil - t0 - 0.35) / 2 + 0.35, 1);
    tick(s, 0.5);
    expect(rock.x).toBeCloseTo(rockAt.x, 5);
    expect(rock.y).toBeCloseTo(rockAt.y, 5);
    expect(rock.stunUntil).toBeGreaterThan(s.time);
  });

  it('is ignored by raiders inside a Chapel Announcement', () => {
    const s = sim();
    s.castSpell('announcement', C, C);
    const u = still(s.spawnTroop('freshman', C + 0.6, C));
    const ev = tick(s, 1);
    expect(ev.some((e) => e.e === 'alarm')).toBe(false);
    expect(alarm(s).hidden).toBe(true);
    expect(u.stunUntil).toBe(0);
  });

  it('higher levels stun longer and reach further', () => {
    const ls = BUILDINGS.firealarm.levels;
    for (let i = 1; i < ls.length; i++) {
      expect(ls[i].trapStun!).toBeGreaterThan(ls[i - 1].trapStun!);
      expect(ls[i].trapRadius!).toBeGreaterThan(ls[i - 1].trapRadius!);
    }
  });

  it('replays identically', () => {
    const run = (): string => {
      const s = sim(3);
      for (let i = 0; i < 6; i++) s.spawnTroop(i % 2 ? 'freshman' : 'athlete', C + 1.6 + i * 0.3, C - 2 + i * 0.5);
      tick(s, 12);
      return JSON.stringify(s.units.map((u) => [u.x.toFixed(6), u.y.toFixed(6), u.hp.toFixed(3), u.stunUntil]));
    };
    expect(run()).toBe(run());
  });

  it('shows up on DMC 7 and 8 rival campuses', () => {
    for (const dmc of [7, 8]) {
      const n = generateBase(dmc, 11).pieces.filter((p) => p.type === 'firealarm').length;
      expect(n).toBeGreaterThan(0);
      expect(generateBase(6, 11).pieces.some((p) => p.type === 'firealarm')).toBe(false);
    }
  });
});
