import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/config/buildings';
import { HEROES, TROOPS } from '../src/config/troops';
import type { BuildingType } from '../src/config/types';
import { applyAction } from '../src/game/actions';
import { listUpgrades } from '../src/game/upgrades';
import { type BuildingInst, type GameState, newGame } from '../src/game/state';

function add(s: GameState, type: BuildingType, level = 1): BuildingInst {
  const b: BuildingInst = { id: s.nextId++, type, x: 3, y: 3, level };
  s.buildings.push(b);
  return b;
}
const rich = (s: GameState): void => {
  s.resources = { tuition: 1e7, coffee: 1e7, chapel: 1e5 };
};
const ids = (rows: { id: number }[]): number[] => rows.map((r) => r.id);

describe('listUpgrades', () => {
  it('splits a new campus into affordable and unaffordable, cheapest first', () => {
    const s = newGame();
    const all = listUpgrades(s);
    const costs0 = [...all.ready, ...all.waiting].filter((r) => r.res === 'tuition').map((r) => r.cost);
    s.resources.tuition = Math.min(...costs0); // enough for the cheapest Tuition upgrade only
    const l = listUpgrades(s);
    expect(l.progress).toEqual([]);
    expect(l.ready.length).toBeGreaterThan(0);
    expect(l.waiting.length).toBeGreaterThan(0);
    for (const r of l.ready) expect(s.resources[r.res]).toBeGreaterThanOrEqual(r.cost);
    for (const r of l.waiting) {
      expect(s.resources[r.res]).toBeLessThan(r.cost);
      expect(r.reason).toMatch(/^Not enough/);
    }
    const costs = l.ready.map((r) => r.cost);
    expect(costs).toEqual([...costs].sort((a, b) => a - b));
    expect(l.count).toBe(l.ready.length);
    // every "ready" row really is accepted by the action the button sends
    for (const r of l.ready) expect(applyAction(structuredClone(s), { k: 'upgrade', id: r.id }).err).toBeUndefined();
  });

  it('moves everything to waiting when nothing is affordable', () => {
    const s = newGame();
    s.resources = { tuition: 0, coffee: 0, chapel: 0 };
    const l = listUpgrades(s);
    expect(l.ready).toEqual([]);
    expect(l.count).toBe(0);
    expect(l.waiting.length).toBeGreaterThan(0);
  });

  it('treats "no free builder" as waiting, and lists the running jobs with a finish cost', () => {
    const s = newGame();
    rich(s);
    const before = listUpgrades(s);
    const timed = before.ready.filter((r) => r.time > 0);
    expect(timed.length).toBeGreaterThan(2);
    // two sheds: start two timed upgrades
    expect(applyAction(s, { k: 'upgrade', id: timed[0].id }).err).toBeUndefined();
    expect(applyAction(s, { k: 'upgrade', id: timed[1].id }).err).toBeUndefined();
    const l = listUpgrades(s);
    expect(ids(l.progress).sort()).toEqual([timed[0].id, timed[1].id].sort());
    for (const p of l.progress) {
      expect(p.left).toBeGreaterThan(0);
      expect(p.finishCost).toBeGreaterThan(0);
    }
    expect(l.ready.every((r) => r.time === 0)).toBe(true);
    const w = l.waiting.find((r) => r.id === timed[2].id);
    expect(w?.reason).toMatch(/Facilities Crew/);
    expect(ids(l.ready)).not.toContain(timed[0].id);
    expect(ids(l.waiting)).not.toContain(timed[0].id);
  });

  it('collapses walls into one row for the lowest level', () => {
    const s = newGame();
    rich(s);
    const dmc = s.buildings.find((b) => b.type === 'dmc')!;
    dmc.level = 3;
    add(s, 'wall', 2);
    const low1 = add(s, 'wall', 1);
    const low2 = add(s, 'wall', 1);
    add(s, 'wall', 2);
    add(s, 'wall', 3);
    let l = listUpgrades(s);
    let walls = [...l.ready, ...l.waiting].filter((r) => r.type === 'wall');
    expect(walls).toHaveLength(1);
    expect(walls[0]).toMatchObject({ id: low1.id, level: 1, count: 2, cost: BUILDINGS.wall.levels[1].cost });
    expect(ids(l.ready)).toContain(low1.id);

    // upgrading the row's wall leaves one Lv1 wall; then the row moves on to Lv2
    applyAction(s, { k: 'upgrade', id: low1.id });
    walls = listUpgrades(s).ready.filter((r) => r.type === 'wall');
    expect(walls[0]).toMatchObject({ id: low2.id, level: 1, count: 1 });
    applyAction(s, { k: 'upgrade', id: low2.id });
    walls = listUpgrades(s).ready.filter((r) => r.type === 'wall');
    expect(walls[0]).toMatchObject({ level: 2, count: 4 });

    // can't pay for the lowest wall: the single row waits
    s.resources.tuition = 0;
    l = listUpgrades(s);
    expect(l.ready.filter((r) => r.type === 'wall')).toHaveLength(0);
    expect(l.waiting.filter((r) => r.type === 'wall')).toHaveLength(1);
  });

  it('leaves out maxed buildings, decor and anything that needs a higher DMC', () => {
    const s = newGame();
    rich(s);
    const all = (): number[] => {
      const l = listUpgrades(s);
      return [...ids(l.ready), ...ids(l.waiting), ...ids(l.progress)];
    };
    const lake = s.buildings.find((b) => b.type === 'lake')!;
    expect(all()).not.toContain(lake.id);

    const res = s.buildings.find((b) => b.type === 'registrar')!;
    expect(all()).toContain(res.id);
    res.level = BUILDINGS.registrar.levels.length;
    expect(all()).not.toContain(res.id);

    // a wall already at the DMC's cap is hidden, not "waiting"
    const wall = add(s, 'wall', 1);
    expect(BUILDINGS.wall.levels[1].dmc).toBeGreaterThan(1);
    expect(all()).not.toContain(wall.id);
    s.buildings.find((b) => b.type === 'dmc')!.level = 2;
    expect(all()).toContain(wall.id);
  });

  it('lists research and hero upgrades, and counts the allowed ones in the badge', () => {
    const s = newGame();
    rich(s);
    expect(listUpgrades(s).extras).toEqual([]); // no library, no heroes yet

    s.buildings.find((b) => b.type === 'dmc')!.level = 3;
    add(s, 'library', 1);
    add(s, 'faculty', 1);
    let l = listUpgrades(s);
    const fresh = l.extras.find((e) => e.kind === 'research' && e.type === 'freshman')!;
    expect(fresh).toMatchObject({ ok: true, level: 1, cost: TROOPS.freshman.levels[1].researchCost, res: 'coffee' });
    const prof = l.extras.find((e) => e.kind === 'hero' && e.type === 'prof')!;
    expect(prof).toMatchObject({ ok: true, level: 1, cost: HEROES.prof.levels[1].upgradeCost, res: 'chapel' });
    expect(l.extras.some((e) => e.type === 'president')).toBe(false); // not built
    expect(l.extras.some((e) => e.type === 'engineer')).toBe(false); // troop not unlocked
    expect(l.count).toBe(l.ready.length + l.extras.filter((e) => e.ok).length);
    for (const e of l.extras.filter((x) => x.ok)) {
      const a = e.kind === 'research' ? ({ k: 'research', type: e.type } as const) : ({ k: 'heroUpgrade', type: e.type } as const);
      expect(applyAction(structuredClone(s), a as never).err).toBeUndefined();
    }

    // once research runs, nothing else in the Library is allowed; the running one shows time left
    expect(applyAction(s, { k: 'research', type: 'freshman' }).err).toBeUndefined();
    expect(applyAction(s, { k: 'heroUpgrade', type: 'prof' }).err).toBeUndefined();
    l = listUpgrades(s);
    expect(l.extras.find((e) => e.type === 'freshman')).toMatchObject({ ok: false });
    expect(l.extras.find((e) => e.type === 'freshman')!.left).toBeGreaterThan(0);
    expect(l.extras.find((e) => e.type === 'prof')!.left).toBeGreaterThan(0);
    expect(l.extras.some((e) => e.ok)).toBe(false);
    expect(l.count).toBe(l.ready.length);

    // too poor: shown, but not allowed
    const p = newGame();
    p.buildings.find((b) => b.type === 'dmc')!.level = 3;
    add(p, 'library', 1);
    p.resources.coffee = 0;
    const row = listUpgrades(p).extras.find((e) => e.type === 'freshman')!;
    expect(row.ok).toBe(false);
    expect(row.reason).toMatch(/Not enough/);
  });
});
