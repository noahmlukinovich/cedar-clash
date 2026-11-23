import { describe, expect, it } from 'vitest';
import { TROOPS } from '../src/config/troops';
import { SPELLS } from '../src/config/spells';
import { applyAction } from '../src/game/actions';
import { armyCapacity, ARMIES } from '../src/game/army';
import { migrate } from '../src/game/save';
import { readSavedArmy, savedArmyTotals } from '../src/game/savedArmies';
import { newGame, type SavedArmy } from '../src/game/state';

const preset = (): SavedArmy => ({ name: 'Freshman rush', troops: { freshman: 10 }, spells: {} });
function game() {
  const s = newGame();
  s.army = {};
  s.resources = { tuition: 1e6, coffee: 1e6, chapel: 1e6 };
  return s;
}

describe('saved armies', () => {
  it('keeps old saves playable and preserves new recipes across save reloads', () => {
    const old = JSON.parse(JSON.stringify(newGame()));
    delete old.savedArmies;
    expect(migrate(old).savedArmies).toEqual([null, null, null]);
    const s = game();
    expect(applyAction(s, { k: 'armySave', slot: 1, army: preset() }).err).toBeUndefined();
    expect(migrate(JSON.parse(JSON.stringify(s))).savedArmies[1]).toEqual(preset());
  });

  it('validates names, counts, troop identities, and slots from untrusted inputs', () => {
    const s = game();
    for (const troops of [{ freshman: -1 }, { freshman: 1.5 }, { freshman: Infinity }, { dragon: 1 }, { freshman: 501 }]) {
      expect(applyAction(s, { k: 'armySave', slot: 0, army: { ...preset(), troops } as SavedArmy }).err).toBeTruthy();
    }
    expect(readSavedArmy({ ...preset(), name: '  <Rush>  ' })?.name).toBe('Rush');
    expect(readSavedArmy({ ...preset(), troops: {} })).toBeNull();
    for (const slot of [-1, 3, 0.5, NaN]) for (const k of ['armySave', 'armyTrain', 'armyClear'] as const) {
      expect(applyAction(s, { k, slot, army: preset() }).err).toBeTruthy();
    }
    expect(s.savedArmies).toEqual([null, null, null]);
  });

  it('does not allow locked units or recipes larger than one army', () => {
    const s = game();
    expect(applyAction(s, { k: 'armySave', slot: 0, army: { ...preset(), troops: { athlete: 1 } } }).err).toMatch(/locked/);
    expect(applyAction(s, { k: 'armySave', slot: 0, army: { ...preset(), spells: { allnighter: 1 } } }).err).toMatch(/locked/);
    expect(applyAction(s, { k: 'armySave', slot: 0, army: { ...preset(), troops: { freshman: armyCapacity(s) + 1 } } }).err).toMatch(/capacity/);
  });

  it('queues a full copy using current troop levels, preserving current troops and the recipe', () => {
    const s = game(), p = preset();
    applyAction(s, { k: 'armySave', slot: 0, army: p });
    p.troops.freshman = 1; // saving copies the input
    s.troopLevels.freshman = 2;
    s.army.freshman = 3;
    const before = s.resources.coffee;
    expect(applyAction(s, { k: 'armyTrain', slot: 0 }).err).toBeUndefined();
    expect(s.trainQueue).toHaveLength(10);
    expect(s.trainQueue.every((q) => q.type === 'freshman' && q.paid === TROOPS.freshman.levels[1].cost)).toBe(true);
    expect(before - s.resources.coffee).toBe(10 * TROOPS.freshman.levels[1].cost);
    expect(s.army).toEqual({ freshman: 3 });
    expect(s.savedArmies[0]).toEqual(preset());
  });

  it('rejects resource and housing shortages without charging or adding partial troops', () => {
    const s = game();
    applyAction(s, { k: 'armySave', slot: 0, army: preset() });
    s.resources.coffee = 9 * TROOPS.freshman.levels[0].cost;
    const before = JSON.stringify(s);
    expect(applyAction(s, { k: 'armyTrain', slot: 0 }).err).toMatch(/Not enough/);
    expect(JSON.stringify(s)).toBe(before);
    s.resources.coffee = 1e6;
    s.army.freshman = armyCapacity(s) * ARMIES - 9;
    const full = JSON.stringify(s);
    expect(applyAction(s, { k: 'armyTrain', slot: 0 }).err).toMatch(/room/);
    expect(JSON.stringify(s)).toBe(full);
  });

  it('includes spells in the same purchase and checks their space before training any troops', () => {
    const s = game();
    s.buildings.push({ id: s.nextId++, type: 'ssc', x: 0, y: 0, level: 1 });
    const p = { ...preset(), spells: { allnighter: 1 } };
    expect(applyAction(s, { k: 'armySave', slot: 0, army: p }).err).toBeUndefined();
    const before = s.resources.coffee;
    expect(applyAction(s, { k: 'armyTrain', slot: 0 }).err).toBeUndefined();
    expect(s.spellQueue.map((q) => q.type)).toEqual(['allnighter']);
    expect(before - s.resources.coffee).toBe(10 * TROOPS.freshman.levels[0].cost + SPELLS.allnighter.cost);
    s.spells.allnighter = 100;
    const full = JSON.stringify(s);
    expect(applyAction(s, { k: 'armyTrain', slot: 0 }).err).toMatch(/spell space/);
    expect(JSON.stringify(s)).toBe(full);
  });

  it('estimates troop and spell training in parallel, with Finals Week affecting troops', () => {
    const s = game();
    const p = { ...preset(), spells: { allnighter: 1 } };
    expect(savedArmyTotals(s, p).seconds).toBe(30);
    s.events.push({ type: 'finals', end: s.clock + 100 });
    // Ten freshmen now take 10s (20s in Finals), so the unchanged 30s spell still dominates.
    expect(savedArmyTotals(s, p).seconds).toBe(30);
  });

  it('clears only the recipe and handles empty slots', () => {
    const s = game();
    expect(applyAction(s, { k: 'armyTrain', slot: 0 }).err).toBeTruthy();
    applyAction(s, { k: 'armySave', slot: 0, army: preset() });
    applyAction(s, { k: 'armyTrain', slot: 0 });
    const army = JSON.stringify(s.army), queue = JSON.stringify(s.trainQueue);
    expect(applyAction(s, { k: 'armyClear', slot: 0 }).err).toBeUndefined();
    expect(s.savedArmies[0]).toBeNull();
    expect(JSON.stringify(s.army)).toBe(army);
    expect(JSON.stringify(s.trainQueue)).toBe(queue);
  });

  it('rechecks live capacity after building changes instead of trusting the saved recipe', () => {
    const s = game();
    const hall = s.buildings.find((b) => b.type === 'reshall')!;
    hall.level = 2;
    const p = { ...preset(), troops: { freshman: 30 } };
    expect(applyAction(s, { k: 'armySave', slot: 0, army: p }).err).toBeUndefined();
    hall.level = 1;
    const before = JSON.stringify(s);
    expect(applyAction(s, { k: 'armyTrain', slot: 0 }).err).toMatch(/capacity/);
    expect(JSON.stringify(s)).toBe(before);
    hall.level = 2;
    expect(applyAction(s, { k: 'armyTrain', slot: 0 }).err).toBeUndefined();
  });

  it('counts both trained and queued troops/spells and accepts an exact fit', () => {
    const s = game();
    s.buildings.push({ id: s.nextId++, type: 'ssc', x: 0, y: 0, level: 1 });
    const p = { name: 'Exact fit', troops: { freshman: 10 }, spells: { allnighter: 1 } };
    applyAction(s, { k: 'armySave', slot: 0, army: p });
    s.army.freshman = 20;
    s.trainQueue = Array.from({ length: 11 }, () => ({ type: 'freshman' as const, left: 2, total: 2 }));
    const before = JSON.stringify(s);
    expect(applyAction(s, { k: 'armyTrain', slot: 0 }).err).toMatch(/9 available/);
    expect(JSON.stringify(s)).toBe(before);
    s.trainQueue.pop();
    s.spells = { allnighter: 1 };
    s.spellQueue = [{ type: 'allnighter', left: 30, total: 30 }];
    const full = JSON.stringify(s);
    expect(applyAction(s, { k: 'armyTrain', slot: 0 }).err).toMatch(/0 available/);
    expect(JSON.stringify(s)).toBe(full);
    s.spellQueue = [];
    expect(applyAction(s, { k: 'armyTrain', slot: 0 }).err).toBeUndefined();
    expect(s.trainQueue).toHaveLength(20);
    expect(s.spellQueue).toHaveLength(1);
  });
});
