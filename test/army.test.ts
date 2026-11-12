import { describe, expect, it } from 'vitest';
import { TROOPS } from '../src/config/troops';
import { applyAction } from '../src/game/actions';
import { armyCapacity, armyUsed, queueRuns, queueUsed, tickArmy, trainQueueLeft } from '../src/game/army';
import { type GameState, newGame } from '../src/game/state';

function game(): GameState {
  const s = newGame();
  s.army = {};
  s.resources = { tuition: 1e6, coffee: 1e6, chapel: 100 };
  return s;
}
const train = (s: GameState, n: number, type: 'freshman' | 'athlete' = 'freshman'): void => {
  for (let i = 0; i < n; i++) expect(applyAction(s, { k: 'train', type }).err).toBeUndefined();
};

describe('troop training', () => {
  it('charges for a troop, queues it and trains it', () => {
    const s = game();
    const before = s.resources[TROOPS.freshman.res];
    train(s, 2);
    expect(before - s.resources[TROOPS.freshman.res]).toBe(2 * TROOPS.freshman.levels[0].cost);
    expect(s.trainQueue.map((q) => q.paid)).toEqual([TROOPS.freshman.levels[0].cost, TROOPS.freshman.levels[0].cost]);
    for (const q of s.trainQueue) q.chucks = 0; // skip the random wait in line
    tickArmy(s, TROOPS.freshman.trainTime * 2 + 1);
    expect(s.trainQueue).toEqual([]);
    expect(s.army.freshman).toBe(2);
  });

  it('refuses to train past the residence halls, counting troops still in the queue', () => {
    const s = game();
    const room = Math.floor(armyCapacity(s) / TROOPS.freshman.housing);
    train(s, room);
    expect(armyUsed(s) + queueUsed(s)).toBe(room * TROOPS.freshman.housing);
    const paid = { ...s.resources };
    expect(applyAction(s, { k: 'train', type: 'freshman' }).err).toMatch(/full/);
    expect(s.resources).toEqual(paid); // nothing charged
    expect(applyAction(s, { k: 'train', type: 'engineer' }).err).toMatch(/Requires/); // not unlocked
  });

  it('refunds what was paid when cancelling, even if research raised the price meanwhile', () => {
    const s = game();
    const res = TROOPS.freshman.res;
    const before = s.resources[res];
    train(s, 1);
    s.troopLevels.freshman = 3; // research finished while it was queued
    expect(TROOPS.freshman.levels[2].cost).toBeGreaterThan(TROOPS.freshman.levels[0].cost);
    expect(applyAction(s, { k: 'cancelTrain', idx: 0 }).err).toBeUndefined();
    expect(s.resources[res]).toBe(before);
    // items saved before `paid` existed still get the current price back
    s.trainQueue.push({ type: 'freshman', left: 5, total: 5 });
    applyAction(s, { k: 'cancelTrain', idx: 0 });
    expect(s.resources[res]).toBe(before + TROOPS.freshman.levels[2].cost);
  });

  it('cancels by position from the end, so it still hits the right troop after the head finished', () => {
    const s = game();
    train(s, 3);
    // The browser saw [f, f, f] and cancels the last one (idx 2, back 0). On the server the
    // first troop has already finished, so idx 2 no longer exists but back 0 is the same troop.
    const server = structuredClone(s);
    server.trainQueue.shift();
    expect(applyAction(structuredClone(server), { k: 'cancelTrain', idx: 2 }).err).toBe('Bad action');
    expect(applyAction(server, { k: 'cancelTrain', idx: 2, back: 0, type: 'freshman' }).err).toBeUndefined();
    expect(server.trainQueue.length).toBe(1);
    // the whole queue finished on the server: a clear message, nothing refunded twice
    server.trainQueue = [];
    const t = { ...server.resources };
    expect(applyAction(server, { k: 'cancelTrain', idx: 0, back: 0, type: 'freshman' }).err).toMatch(/already finished/);
    expect(server.resources).toEqual(t);
    // wrong troop at that position: refused
    server.trainQueue = [{ type: 'athlete', left: 1, total: 1, paid: 1 }];
    expect(applyAction(server, { k: 'cancelTrain', idx: 0, back: 0, type: 'freshman' }).err).toMatch(/already finished/);
    expect(server.trainQueue.length).toBe(1);
    for (const bad of [-1, 1.5, 'x', null, 1e12]) expect(applyAction(server, { k: 'cancelTrain', idx: 0, back: bad as never }).err).toBeTruthy();
  });

  it('groups the queue into runs and reports the time left (doubled in Finals Week)', () => {
    const s = game();
    s.trainQueue = [
      { type: 'freshman', left: 3, total: 8, chucks: 2 },
      { type: 'freshman', left: 8, total: 8 },
      { type: 'athlete', left: 20, total: 20 },
      { type: 'freshman', left: 8, total: 8 },
    ];
    expect(queueRuns(s)).toEqual([
      { type: 'freshman', count: 2, start: 0 },
      { type: 'athlete', count: 1, start: 2 },
      { type: 'freshman', count: 1, start: 3 },
    ]);
    expect(trainQueueLeft(s)).toBe(41);
    s.events.push({ type: 'finals', end: s.clock + 100 });
    expect(trainQueueLeft(s)).toBe(82);
  });
});
