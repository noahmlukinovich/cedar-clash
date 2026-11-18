// Parking Gate Arm: a DMC 8 wall tile that swings once at the first raider to come close.
import { describe, expect, it } from 'vitest';
import { BUILDINGS, maxCount } from '../src/config/buildings';
import { newGame } from '../src/game/state';
import { type BasePiece, generateBase } from '../src/raid/basegen';
import { TICK } from '../src/raid/engine';
import { FREE, WALL_COST } from '../src/raid/pathfind';
import { RaidSim, type RU, type SimEvent } from '../src/raid/sim';

const GX = 20;
const L1 = BUILDINGS.gate.levels[0];

function sim(level = 1, extra: BasePiece[] = []): RaidSim {
  const pieces: BasePiece[] = [{ type: 'dmc', x: 4, y: 4, level: 1 }, { type: 'gate', x: GX, y: GX, level }, ...extra];
  return new RaidSim(
    { name: 'Test U', tagline: '', dmc: 8, pieces, loot: { tuition: 0, coffee: 0 }, trophiesWin: 30, trophiesLose: 10 },
    { troopLevels: newGame().troopLevels, heroLevels: { prof: 1, president: 1 }, ringBySpring: false, wind: false, elephant: false, seed: 9 },
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

const still = (s: RaidSim, x: number, y: number, type: 'freshman' | 'rock' = 'freshman'): RU => {
  const u = s.spawnTroop(type, x, y);
  u.speed = 0;
  u.hp = u.maxHp = 1e6;
  return u;
};
const gateOf = (s: RaidSim) => s.buildings.find((b) => b.type === 'gate')!;
const swings = (ev: SimEvent[]) => ev.filter((e) => e.e === 'gate');

describe('Parking Gate Arm', () => {
  it('is a DMC 8 wall piece, four per campus, tougher than a top-level wall', () => {
    expect(BUILDINGS.gate.category).toBe('wall');
    expect(BUILDINGS.gate.levels.every((l) => l.dmc === 8)).toBe(true);
    expect(maxCount('gate', 7)).toBe(0);
    expect(maxCount('gate', 8)).toBe(4);
    expect(L1.hp).toBeGreaterThan(BUILDINGS.wall.levels.at(-1)!.hp);
  });

  it('counts as a wall in raids: path cost, jumpable, not part of destruction %', () => {
    const s = sim();
    const g = gateOf(s);
    expect(g.isWall).toBe(true);
    expect(g.counts).toBe(false);
    expect(s.cost[GX * 40 + GX]).toBe(WALL_COST);
    expect(s.costJump[GX * 40 + GX]).toBe(FREE); // Cross Country Runners go over it
  });

  it('swings once at the first raider within a tile, for swingDmg and a knockback', () => {
    const s = sim();
    const u = still(s, GX + 1.6, GX + 0.5); // 0.6 tiles off the gate's edge
    const x0 = u.x;
    const ev = swings(tick(s, 0.6));
    expect(ev).toHaveLength(1);
    expect(u.maxHp - u.hp).toBeCloseTo(L1.swingDmg!, 5);
    expect(u.x).toBeGreaterThan(x0 + L1.swingKnock! * 0.8);
    expect(gateOf(s).charge).toBe(1);
    // the next raider walks right past
    const v = still(s, GX - 0.5, GX + 0.5);
    expect(swings(tick(s, 1))).toHaveLength(0);
    expect(v.hp).toBe(v.maxHp);
  });

  it('ignores raiders further than a tile away', () => {
    const s = sim();
    const u = still(s, GX + 2.5, GX + 0.5);
    expect(swings(tick(s, 1))).toHaveLength(0);
    expect(u.hp).toBe(u.maxHp);
    expect(gateOf(s).charge).toBe(0);
  });

  it('The Rock takes the hit but is not moved', () => {
    const s = sim();
    const r = still(s, GX + 1.6, GX + 0.5, 'rock');
    const at = { x: r.x, y: r.y };
    expect(swings(tick(s, 0.6))).toHaveLength(1);
    expect(r.hp).toBeLessThan(r.maxHp);
    expect(r.x).toBeCloseTo(at.x, 5);
    expect(r.y).toBeCloseTo(at.y, 5);
  });

  it('a Snow Day freezes the arm, so raiders get past without a swing', () => {
    const s = sim();
    s.castSpell('snowday', GX + 0.5, GX + 0.5);
    still(s, GX + 1.6, GX + 0.5);
    expect(swings(tick(s, 2))).toHaveLength(0);
    expect(gateOf(s).charge).toBe(0);
  });

  it('replays identically', () => {
    const run = (): string => {
      const s = sim(3, [{ type: 'wall', x: GX + 1, y: GX, level: 8 }]);
      for (let i = 0; i < 5; i++) s.spawnTroop(i % 2 ? 'freshman' : 'engineer', GX + 3 + i * 0.4, GX - 2 + i * 0.7);
      tick(s, 15);
      return JSON.stringify([s.units.map((u) => [u.x.toFixed(6), u.y.toFixed(6), u.hp.toFixed(3)]), s.buildings.map((b) => [b.hp, b.charge, b.dead])]);
    };
    expect(run()).toBe(run());
  });

  it('DMC 8 rival campuses set gates into their wall ring', () => {
    const b8 = generateBase(8, 21);
    const gates = b8.pieces.filter((p) => p.type === 'gate');
    expect(gates.length).toBeGreaterThanOrEqual(3);
    expect(gates.length).toBeLessThanOrEqual(4);
    // each gate sits next to a wall
    const walls = new Set(b8.pieces.filter((p) => p.type === 'wall').map((p) => p.y * 40 + p.x));
    for (const g of gates) {
      const near = [1, -1, 40, -40].some((d) => walls.has(g.y * 40 + g.x + d));
      expect(near).toBe(true);
    }
    expect(generateBase(7, 21).pieces.some((p) => p.type === 'gate')).toBe(false);
  });
});
