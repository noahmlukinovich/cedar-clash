import { describe, expect, it } from 'vitest';
import { addRes, caps, collect } from '../src/game/economy';
import { newGame } from '../src/game/state';

describe('addRes', () => {
  it('fills up to the storage cap and reports what fit', () => {
    const s = newGame();
    const cap = caps(s).tuition;
    s.resources.tuition = cap - 10;
    expect(addRes(s, 'tuition', 50)).toBe(10);
    expect(s.resources.tuition).toBe(cap);
  });

  it('never takes resources away from a player who is already over the cap', () => {
    const s = newGame();
    const cap = caps(s).tuition;
    s.resources.tuition = cap + 500;
    expect(addRes(s, 'tuition', 100)).toBe(0);
    expect(s.resources.tuition).toBe(cap + 500);
  });

  it('removes resources for a negative amount, not below zero', () => {
    const s = newGame();
    s.resources.coffee = 30;
    expect(addRes(s, 'coffee', -50)).toBe(-30);
    expect(s.resources.coffee).toBe(0);
  });

  it("doesn't grow a collector's stock when collecting into overfull storage", () => {
    const s = newGame();
    const b = s.buildings.find((x) => x.type === 'admissions')!;
    b.stored = 200;
    s.resources.tuition = caps(s).tuition + 500;
    expect(collect(s, b)).toBe(0);
    expect(b.stored).toBe(200);
  });
});
