import { describe, expect, it } from 'vitest';
import { GRID } from '../src/config/balance';
import { dist } from '../src/core/iso';
import { type BaseLayout, rivalStateU } from '../src/raid/basegen';
import { BLOCKED, FREE, WALL_COST, findPath } from '../src/raid/pathfind';
import { RaidSim, type RU } from '../src/raid/sim';
import { UnitGrid } from '../src/raid/sim/spatial';
import { LEVEL1 } from './helpers';

const opts = { troopLevels: LEVEL1, heroLevels: { prof: 1, president: 1 }, ringBySpring: false, wind: false, elephant: false, seed: 7 };
const lone = (...pieces: BaseLayout['pieces']): BaseLayout => ({ name: 't', tagline: '', dmc: 1, pieces, loot: { tuition: 1000, coffee: 1000 }, trophiesWin: 30, trophiesLose: 10 });
const run = (sim: RaidSim, seconds: number): void => {
  for (let i = Math.round(seconds * 30); i > 0; i--) {
    sim.update(1 / 30);
    sim.events.length = 0;
  }
};

describe('RaidSim rules', () => {
  it('an undefended base falls for 3 stars, all its loot, and records when the DMC fell', () => {
    const sim = new RaidSim(lone({ type: 'dmc', level: 1, x: 18, y: 18 }, { type: 'registrar', level: 1, x: 24, y: 18 }), opts);
    for (let i = 0; i < 20; i++) sim.spawnTroop('freshman', 10, 20);
    run(sim, 120);
    expect(sim.stars).toBe(3);
    expect(sim.dmcDeadAt).toBeGreaterThan(0);
    expect(sim.dmcDeadAt).toBeLessThan(sim.time);
    expect(sim.loot.tuition).toBeCloseTo(sim.lootAvail.tuition, 3);
    expect(sim.deployed).toBe(20);
    expect(sim.aliveAttackers()).toBe(20);
    expect(sim.defensesLeft()).toBe(0);
  });

  it('stars: 50% and the DMC are separate', () => {
    const sim = new RaidSim(
      lone({ type: 'dmc', level: 1, x: 30, y: 30 }, { type: 'shed', level: 1, x: 6, y: 6 }, { type: 'shed', level: 1, x: 9, y: 6 }, { type: 'shed', level: 1, x: 6, y: 9 }, { type: 'shed', level: 1, x: 9, y: 9 }),
      opts,
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

  it('counts standing defenses', () => {
    const sim = new RaidSim(rivalStateU(), opts);
    const n = sim.buildings.filter((b) => b.isDefense).length;
    expect(sim.defensesLeft()).toBe(n);
    sim.damageBuilding(sim.buildings.find((b) => b.isDefense)!, 1e9);
    expect(sim.defensesLeft()).toBe(n - 1);
  });

  it('troops cannot be deployed next to buildings', () => {
    const sim = new RaidSim(rivalStateU(), opts);
    expect(sim.canDeploy(20, 20)).toBe(false);
    expect(sim.canDeploy(18.5, 20)).toBe(false);
    expect(sim.canDeploy(2, 2)).toBe(true);
    expect(sim.canDeploy(-1, 5)).toBe(false);
  });
});

describe('UnitGrid', () => {
  it('finds exactly the units a full scan finds, in spawn order', () => {
    const units: RU[] = [];
    let seed = 1;
    const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647) * GRID;
    for (let i = 0; i < 300; i++) units.push({ uid: i, x: rnd(), y: rnd(), dead: i % 11 === 0 } as RU);
    const grid = new UnitGrid();
    grid.rebuild(units);
    const late = { uid: 300, x: 20.1, y: 20.2, dead: false } as RU;
    units.push(late);
    grid.add(late);
    for (const [x, y, r] of [[5, 5, 2], [20, 20, 6.5], [0.2, 39.7, 3], [39.9, 0.1, 9], [12.3, 30.1, 0.4]] as const) {
      const got = grid.near(x, y, r).filter((u) => dist(u.x, u.y, x, y) <= r).map((u) => u.uid);
      const want = units.filter((u) => !u.dead && dist(u.x, u.y, x, y) <= r).map((u) => u.uid);
      expect(got).toEqual(want);
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
