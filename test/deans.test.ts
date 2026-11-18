// Dean's Office: a DMC 8 defense whose summons jumps from raider to raider.
import { describe, expect, it } from 'vitest';
import { BUILDINGS, maxCount } from '../src/config/buildings';
import { newGame } from '../src/game/state';
import { type BasePiece, generateBase } from '../src/raid/basegen';
import { TICK } from '../src/raid/engine';
import { RaidSim, type RU, type SimEvent } from '../src/raid/sim';

function sim(level = 1, extra: BasePiece[] = []): RaidSim {
  const pieces: BasePiece[] = [{ type: 'dmc', x: 4, y: 4, level: 1 }, { type: 'deans', x: 20, y: 20, level }, ...extra];
  return new RaidSim(
    { name: 'Test U', tagline: '', dmc: 8, pieces, loot: { tuition: 0, coffee: 0 }, trophiesWin: 30, trophiesLose: 10 },
    { troopLevels: newGame().troopLevels, heroLevels: { prof: 1, president: 1 }, ringBySpring: false, wind: false, elephant: false, seed: 5 },
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

const still = (s: RaidSim, x: number, y: number): RU => {
  const u = s.spawnTroop('freshman', x, y);
  u.speed = 0;
  u.hp = u.maxHp = 1e6;
  return u;
};
const taken = (u: RU): number => u.maxHp - u.hp;
const chains = (ev: SimEvent[]) => ev.filter((e): e is Extract<SimEvent, { e: 'chain' }> => e.e === 'chain');

describe("Dean's Office", () => {
  it('is a DMC 8 defense, one per campus', () => {
    expect(BUILDINGS.deans.levels.every((l) => l.dmc === 8)).toBe(true);
    expect(maxCount('deans', 7)).toBe(0);
    expect(maxCount('deans', 8)).toBe(1);
  });

  it('hits the nearest raider, then jumps `chain` times with falloff, never hitting anyone twice', () => {
    const s = sim(1);
    const D = BUILDINGS.deans.levels[0].defense!;
    // a line of raiders 1 tile apart, heading away from the office (footprint x 20..23)
    const us = [25, 26, 27, 28, 29, 30].map((x) => still(s, x, 21.5));
    const ev = chains(tick(s, 1.2));
    expect(ev).toHaveLength(1);
    expect(ev[0].pts).toHaveLength(1 + D.chain!);
    const base = D.dps * D.rate;
    for (let i = 0; i <= D.chain!; i++) expect(taken(us[i])).toBeCloseTo(base * D.chainFalloff! ** i, 5);
    for (let i = D.chain! + 1; i < us.length; i++) expect(taken(us[i])).toBe(0);
    const keys = ev[0].pts.map((p) => `${p.x},${p.y}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('stops jumping when nobody is within chainRange', () => {
    const s = sim(1);
    const a = still(s, 25, 21.5);
    const far = still(s, 25 + BUILDINGS.deans.levels[0].defense!.chainRange! + 1, 21.5);
    const ev = chains(tick(s, 1.2));
    expect(ev[0].pts).toHaveLength(1);
    expect(taken(a)).toBeGreaterThan(0);
    expect(taken(far)).toBe(0);
  });

  it('higher levels jump further down the line and hit harder', () => {
    const ls = BUILDINGS.deans.levels.map((l) => l.defense!);
    for (let i = 1; i < ls.length; i++) {
      expect(ls[i].chain!).toBeGreaterThan(ls[i - 1].chain!);
      expect(ls[i].dps).toBeGreaterThan(ls[i - 1].dps);
    }
    const s = sim(3);
    [25, 26, 27, 28, 29, 30, 31].map((x) => still(s, x, 21.5));
    expect(chains(tick(s, 1.2))[0].pts).toHaveLength(1 + ls[2].chain!);
  });

  it('replays identically, even with raiders tied for distance', () => {
    const run = (): string => {
      const s = sim(2);
      // a symmetric clump, so jumps have ties to break
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
      ])
        still(s, 26 + dx, 21.5 + dy);
      const ev = chains(tick(s, 6));
      return JSON.stringify([ev.map((e) => e.pts), s.units.map((u) => u.hp)]);
    };
    expect(run()).toBe(run());
  });

  it('shows up on DMC 8 rival campuses only', () => {
    expect(generateBase(8, 11).pieces.filter((p) => p.type === 'deans')).toHaveLength(1);
    expect(generateBase(7, 11).pieces.some((p) => p.type === 'deans')).toBe(false);
  });
});
