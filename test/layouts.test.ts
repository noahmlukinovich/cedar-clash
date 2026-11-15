import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/game/actions';
import { isComplete, snapshot } from '../src/game/layouts';
import { migrate } from '../src/game/save';
import { type GameState, newGame } from '../src/game/state';

const rich = (s: GameState): void => {
  s.resources = { tuition: 1e7, coffee: 1e7, chapel: 1e5 };
};
const where = (s: GameState): string => JSON.stringify(s.buildings.map((b) => [b.id, b.x, b.y]));

describe('base layouts', () => {
  it('starts with the campus in slot 1 and migrates old saves the same way', () => {
    const s = newGame();
    expect(s.activeLayout).toBe(0);
    expect(s.layouts[0]!.pos).toEqual(snapshot(s.buildings));
    const old = JSON.parse(JSON.stringify(s));
    delete old.layouts;
    delete old.activeLayout;
    old.version = 3;
    old.buildings[0].x = 4;
    const m = migrate(old);
    expect(m.layouts.map((l) => !!l)).toEqual([true, false, false]);
    expect(m.layouts[0]!.pos).toEqual(snapshot(m.buildings));
  });

  it('keeps the active slot in step with moves, builds and removals', () => {
    const s = newGame();
    rich(s);
    const b = s.buildings.find((x) => x.type === 'shed')!;
    expect(applyAction(s, { k: 'move', id: b.id, x: 4, y: 4 }).err).toBeUndefined();
    expect(s.layouts[0]!.pos[b.id]).toEqual({ x: 4, y: 4 });
    const w = applyAction(s, { k: 'build', type: 'wall', x: 8, y: 8 }).building!;
    expect(s.layouts[0]!.pos[w.id]).toEqual({ x: 8, y: 8 });
    const lake = s.buildings.find((x) => x.type === 'lake')!;
    expect(applyAction(s, { k: 'remove', id: lake.id }).err).toBeUndefined();
    expect(s.layouts[0]!.pos[lake.id]).toBeUndefined();
  });

  it('saves a second layout without moving the campus, then switches to it and back', () => {
    const s = newGame();
    const before = where(s);
    const b = s.buildings.find((x) => x.type === 'shed')!;
    const pos = snapshot(s.buildings);
    pos[b.id] = { x: 4, y: 4 };
    expect(applyAction(s, { k: 'layoutSave', slot: 1, pos }).err).toBeUndefined();
    expect(where(s)).toBe(before);
    expect(applyAction(s, { k: 'layoutUse', slot: 1 }).err).toBeUndefined();
    expect(s.activeLayout).toBe(1);
    expect([b.x, b.y]).toEqual([4, 4]);
    expect(applyAction(s, { k: 'layoutUse', slot: 0 }).err).toBeUndefined();
    expect(where(s)).toBe(before);
  });

  it('saving the active slot moves the campus', () => {
    const s = newGame();
    const b = s.buildings.find((x) => x.type === 'shed')!;
    const pos = snapshot(s.buildings);
    pos[b.id] = { x: 5, y: 5 };
    expect(applyAction(s, { k: 'layoutSave', slot: 0, pos }).err).toBeUndefined();
    expect([b.x, b.y]).toEqual([5, 5]);
  });

  it('rejects layouts that overlap, leave the map, or miss buildings', () => {
    const s = newGame();
    const [a, b] = s.buildings;
    const overlap = snapshot(s.buildings);
    overlap[b.id] = { ...overlap[a.id] };
    expect(applyAction(s, { k: 'layoutSave', slot: 1, pos: overlap }).err).toBeTruthy();
    const out = snapshot(s.buildings);
    out[a.id] = { x: -3, y: 0 };
    expect(applyAction(s, { k: 'layoutSave', slot: 1, pos: out }).err).toBeTruthy();
    const missing = snapshot(s.buildings);
    delete missing[a.id];
    expect(applyAction(s, { k: 'layoutSave', slot: 1, pos: missing }).err).toBeTruthy();
    expect(applyAction(s, { k: 'layoutSave', slot: 7, pos: snapshot(s.buildings) }).err).toBeTruthy();
    expect(applyAction(s, { k: 'layoutSave', slot: 1, pos: null as never }).err).toBeTruthy();
    expect(s.layouts[1]).toBeNull();
  });

  it("won't switch to a layout that predates a new building", () => {
    const s = newGame();
    rich(s);
    applyAction(s, { k: 'layoutSave', slot: 1, pos: snapshot(s.buildings) });
    applyAction(s, { k: 'build', type: 'wall', x: 8, y: 8 });
    expect(isComplete(s, 1)).toBe(false);
    expect(applyAction(s, { k: 'layoutUse', slot: 1 }).err).toBeTruthy();
    expect(s.activeLayout).toBe(0);
  });

  it('renames and clears slots, but never clears the active one', () => {
    const s = newGame();
    applyAction(s, { k: 'layoutSave', slot: 2, pos: snapshot(s.buildings) });
    expect(applyAction(s, { k: 'layoutName', slot: 2, name: '  <b>War   base</b> ' }).err).toBeUndefined();
    expect(s.layouts[2]!.name).toBe('bWar base/b');
    expect(applyAction(s, { k: 'layoutName', slot: 1, name: 'x' }).err).toBeTruthy();
    expect(applyAction(s, { k: 'layoutClear', slot: 0 }).err).toBeTruthy();
    expect(applyAction(s, { k: 'layoutClear', slot: 2 }).err).toBeUndefined();
    expect(s.layouts[2]).toBeNull();
  });

  it('moves the construction fence out from under a building', () => {
    const s = newGame();
    const b = s.buildings.find((x) => x.type === 'shed')!;
    s.events = [{ type: 'construction', end: s.clock + 999, x: 4, y: 4 }];
    const pos = snapshot(s.buildings);
    pos[b.id] = { x: 4, y: 4 };
    applyAction(s, { k: 'layoutSave', slot: 0, pos });
    const e = s.events[0];
    expect(e.x === 4 && e.y === 4).toBe(false);
    expect(applyAction(s, { k: 'build', type: 'wall', x: e.x!, y: e.y! }).err).toBeTruthy();
  });
});
