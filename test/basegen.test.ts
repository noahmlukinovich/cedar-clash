import { describe, expect, it } from 'vitest';
import { GRID } from '../src/config/balance';
import { BUILDINGS, maxCount } from '../src/config/buildings';
import type { BuildingType } from '../src/config/types';
import { ARCHETYPES, generateBase, rivalStateU } from '../src/raid/basegen';
import { RaidSim } from '../src/raid/sim';
import { LEVEL1, footprint } from './helpers';

describe('generateBase', () => {
  it('is deterministic for a given spec', () => {
    const spec = { dmc: 4, seed: 987654, strength: 0.7, archetype: 'lakeside' as const };
    expect(generateBase(spec)).toEqual(generateBase(spec));
    expect(generateBase({ ...spec, seed: 1 }).pieces).not.toEqual(generateBase(spec).pieces);
  });

  for (const archetype of ARCHETYPES) {
    it(`${archetype}: every base is legal at every DMC level`, () => {
      for (let dmc = 1; dmc <= 6; dmc++) {
        for (let seed = 1; seed <= 60; seed++) {
          const base = generateBase({ dmc, seed, archetype, strength: (seed % 5) / 4 });
          footprint(base); // throws on overlap / out of bounds
          const n = (t: BuildingType): number => base.pieces.filter((p) => p.type === t).length;
          expect(n('dmc'), 'exactly one DMC').toBe(1);
          expect(base.pieces.find((p) => p.type === 'dmc')!.level).toBe(dmc);
          for (const t of Object.keys(BUILDINGS) as BuildingType[]) {
            if (t === 'lake' || t === 'shed') continue; // scenery and the two decorative sheds are not shop-limited
            expect(n(t), `${t} count at dmc ${dmc}`).toBeLessThanOrEqual(maxCount(t, dmc));
          }
          for (const p of base.pieces) {
            expect(p.level).toBeGreaterThanOrEqual(1);
            expect(p.level).toBeLessThanOrEqual(BUILDINGS[p.type].levels.length);
          }
          expect(n('registrar') + n('rinnova'), 'has something to loot').toBeGreaterThan(0);
          // the attacker must have somewhere to stand
          const sim = new RaidSim(base, { troopLevels: LEVEL1, heroLevels: { prof: 1, president: 1 }, ringBySpring: false, wind: false, elephant: false, seed: 1 });
          let open = 0;
          for (let i = 0; i < GRID * GRID; i++) if (!sim.forbid[i]) open++;
          expect(open).toBeGreaterThan(GRID * 4);
        }
      }
    });
  }

  it('archetypes produce visibly different shapes', () => {
    const dmcPos = (a: (typeof ARCHETYPES)[number]) => generateBase({ dmc: 4, seed: 7, archetype: a }).pieces.find((p) => p.type === 'dmc')!;
    const far = (p: { x: number; y: number }) => Math.hypot(p.x + 2 - GRID / 2, p.y + 2 - GRID / 2);
    expect(far(dmcPos('fortress'))).toBeLessThan(3);
    expect(far(dmcPos('corner'))).toBeGreaterThan(7);
    expect(far(dmcPos('donut'))).toBeGreaterThan(7);
    const lakes = (a: (typeof ARCHETYPES)[number]) => generateBase({ dmc: 4, seed: 7, archetype: a }).pieces.filter((p) => p.type === 'lake').length;
    expect(lakes('lakeside')).toBeGreaterThan(4);
  });

  it('stronger rivals are better built and richer', () => {
    let weak = 0;
    let strong = 0;
    let weakLoot = 0;
    let strongLoot = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const a = generateBase({ dmc: 5, seed, strength: 0.05, archetype: 'fortress' });
      const b = generateBase({ dmc: 5, seed, strength: 1, archetype: 'fortress' });
      weak += a.pieces.reduce((s, p) => s + p.level, 0);
      strong += b.pieces.reduce((s, p) => s + p.level, 0);
      weakLoot += a.loot.tuition;
      strongLoot += b.loot.tuition;
    }
    expect(strong).toBeGreaterThan(weak * 1.1);
    expect(strongLoot).toBeGreaterThan(weakLoot * 1.2);
  });

  it('the tutorial base is legal', () => {
    expect(() => footprint(rivalStateU())).not.toThrow();
  });
});
