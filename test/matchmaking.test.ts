import { describe, expect, it } from 'vitest';
import { MAX_DMC } from '../src/config/balance';
import { Rng } from '../src/core/rng';
import { ARCHETYPES } from '../src/raid/basegen';
import { baseForMatchup, expectedDmc, findRival } from '../src/raid/matchmaking';
import { trophyDelta } from '../src/raid/outcome';
import type { RaidSetup } from '../src/raid/engine';

function average(trophies: number, dmc: number, n = 400) {
  const rng = new Rng(trophies * 31 + dmc);
  let d = 0;
  let str = 0;
  let diff = 0;
  let win = 0;
  let lose = 0;
  for (let i = 0; i < n; i++) {
    const m = findRival(trophies, dmc, () => rng.next());
    d += m.dmc;
    str += m.strength;
    diff += m.difficulty;
    win += m.trophiesWin;
    lose += m.trophiesLose;
  }
  return { dmc: d / n, strength: str / n, difficulty: diff / n, win: win / n, lose: lose / n };
}

describe('matchmaking', () => {
  it('expects a higher DMC as trophies rise', () => {
    expect(expectedDmc(0)).toBe(1);
    expect(expectedDmc(700)).toBe(3);
    expect(expectedDmc(99999)).toBeLessThanOrEqual(MAX_DMC + 0.5);
  });

  it('is deterministic for a given rng', () => {
    const a = new Rng(9);
    const b = new Rng(9);
    expect(findRival(500, 3, () => a.next())).toEqual(findRival(500, 3, () => b.next()));
  });

  it('gives an even match when trophies fit the campus', () => {
    const a = average(700, 3);
    expect(a.dmc).toBeGreaterThan(2.7);
    expect(a.dmc).toBeLessThan(3.3);
    expect(a.difficulty).toBeGreaterThan(1.5);
    expect(a.difficulty).toBeLessThan(2.5);
  });

  it('more trophies at the same DMC means tougher, better-paying rivals', () => {
    const low = average(0, 3);
    const mid = average(700, 3);
    const high = average(1600, 3);
    expect(low.dmc).toBeLessThan(mid.dmc);
    expect(mid.dmc).toBeLessThan(high.dmc);
    expect(low.strength).toBeLessThan(mid.strength);
    expect(mid.strength).toBeLessThan(high.strength);
    expect(low.difficulty).toBeLessThan(mid.difficulty);
    expect(mid.difficulty).toBeLessThan(high.difficulty);
    expect(low.win).toBeLessThan(high.win);
    expect(low.lose).toBeGreaterThan(high.lose); // punching up risks less
  });

  it('never strays more than one DMC level from the player, or off the scale', () => {
    const rng = new Rng(3);
    for (let dmc = 1; dmc <= MAX_DMC; dmc++) {
      for (const t of [0, 300, 900, 2500, 4000]) {
        for (let i = 0; i < 100; i++) {
          const m = findRival(t, dmc, () => rng.next());
          expect(Math.abs(m.dmc - dmc)).toBeLessThanOrEqual(1);
          expect(m.dmc).toBeGreaterThanOrEqual(1);
          expect(m.dmc).toBeLessThanOrEqual(MAX_DMC);
          expect(m.strength).toBeGreaterThan(0);
          expect(m.strength).toBeLessThanOrEqual(1);
          expect(m.trophiesWin).toBeGreaterThan(0);
          expect(m.trophiesLose).toBeGreaterThan(0);
        }
      }
    }
  });

  it('does not serve the previous layout again, and uses every layout', () => {
    const rng = new Rng(11);
    const seen = new Set<string>();
    const rand = (): number => rng.next();
    let last = findRival(400, 3, rand).archetype;
    for (let i = 0; i < 200; i++) {
      const m = findRival(400, 3, rand, last);
      expect(m.archetype).not.toBe(last);
      seen.add(m.archetype);
      last = m.archetype;
    }
    expect(seen.size).toBe(ARCHETYPES.length);
  });

  it('builds the matched base with the matched stakes', () => {
    const r5 = new Rng(5);
    const m = findRival(1200, 4, () => r5.next());
    const base = baseForMatchup(m);
    expect(base.dmc).toBe(m.dmc);
    expect(base.archetype).toBe(m.archetype);
    expect(base.trophiesWin).toBe(m.trophiesWin);
    expect(base.difficulty).toBe(m.difficulty);
    const setup = { kind: 'random', base } as RaidSetup;
    expect(trophyDelta(setup, 3)).toBe(m.trophiesWin);
    expect(trophyDelta(setup, 1)).toBe(Math.round(m.trophiesWin / 2));
    expect(trophyDelta(setup, 0)).toBe(-m.trophiesLose);
  });
});
