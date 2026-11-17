// Troops should walk through a nearby gap in a wall instead of stopping to bash it.
import { describe, expect, it } from 'vitest';
import type { BuildingType } from '../src/config/types';
import { newGame } from '../src/game/state';
import type { BasePiece } from '../src/raid/basegen';
import { TICK } from '../src/raid/engine';
import { RaidSim } from '../src/raid/sim';

const pc = (type: BuildingType, x: number, y: number, level = 1): BasePiece => ({ type, x, y, level });

function sim(pieces: BasePiece[]): RaidSim {
  const base = { name: 'Test U', tagline: '', dmc: 3, pieces, loot: { tuition: 0, coffee: 0 }, trophiesWin: 30, trophiesLose: 10 };
  return new RaidSim(base, { troopLevels: newGame().troopLevels, heroLevels: { prof: 1, president: 1 }, ringBySpring: false, wind: false, elephant: false, seed: 7 });
}

function run(s: RaidSim, seconds: number, done: () => boolean): number {
  for (let t = 0; t < seconds; t += TICK) {
    s.update(TICK);
    s.events.length = 0;
    if (done()) return t;
  }
  return Infinity;
}

/** A wall along row 20 from x=a to x=b, leaving out the columns in `gap`. */
function wallRow(a: number, b: number, gap: number[], level = 1): BasePiece[] {
  const out: BasePiece[] = [];
  for (let x = a; x <= b; x++) if (!gap.includes(x)) out.push(pc('wall', x, 20, level));
  return out;
}

describe('wall gaps', () => {
  it('a freshman walks around through a gap rather than bashing the wall', () => {
    const s = sim([pc('admissions', 18, 10), ...wallRow(4, 36, [30, 31])]);
    const target = s.buildings.find((b) => b.type === 'admissions')!;
    s.spawnTroop('freshman', 18.5, 30.5);
    // about 13 tiles of detour: well under 10 s of walking, against ~37 s to break one wall alone
    const t = run(s, 15, () => target.hp < target.maxHp);
    expect(t).toBeLessThan(15);
    const walls = s.buildings.filter((b) => b.isWall);
    expect(walls.every((w) => w.hp === w.maxHp)).toBe(true);
  });

  it('still breaks through when the only gap is very far away', () => {
    const s = sim([pc('admissions', 18, 10), ...wallRow(0, 39, [0])]);
    const target = s.buildings.find((b) => b.type === 'admissions')!;
    for (let i = 0; i < 8; i++) s.spawnTroop('freshman', 30.5, 23.5 + (i % 2));
    const t = run(s, 40, () => target.hp < target.maxHp);
    expect(t).toBeLessThan(40);
    // went through the wall near x=30, not around by x=0
    const broken = s.buildings.filter((b) => b.isWall && b.dead);
    expect(broken.length).toBeGreaterThan(0);
    expect(broken.every((w) => w.x > 15)).toBe(true);
  });

  it('troops bashing a wall switch to a breach opened elsewhere', () => {
    // fully closed wall; engineers open it at x=26, freshmen bashing at x=18 should go use the breach
    const s = sim([pc('admissions', 18, 10), ...wallRow(0, 39, [], 3)]);
    for (let i = 0; i < 4; i++) s.spawnTroop('freshman', 18.5, 22.5);
    run(s, 4, () => false);
    const bashed = s.buildings.filter((b) => b.isWall && b.hp < b.maxHp);
    expect(bashed.length).toBeGreaterThan(0);
    const breach = s.buildings.find((b) => b.isWall && b.x === 25)!;
    s.damageBuilding(breach, breach.hp + 1);
    const target = s.buildings.find((b) => b.type === 'admissions')!;
    const t = run(s, 40, () => target.hp < target.maxHp);
    expect(t).toBeLessThan(40);
    // nobody kept chipping the original wall to death
    expect(bashed.every((w) => !w.dead)).toBe(true);
  });
});
