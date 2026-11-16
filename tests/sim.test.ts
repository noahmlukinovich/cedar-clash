import { describe, expect, it } from 'vitest';
import { GRID } from '../src/config/balance';
import { dist } from '../src/core/iso';
import { type BaseLayout, generateBase, rivalStateU } from '../src/raid/basegen';
import { BLOCKED, FREE, WALL_COST, findPath } from '../src/raid/pathfind';
import { RaidSim, SIM_STEP } from '../src/raid/sim';
import { UnitGrid } from '../src/raid/sim/spatial';
import type { RU } from '../src/raid/sim/types';
import { deployPoint, playRaid, simOptions } from './helpers';

const lone = (...pieces: BaseLayout['pieces']): BaseLayout => ({ name: 't', tagline: '', dmc: 1, pieces, loot: { tuition: 1000, coffee: 1000 }, trophiesWin: 30, trophiesLose: 10 });

/** Everything that defines the outcome of a raid, for comparing two runs. */
function fingerprint(sim: RaidSim): unknown {
  return {
    time: sim.time,
    stars: sim.stars,
    destroyed: sim.destroyedCount,
    loot: sim.loot,
    lost: sim.lost,
    units: sim.units.map((u) => [u.type, u.x, u.y, u.hp, u.dead]),
    buildings: sim.buildings.map((b) => [b.hp, b.dead]),
  };
}

describe('RaidSim determinism', () => {
  const base = generateBase({ dmc: 3, seed: 42, archetype: 'compartments' });
  const army = { freshman: 30, athlete: 4, engineer: 4 };

  it('same seed and same inputs give an identical raid', () => {
    const a = playRaid(base, simOptions({ seed: 99, wind: true, ringBySpring: true }), army, 2);
    const b = playRaid(base, simOptions({ seed: 99, wind: true, ringBySpring: true }), army, 2);
    expect(fingerprint(a)).toEqual(fingerprint(b));
  });

  it('a different seed gives a different raid', () => {
    const a = playRaid(base, simOptions({ seed: 99 }), army, 2);
    const b = playRaid(base, simOptions({ seed: 100 }), army, 2);
    expect(fingerprint(a)).not.toEqual(fingerprint(b));
  });

  it('frame rate does not change the outcome', () => {
    const run = (frame: number): RaidSim => {
      const sim = new RaidSim(base, simOptions({ seed: 5 }));
      const p = deployPoint(sim, 1);
      for (let i = 0; i < 20; i++) sim.spawnTroop('freshman', p.x, p.y);
      let steps = 0;
      while (steps < 1800) steps += sim.advance(frame);
      // both runs land on exactly the same step count
      expect(steps).toBe(1800);
      return sim;
    };
    // 60 fps vs 20 fps, both delivering whole numbers of steps
    expect(fingerprint(run(SIM_STEP))).toEqual(fingerprint(run(SIM_STEP * 3)));
  });

  it('advance() caps catch-up after a stall', () => {
    const sim = new RaidSim(base, simOptions());
    expect(sim.advance(10)).toBeLessThanOrEqual(16);
  });
});

describe('RaidSim rules', () => {
  it('an undefended base falls for 3 stars and all its loot', () => {
    const sim = playRaid(lone({ type: 'dmc', level: 1, x: 18, y: 18 }, { type: 'registrar', level: 1, x: 24, y: 18 }), simOptions(), { freshman: 20 });
    expect(sim.stars).toBe(3);
    expect(sim.fullStar).toBe(true);
    expect(sim.dmcDeadAt).toBeGreaterThan(0);
    expect(sim.loot.tuition).toBeCloseTo(sim.lootAvail.tuition, 3);
    expect(sim.lost).toBe(0);
  });

  it('stars: 50% and the DMC are separate', () => {
    // four cheap buildings + a DMC far away: killing two of five is not 50%, three is
    const sim = new RaidSim(
      lone({ type: 'dmc', level: 1, x: 30, y: 30 }, { type: 'shed', level: 1, x: 6, y: 6 }, { type: 'shed', level: 1, x: 9, y: 6 }, { type: 'shed', level: 1, x: 6, y: 9 }, { type: 'shed', level: 1, x: 9, y: 9 }),
      simOptions(),
    );
    const sheds = sim.buildings.filter((b) => b.type === 'shed');
    sim.damageBuilding(sheds[0], 1e6);
    sim.damageBuilding(sheds[1], 1e6);
    expect(sim.stars).toBe(0);
    sim.damageBuilding(sheds[2], 1e6);
    expect(sim.stars).toBe(1);
    sim.damageBuilding(sim.buildings.find((b) => b.type === 'dmc')!, 1e6);
    expect(sim.stars).toBe(2);
    sim.damageBuilding(sheds[3], 1e6);
    expect(sim.stars).toBe(3);
  });

  it('walls and lakes do not count toward destruction, and lakes cannot be destroyed', () => {
    const sim = new RaidSim(lone({ type: 'dmc', level: 1, x: 18, y: 18 }, { type: 'wall', level: 1, x: 10, y: 10 }, { type: 'lake', level: 1, x: 30, y: 30 }), simOptions());
    expect(sim.totalCount).toBe(1);
    const lake = sim.buildings.find((b) => b.type === 'lake')!;
    sim.damageBuilding(lake, 1e12);
    expect(lake.dead).toBe(false);
  });

  it('troops cannot be deployed next to buildings', () => {
    const sim = new RaidSim(rivalStateU(), simOptions());
    expect(sim.canDeploy(20, 20)).toBe(false); // on the DMC
    expect(sim.canDeploy(18.5, 20)).toBe(false); // the tile beside it
    expect(sim.canDeploy(2, 2)).toBe(true);
    expect(sim.canDeploy(-1, 5)).toBe(false);
  });

  it('engineers open walls far faster than freshmen', () => {
    const walled = (): BaseLayout => {
      const pieces: BaseLayout['pieces'] = [{ type: 'dmc', level: 1, x: 18, y: 18 }];
      for (let i = 16; i <= 23; i++) pieces.push({ type: 'wall', level: 1, x: i, y: 16 }, { type: 'wall', level: 1, x: i, y: 23 }, { type: 'wall', level: 1, x: 16, y: i }, { type: 'wall', level: 1, x: 23, y: i });
      // corners were pushed twice: drop duplicates
      const seen = new Set<string>();
      return lone(...pieces.filter((p) => !seen.has(`${p.x},${p.y}`) && seen.add(`${p.x},${p.y}`)));
    };
    const breach = (troop: 'engineer' | 'freshman'): number => {
      const sim = new RaidSim(walled(), simOptions());
      for (let i = 0; i < 4; i++) sim.spawnTroop(troop, 8, 20);
      while (sim.time < 120 && !sim.walls.some((w) => w.dead)) sim.run(0.25);
      return sim.time;
    };
    expect(breach('engineer')).toBeLessThan(breach('freshman') / 2);
  });

  it('Snow Day freezes defenses in its radius and nothing else', () => {
    const sim = new RaidSim(lone({ type: 'dmc', level: 1, x: 18, y: 18 }, { type: 'ratower', level: 1, x: 8, y: 8 }, { type: 'ratower', level: 1, x: 30, y: 30 }), simOptions());
    sim.castSpell('snowday', 9.5, 9.5);
    const [near, far] = sim.buildings.filter((b) => b.type === 'ratower');
    expect(near.frozenUntil).toBeGreaterThan(sim.time);
    expect(far.frozenUntil).toBe(0);
  });
});

describe('UnitGrid', () => {
  it('finds exactly the units a brute-force scan finds', () => {
    const units: RU[] = [];
    let seed = 1;
    const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647) * GRID;
    for (let i = 0; i < 300; i++) units.push({ uid: i, x: rnd(), y: rnd(), dead: i % 11 === 0 } as RU);
    const grid = new UnitGrid();
    grid.rebuild(units);
    for (const [x, y, r] of [[5, 5, 2], [20, 20, 6.5], [0.2, 39.7, 3], [39.9, 0.1, 9], [12.3, 30.1, 0.4]] as const) {
      const got = new Set<number>();
      grid.forEachNear(x, y, r, (u) => dist(u.x, u.y, x, y) <= r && got.add(u.uid));
      const want = units.filter((u) => !u.dead && dist(u.x, u.y, x, y) <= r).map((u) => u.uid);
      expect([...got].sort((a, b) => a - b)).toEqual(want);
    }
  });
});

describe('findPath', () => {
  const grid = (): Uint8Array => new Uint8Array(GRID * GRID).fill(FREE);
  const target = { x: 30, y: 20, w: 1, h: 1 };
  const cells = (p: number[]): [number, number][] => p.map((i) => [i % GRID, (i / GRID) | 0]);

  it('walks straight across open ground', () => {
    const p = findPath(grid(), 10, 20, target, 0.5)!;
    expect(p.length).toBeLessThanOrEqual(20);
    expect(cells(p).every(([, y]) => y === 20)).toBe(true);
  });

  it('never steps on a blocked tile', () => {
    const c = grid();
    for (let y = 5; y < 35; y++) c[y * GRID + 20] = BLOCKED;
    const p = findPath(c, 10, 20, target, 0.5)!;
    expect(p.length).toBeGreaterThan(20);
    expect(p.every((i) => c[i] !== BLOCKED)).toBe(true);
  });

  it('goes around a short wall but through a long one', () => {
    const short = grid();
    for (let y = 18; y <= 22; y++) short[y * GRID + 20] = WALL_COST;
    expect(findPath(short, 10, 20, target, 0.5)!.some((i) => short[i] === WALL_COST)).toBe(false);
    const long = grid();
    for (let y = 0; y < GRID; y++) long[y * GRID + 20] = WALL_COST;
    expect(findPath(long, 10, 20, target, 0.5)!.some((i) => long[i] === WALL_COST)).toBe(true);
  });

  it('returns the closest approach when the target is sealed off', () => {
    const c = grid();
    for (let y = 0; y < GRID; y++) c[y * GRID + 20] = BLOCKED;
    const p = findPath(c, 10, 20, target, 0.5)!;
    expect(cells(p)[p.length - 1][0]).toBe(19);
  });
});
