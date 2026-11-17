// The Rock: a slow tank that goes for defenses, can't be shoved, and breaks into Pebbles.
import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/config/buildings';
import { PEBBLE_DEF, TROOPS } from '../src/config/troops';
import type { BuildingType } from '../src/config/types';
import { newGame } from '../src/game/state';
import type { BaseLayout, BasePiece } from '../src/raid/basegen';
import { type RaidInput, type RaidSetup, TICK, replayRaid } from '../src/raid/engine';
import { RaidSim, type SimEvent } from '../src/raid/sim';

const pc = (type: BuildingType, x: number, y: number, level = 1): BasePiece => ({ type, x, y, level });
const base = (pieces: BasePiece[]): BaseLayout => ({ name: 'Test U', tagline: '', dmc: 5, pieces, loot: { tuition: 0, coffee: 0 }, trophiesWin: 30, trophiesLose: 10 });

function sim(pieces: BasePiece[], rock = 1): RaidSim {
  return new RaidSim(base(pieces), { troopLevels: { ...newGame().troopLevels, rock }, heroLevels: { prof: 1, president: 1 }, ringBySpring: false, wind: false, elephant: false, seed: 5 });
}

function run(s: RaidSim, seconds: number, seen: SimEvent[] = []): SimEvent[] {
  for (let t = 0; t < seconds; t += TICK) {
    s.update(TICK);
    seen.push(...s.events);
    s.events.length = 0;
  }
  return seen;
}

const pebbles = (s: RaidSim) => s.units.filter((u) => u.type === 'pebble' && !u.dead);
const B = (s: RaidSim, type: BuildingType) => s.buildings.find((b) => b.type === type)!;

describe('The Rock', () => {
  it('walks past a closer building to hit a defense', () => {
    const s = sim([pc('admissions', 8, 11), pc('ratower', 20, 11), pc('dmc', 30, 30)]);
    const rock = s.spawnTroop('rock', 5, 12);
    rock.hp = rock.maxHp = 1e6;
    run(s, 25);
    expect(B(s, 'admissions').hp).toBe(B(s, 'admissions').maxHp);
    expect(B(s, 'ratower').hp).toBeLessThan(B(s, 'ratower').maxHp);
  });

  it('breaks into two Pebbles, exactly once, at its level', () => {
    const s = sim([pc('dmc', 30, 10, 6)], 3);
    const rock = s.spawnTroop('rock', 4, 12);
    run(s, 1);
    s.damageUnit(rock, 1e6, 'test');
    s.damageUnit(rock, 1e6, 'test');
    expect(rock.dead).toBe(true);
    const ps = pebbles(s);
    expect(ps).toHaveLength(2);
    for (const p of ps) {
      expect(p.maxHp).toBe(PEBBLE_DEF.levels[2].hp);
      expect(p.level).toBe(3);
      expect(Math.hypot(p.x - rock.x, p.y - rock.y)).toBeLessThan(1);
    }
    expect(s.aliveAttackers()).toBe(2);
    // pebbles don't expire like GO Team members do
    run(s, 30);
    expect(pebbles(s).length).toBeGreaterThan(0);
  });

  it('crashes onto buildings within 1.5 tiles when it cracks, and nothing further away', () => {
    const s = sim([pc('admissions', 10, 10), pc('coffeecart', 16, 10), pc('dmc', 30, 30)]);
    const rock = s.spawnTroop('rock', 13.5, 11); // 0.5 tiles off the collector at x 10..13
    const near = B(s, 'admissions');
    const far = B(s, 'coffeecart');
    const ev: SimEvent[] = [];
    s.damageUnit(rock, 1e6, 'test');
    ev.push(...s.events);
    expect(near.maxHp - near.hp).toBe(Math.min(near.maxHp, TROOPS.rock.crumble!.dmg[0]));
    expect(far.hp).toBe(far.maxHp); // 2.5 tiles away
    expect(ev.some((e) => e.e === 'crumble')).toBe(true);
  });

  it('is too heavy for the Casserole Catapult to knock back', () => {
    const s = sim([pc('dmc', 4, 4), pc('catapult', 20, 20)]);
    const rock = s.spawnTroop('rock', 29.5, 21.5);
    const fresh = s.spawnTroop('freshman', 29.1, 21.5);
    for (const u of [rock, fresh]) {
      u.speed = 0;
      u.hp = u.maxHp = 1e6;
    }
    const ev = run(s, 0.6 + BUILDINGS.catapult.levels[0].defense!.lobTime! + 0.5);
    expect(ev.some((e) => e.e === 'splat')).toBe(true);
    expect(rock.hp).toBeLessThan(rock.maxHp); // still hurt by it
    expect(rock.x).toBeCloseTo(29.5, 5);
    expect(Math.abs(fresh.x - 29.1)).toBeGreaterThan(0.5);
  });

  it('a raid with a Rock replays identically', () => {
    const setup: RaidSetup = { kind: 'random', base: base([pc('dmc', 14, 10, 4), pc('ratower', 20, 16), pc('catapult', 8, 20)]), seed: 42, wind: false, ringBySpring: false, troopLevels: newGame().troopLevels, heroLevels: { prof: 1, president: 1 }, heroes: {}, army: { rock: 1, music: 4 }, spells: {} };
    const inputs: RaidInput[] = [
      { t: 0, k: 'troop', type: 'rock', x: 4, y: 12 },
      { t: 60, k: 'troop', type: 'music', x: 4, y: 13 },
      { t: 70, k: 'troop', type: 'music', x: 4, y: 11 },
    ];
    const a = replayRaid(setup, inputs);
    const b = replayRaid(JSON.parse(JSON.stringify(setup)), JSON.parse(JSON.stringify(inputs)));
    expect(a).toEqual(b);
    expect(a.usedTroops).toEqual({ rock: 1, music: 2 });
  });
});
