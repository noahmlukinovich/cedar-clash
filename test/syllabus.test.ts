// Syllabus Week: a DMC 8 healing spell from Brew Lab Lv4.
import { describe, expect, it } from 'vitest';
import { BUILDINGS, maxLevelForDmc } from '../src/config/buildings';
import { SPELLS, SPELL_CAPACITY, SPELL_ORDER } from '../src/config/spells';
import { applyAction } from '../src/game/actions';
import { newGame } from '../src/game/state';
import { TICK } from '../src/raid/engine';
import { RaidSim, type RU, type SimEvent } from '../src/raid/sim';

const SP = SPELLS.syllabus;

function sim(): RaidSim {
  return new RaidSim(
    { name: 'Test U', tagline: '', dmc: 8, pieces: [{ type: 'dmc', x: 34, y: 34, level: 1 }], loot: { tuition: 0, coffee: 0 }, trophiesWin: 30, trophiesLose: 10 },
    { troopLevels: newGame().troopLevels, heroLevels: { prof: 1, president: 1 }, ringBySpring: false, wind: false, elephant: false, seed: 2 },
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

/** A raider standing still at (x, y), down to `frac` of its health. */
const hurt = (s: RaidSim, x: number, y: number, frac = 0.2): RU => {
  const u = s.spawnTroop('athlete', x, y);
  u.speed = 0;
  u.hp = u.maxHp * frac;
  return u;
};

describe('Syllabus Week', () => {
  it('is brewed at Brew Lab Lv4, which needs DMC 8, and Lv4 holds one more spell', () => {
    expect(SPELL_ORDER).toContain('syllabus');
    expect(BUILDINGS.ssc.levels[SP.sscLevel - 1].dmc).toBe(8);
    expect(maxLevelForDmc('ssc', 7)).toBeLessThan(SP.sscLevel);
    expect(SPELL_CAPACITY[4]).toBe(SPELL_CAPACITY[3] + 1);

    const s = newGame();
    s.resources = { tuition: 1e6, coffee: 1e6, chapel: 1e4 };
    s.buildings.find((b) => b.type === 'dmc')!.level = 8;
    const lab = { id: s.nextId++, type: 'ssc' as const, x: 3, y: 3, level: 3 };
    s.buildings.push(lab);
    expect(applyAction(s, { k: 'brew', type: 'syllabus' }).err).toBe('Requires Brew Lab Lv4');
    lab.level = 4;
    expect(applyAction(s, { k: 'brew', type: 'syllabus' }).err).toBeUndefined();
  });

  it('heals your troops in the zone by `heal` of max HP per second', () => {
    const s = sim();
    const u = hurt(s, 10, 10);
    const before = u.hp;
    s.castSpell('syllabus', 10, 10);
    tick(s, 2);
    expect(u.hp - before).toBeCloseTo(u.maxHp * SP.heal! * 2, -1);
  });

  it('stops when the spell ends, and never overheals', () => {
    const s = sim();
    const low = hurt(s, 10, 10, 0.1);
    const nearlyFull = hurt(s, 11, 10, 0.99);
    s.castSpell('syllabus', 10, 10);
    tick(s, SP.duration + 2);
    const healed = low.hp - low.maxHp * 0.1;
    expect(healed).toBeCloseTo(low.maxHp * SP.heal! * SP.duration, -1);
    expect(nearlyFull.hp).toBe(nearlyFull.maxHp);
    const after = low.hp;
    tick(s, 3);
    expect(low.hp).toBe(after);
  });

  it('leaves raiders outside the zone, and defenders, alone', () => {
    const s = sim();
    const out = hurt(s, 10 + SP.radius + 1.5, 10);
    const def = hurt(s, 10.5, 10);
    def.side = 'def';
    const o0 = out.hp;
    const d0 = def.hp;
    s.castSpell('syllabus', 10, 10);
    tick(s, 3);
    expect(out.hp).toBe(o0);
    expect(def.hp).toBe(d0);
  });

  it('shows a heal "+" every half second per raider, deterministically', () => {
    const run = (): string => {
      const s = sim();
      hurt(s, 10, 10);
      hurt(s, 10.5, 10.5);
      s.castSpell('syllabus', 10, 10);
      const heals = tick(s, 3.25).filter((e) => e.e === 'heal');
      return JSON.stringify([heals.length, s.units.map((u) => u.hp.toFixed(4))]);
    };
    const a = run();
    expect(a).toBe(run());
    expect(JSON.parse(a)[0]).toBe(2 * 6); // two raiders, one "+" at each half second from 0.5s to 3s
  });
});
