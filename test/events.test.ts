import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EventType } from '../src/config/types';
import { applyAction } from '../src/game/actions';
import { occupancy } from '../src/game/economy';
import { startEvent, tickEvents } from '../src/game/events';
import { migrate } from '../src/game/save';
import { type GameState, newGame } from '../src/game/state';

afterEach(() => vi.restoreAllMocks());

describe('retired Campus Construction event', () => {
  it('drops old fences on load while preserving active events and building timers', () => {
    const raw = JSON.parse(JSON.stringify(newGame()));
    raw.events = [
      { type: 'construction', end: raw.clock + 999, x: 4, y: 4 },
      { type: 'finals', end: raw.clock + 100 },
    ];
    const building = raw.buildings.find((b: { type: string }) => b.type === 'admissions');
    building.level = 0;
    building.upgrade = { to: 1, end: raw.clock + 60, total: 60 };
    const state = migrate(raw);
    expect(state.events).toEqual([{ type: 'finals', end: raw.clock + 100 }]);
    expect(state.buildings.find((b) => b.id === building.id)?.upgrade).toEqual(building.upgrade);
    expect(state.buildings.find((b) => b.id === building.id)?.level).toBe(0);
    expect(occupancy(state)[4 * 40 + 4]).toBe(0);
    state.resources.tuition = 10000;
    expect(applyAction(state, { k: 'build', type: 'wall', x: 4, y: 4 }).err).toBeUndefined();
  });

  it('clears already-loaded legacy events and ignores their old occupancy', () => {
    const state = newGame();
    state.nextEventCheck = Infinity;
    state.events = [{ type: 'construction', end: state.clock + 999, x: 4, y: 4 }] as unknown as GameState['events'];
    expect(occupancy(state)[4 * 40 + 4]).toBe(0);
    tickEvents(state, 0);
    expect(state.events.some((e) => (e.type as string) === 'construction')).toBe(false);
  });

  it('ignores a retired event request from an old client', () => {
    const state = newGame();
    expect(() => startEvent(state, 'construction' as EventType)).not.toThrow();
    expect(state.events).toEqual([]);
  });

  for (const roll of [0, 0.35, 0.7, 0.99]) {
    it(`still schedules supported events with selection roll ${roll}`, () => {
      const state = newGame();
      state.nextEventCheck = 0;
      vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValue(roll);
      tickEvents(state, 0);
      expect(state.events.length).toBeGreaterThan(0);
      expect(state.events.every((e) => ['finals', 'elephantrun', 'ringbyspring'].includes(e.type))).toBe(true);
    });
  }
});

describe('retired idle-army ticketing', () => {
  it('does not fine a full idle army even when an old ticket timer is due', async () => {
    const { armyCapacity } = await import('../src/game/army');
    const { bus } = await import('../src/core/bus');
    const state = newGame();
    state.army = { freshman: armyCapacity(state) };
    expect(armyCapacity(state)).toBeGreaterThan(0);
    state.resources.tuition = 10000;
    state.lastRaidClock = -1000;
    state.nextEventCheck = Infinity;
    Object.assign(state, { nextTicketCheck: 0 }); // a pre-update in-memory save
    const emit = vi.spyOn(bus, 'emit');
    for (let i = 0; i < 3; i++) {
      state.clock += 1000;
      tickEvents(state, 1000);
    }
    expect(state.resources.tuition).toBe(10000);
    expect(state.stats.tickets ?? 0).toBe(0);
    expect(emit.mock.calls.some(([event]) => String(event) === 'ticket')).toBe(false);
  });

  it('drops the obsolete timer while preserving previously earned awards and resources', async () => {
    const { checkAchievements } = await import('../src/game/achievements');
    const raw = JSON.parse(JSON.stringify(newGame()));
    raw.nextTicketCheck = 0;
    raw.stats.tickets = 2;
    raw.achievements.ticketed = true;
    const state = migrate(raw);
    expect('nextTicketCheck' in state).toBe(false);
    expect(state.stats.tickets).toBe(2);
    expect(state.achievements.ticketed).toBe(true);
    expect(state.resources).toEqual(raw.resources);
    expect(checkAchievements(state)).not.toContain('ticketed');
  });

  it('does not grant the retired award to an old counter without a prior unlock', async () => {
    const { checkAchievements } = await import('../src/game/achievements');
    const state = newGame();
    state.stats.tickets = 1;
    const chapel = state.resources.chapel;
    expect(checkAchievements(state)).not.toContain('ticketed');
    expect(state.achievements.ticketed).toBeUndefined();
    expect(state.resources.chapel).toBe(chapel);
  });
});
