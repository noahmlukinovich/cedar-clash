import { describe, expect, it } from 'vitest';
import { DMC_STORAGE, MAX_DMC } from '../src/config/balance';
import { BUILDINGS, maxCount, maxLevelForDmc } from '../src/config/buildings';
import { SPELL_CAPACITY } from '../src/config/spells';
import { FAN_DEF, GO_MEMBER_DEF, HEROES, PEBBLE_DEF, TROOPS } from '../src/config/troops';
import type { BuildingType } from '../src/config/types';
import { applyAction } from '../src/game/actions';
import { caps, tickEconomy } from '../src/game/economy';
import { type BuildingInst, type GameState, newGame } from '../src/game/state';
import { generateBase } from '../src/raid/basegen';

const types = Object.keys(BUILDINGS) as BuildingType[];

function add(s: GameState, type: BuildingType, level = 1): BuildingInst {
  const b: BuildingInst = { id: s.nextId++, type, x: 3, y: 3, level };
  s.buildings.push(b);
  return b;
}
const dmcOf = (s: GameState): BuildingInst => s.buildings.find((b) => b.type === 'dmc')!;

describe('DMC 8 config', () => {
  it('has MAX_DMC levels, and every table indexed by DMC covers 0..MAX_DMC', () => {
    expect(MAX_DMC).toBe(8);
    expect(BUILDINGS.dmc.levels).toHaveLength(MAX_DMC);
    for (const t of types) expect(BUILDINGS[t].counts, t).toHaveLength(MAX_DMC + 1);
    for (const r of ['tuition', 'coffee', 'chapel'] as const) expect(DMC_STORAGE[r], r).toHaveLength(MAX_DMC + 1);
  });

  it('never asks for a DMC above MAX_DMC, and level requirements never go down', () => {
    for (const t of types) {
      const req = BUILDINGS[t].levels.map((l) => l.dmc);
      for (const d of req) expect(d, t).toBeLessThanOrEqual(MAX_DMC);
      expect(req, t).toEqual([...req].sort((a, b) => a - b));
    }
    for (const h of Object.values(HEROES)) for (const l of h.levels) expect(l.dmc, h.type).toBeLessThanOrEqual(MAX_DMC);
    const maxLib = BUILDINGS.library.levels.length;
    for (const t of Object.values(TROOPS)) for (const l of t.levels) expect(l.libraryLevel, t.type).toBeLessThanOrEqual(maxLib);
  });

  it('every building is fully upgradable at MAX_DMC', () => {
    for (const t of types) expect(maxLevelForDmc(t, MAX_DMC), t).toBe(BUILDINGS[t].levels.length);
  });

  it('keeps linked level tables in step', () => {
    expect(FAN_DEF.levels).toHaveLength(BUILDINGS.hive.levels.length);
    expect(PEBBLE_DEF.levels).toHaveLength(TROOPS.rock.levels.length);
    expect(GO_MEMBER_DEF.levels).toHaveLength(TROOPS.goteam.levels.length);
    expect(SPELL_CAPACITY).toHaveLength(BUILDINGS.ssc.levels.length + 1);
  });

  it('a maxed campus one DMC down can store the next DMC upgrade', () => {
    for (let d = 2; d <= MAX_DMC; d++) {
      const s = newGame();
      s.buildings = s.buildings.filter((b) => b.type !== 'registrar' && b.type !== 'rinnova');
      dmcOf(s).level = d - 1;
      for (let i = 0; i < maxCount('registrar', d - 1); i++) add(s, 'registrar', maxLevelForDmc('registrar', d - 1));
      expect(caps(s).tuition, `DMC ${d}`).toBeGreaterThanOrEqual(BUILDINGS.dmc.levels[d - 1].cost);
    }
  });
});

describe('upgrading to DMC 8', () => {
  it('goes 6 -> 7 -> 8, unlocking new levels and counts on the way', () => {
    const s = newGame();
    s.resources = { tuition: 1e7, coffee: 1e7, chapel: 1e6 };
    const dmc = dmcOf(s);
    dmc.level = 6;
    const tower = add(s, 'ratower', 6);
    expect(applyAction(s, { k: 'upgrade', id: tower.id }).err).toBe('Requires DMC level 7');
    expect(maxCount('ratower', 6)).toBe(5);
    expect(maxCount('ratower', 7)).toBe(5);
    expect(maxCount('ratower', 8)).toBe(6);

    for (const to of [7, 8]) {
      expect(applyAction(s, { k: 'upgrade', id: dmc.id }).err).toBeUndefined();
      expect(applyAction(s, { k: 'finish', id: dmc.id }).err).toBeUndefined();
      tickEconomy(s, 0);
      expect(dmc.level).toBe(to);
    }
    expect(s.achievements.dmc8).toBe(true);
    expect(applyAction(s, { k: 'upgrade', id: dmc.id }).err).toBeTruthy(); // maxed

    expect(applyAction(s, { k: 'upgrade', id: tower.id }).err).toBeUndefined();
  });
});

describe('rival bases at DMC 7 and 8', () => {
  it('are deterministic, in bounds, non-overlapping and use the new levels', () => {
    for (const d of [7, 8]) {
      for (const seed of [1, 42, 9001]) {
        const a = generateBase({ dmc: d, seed });
        expect(generateBase({ dmc: d, seed })).toEqual(a);
        expect(a.dmc).toBe(d);
        expect(a.loot.tuition).toBeGreaterThan(0);
        const occ = new Set<number>();
        for (const p of a.pieces) {
          const sz = BUILDINGS[p.type].size;
          expect(p.level).toBeGreaterThanOrEqual(1);
          expect(p.level).toBeLessThanOrEqual(maxLevelForDmc(p.type, d));
          for (let y = p.y; y < p.y + sz; y++)
            for (let x = p.x; x < p.x + sz; x++) {
              expect(x >= 0 && y >= 0 && x < 40 && y < 40).toBe(true);
              expect(occ.has(y * 40 + x)).toBe(false);
              occ.add(y * 40 + x);
            }
        }
        expect(a.pieces.find((p) => p.type === 'dmc')!.level).toBe(d);
      }
    }
  });
});
