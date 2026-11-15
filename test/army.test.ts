import { describe, expect, it } from 'vitest';
import { TROOPS } from '../src/config/troops';
import { applyAction } from '../src/game/actions';
import { ARMIES, armyCapacity, armyUsed, fillArmy, isReady, queueRuns, queueUsed, reserveReady, tickArmy, trainQueueLeft } from '../src/game/army';
import type { BaseLayout } from '../src/raid/basegen';
import type { RaidSetup } from '../src/raid/engine';
import { replayRaid } from '../src/raid/engine';
import { applyRaidOutcome } from '../src/raid/outcome';
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

  it('allows two armies in total, counting troops still in the queue, and refuses more without charging', () => {
    const s = game();
    const room = Math.floor(armyCapacity(s) / TROOPS.freshman.housing);
    train(s, room * 2);
    expect(armyUsed(s) + queueUsed(s)).toBe(room * 2 * TROOPS.freshman.housing);
    const paid = { ...s.resources };
    expect(applyAction(s, { k: 'train', type: 'freshman' }).err).toMatch(/Both armies are full/);
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
      { type: 'freshman', count: 2, start: 0, ready: false },
      { type: 'athlete', count: 1, start: 2, ready: false },
      { type: 'freshman', count: 1, start: 3, ready: false },
    ]);
    expect(trainQueueLeft(s)).toBe(41);
    s.events.push({ type: 'finals', end: s.clock + 100 });
    expect(trainQueueLeft(s)).toBe(82);
  });
});

describe('faster training and the reserve army', () => {
  /** Trains without the random wait in line, so times are exact. */
  const run = (s: GameState, seconds: number): void => {
    for (let t = 0; t < seconds; t += 0.25) {
      for (const q of s.trainQueue) if (q.chucks === undefined) q.chucks = 0;
      tickArmy(s, 0.25);
    }
  };
  const cap = (s: GameState): number => armyCapacity(s);

  it('trains every troop in half the time it used to take', () => {
    const before = { freshman: 4, engineer: 10, nurse: 30, theology: 15, athlete: 20, business: 8, music: 12, runner: 15, ra: 30, goteam: 30 };
    for (const [t, old] of Object.entries(before)) expect(TROOPS[t as keyof typeof before].trainTime).toBe(old / 2);
    expect(ARMIES).toBe(2);
  });

  it('fills the halls first, then keeps training and holds the rest as ready', () => {
    const s = game();
    const n = cap(s); // freshmen take 1 housing each
    train(s, n * 2);
    run(s, TROOPS.freshman.trainTime * n + 0.5);
    expect(s.army.freshman).toBe(n); // first army is in the halls
    expect(armyUsed(s)).toBe(cap(s));
    run(s, TROOPS.freshman.trainTime * n + 0.5);
    // the second army is trained and waiting; nothing overflowed the halls
    expect(s.army.freshman).toBe(n);
    expect(s.trainQueue).toHaveLength(n);
    expect(s.trainQueue.every(isReady)).toBe(true);
    expect(reserveReady(s)).toBe(n);
    expect(trainQueueLeft(s)).toBe(0);
    expect(queueRuns(s)).toEqual([{ type: 'freshman', count: n, start: 0, ready: true }]);
    expect(s.stats.trained_freshman).toBe(n * 2); // each troop is counted once, when it finishes training
    run(s, 30);
    expect(s.stats.trained_freshman).toBe(n * 2);
  });

  it('moves ready troops in as soon as there is room, and keeps training behind them', () => {
    const s = game();
    const n = cap(s);
    train(s, n + 6);
    run(s, TROOPS.freshman.trainTime * (n + 3) + 0.1); // halls full, 3 ready, 3 still training
    expect(s.army.freshman).toBe(n);
    expect(s.trainQueue.filter(isReady)).toHaveLength(3);
    expect(queueRuns(s).map((r) => [r.count, r.ready])).toEqual([[3, true], [3, false]]);
    s.army.freshman = n - 2; // a raid used two
    tickArmy(s, 0); // no time needs to pass
    expect(s.army.freshman).toBe(n);
    expect(s.trainQueue.filter(isReady)).toHaveLength(1);
    run(s, TROOPS.freshman.trainTime * 3 + 0.5);
    expect(s.trainQueue).toHaveLength(4);
    expect(s.trainQueue.every(isReady)).toBe(true);
  });

  it('skips a ready troop that is too big for the gap, and moves it in later', () => {
    const s = game();
    const n = cap(s);
    s.army = { freshman: n };
    s.trainQueue = [
      { type: 'athlete', left: 0, total: 10, paid: 250 }, // 5 housing
      { type: 'freshman', left: 0, total: 2, paid: 25 },
      { type: 'freshman', left: 0, total: 2, paid: 25 },
    ];
    s.army.freshman = n - 2; // room for 2
    fillArmy(s);
    expect(s.army.freshman).toBe(n);
    expect(s.army.athlete ?? 0).toBe(0);
    expect(s.trainQueue.map((q) => q.type)).toEqual(['athlete']);
    s.army.freshman = n - 5; // now the athlete fits
    fillArmy(s);
    expect(s.army.athlete).toBe(1);
    expect(s.trainQueue).toEqual([]);
    expect(armyUsed(s)).toBe(n);
  });

  it('trains the whole reserve during a long time away', () => {
    const s = game();
    const n = cap(s);
    train(s, n * 2);
    for (const q of s.trainQueue) q.chucks = 0;
    tickArmy(s, 86400);
    expect(s.army.freshman).toBe(n);
    expect(s.trainQueue).toHaveLength(n);
    expect(s.trainQueue.every(isReady)).toBe(true);
  });

  it('refunds a ready troop in full when cancelled', () => {
    const s = game();
    const n = cap(s);
    const res = TROOPS.freshman.res;
    s.army = { freshman: n };
    train(s, 2);
    run(s, 10);
    expect(s.trainQueue.every(isReady)).toBe(true);
    const before = s.resources[res];
    expect(applyAction(s, { k: 'cancelTrain', idx: 1, back: 0, type: 'freshman' }).err).toBeUndefined();
    expect(s.resources[res]).toBe(before + TROOPS.freshman.levels[0].cost);
    expect(s.trainQueue).toHaveLength(1);
  });

  it('refills the halls from the reserve as part of a raid result', () => {
    const s = game();
    const n = cap(s);
    s.army = { freshman: n };
    train(s, 8);
    run(s, 30);
    expect(s.trainQueue.filter(isReady)).toHaveLength(8);
    const base: BaseLayout = { name: 'Test U', tagline: '', dmc: 1, pieces: [{ type: 'shed', x: 20, y: 20, level: 1 }], loot: { tuition: 0, coffee: 0 }, trophiesWin: 30, trophiesLose: 10 };
    const setup: RaidSetup = { kind: 'random', base, seed: 1, wind: false, ringBySpring: false, troopLevels: s.troopLevels, heroLevels: { prof: 1, president: 1 }, heroes: {}, army: { ...s.army }, spells: {} };
    const r = replayRaid(setup, Array.from({ length: 5 }, (_, i) => ({ t: i, k: 'troop' as const, type: 'freshman' as const, x: 17 + i * 0.3, y: 20 })));
    expect(r.usedTroops.freshman).toBe(5);
    applyRaidOutcome(s, setup, r);
    expect(s.army.freshman).toBe(n); // five went out, five came in from the reserve
    expect(s.trainQueue.filter(isReady)).toHaveLength(3);
  });
});
