import { describe, expect, it } from 'vitest';
import { DAILY_REWARD_BASE, DAILY_REWARD_PER_DMC } from '../src/config/balance';
import { TROOPS } from '../src/config/troops';
import { type DailyMetrics, OBJECTIVES, dailyBase, dailyFor, dailyProgress, dayKey, msUntilNextDaily, recordDaily } from '../src/game/daily';
import { newGame } from '../src/game/state';
import { replayRaid } from '../src/raid/engine';
import { applyRaidOutcome, dailySetup } from '../src/raid/outcome';
import { footprint, playBot } from './helpers';

const none: DailyMetrics = { stars: 0, destruction: 0, dmcDeadAt: -1, deployed: 10, standing: 0, defensesLeft: 3, lootFrac: 0 };
const win: DailyMetrics = { stars: 3, destruction: 1, dmcDeadAt: 20, deployed: 10, standing: 10, defensesLeft: 0, lootFrac: 1 };

describe('daily challenge', () => {
  it('uses UTC days', () => {
    expect(dayKey(Date.UTC(2027, 2, 9, 23, 59))).toBe('2027-03-09');
    expect(dayKey(Date.UTC(2027, 2, 10, 0, 0))).toBe('2027-03-10');
    expect(msUntilNextDaily(Date.UTC(2027, 2, 9, 23, 0))).toBe(3600_000);
  });

  it('is the same for everyone on the same day and DMC, and changes daily', () => {
    expect(dailyFor('2027-03-09', 3)).toEqual(dailyFor('2027-03-09', 3));
    expect(dailyBase(dailyFor('2027-03-09', 3))).toEqual(dailyBase(dailyFor('2027-03-09', 3)));
    const layouts = new Set<string>();
    const objectives = new Set<string>();
    for (let d = 1; d <= 28; d++) {
      const c = dailyFor(`2027-02-${String(d).padStart(2, '0')}`, 3);
      layouts.add(JSON.stringify(dailyBase(c).pieces));
      objectives.add(c.objectiveId);
    }
    expect(layouts.size).toBe(28);
    expect(objectives.size).toBe(Object.keys(OBJECTIVES).length);
  });

  it('shares the objective across DMC levels but scales the army, base and reward', () => {
    const lo = dailyFor('2027-03-09', 1);
    const hi = dailyFor('2027-03-09', 6);
    expect(lo.objectiveId).toBe(hi.objectiveId);
    expect(lo.reward).toBe(DAILY_REWARD_BASE + DAILY_REWARD_PER_DMC);
    expect(hi.reward).toBeGreaterThan(lo.reward);
    const housing = (c: typeof lo): number => Object.entries(c.army).reduce((a, [t, n]) => a + TROOPS[t as keyof typeof TROOPS].housing * n!, 0);
    expect(housing(hi)).toBeGreaterThan(housing(lo) * 3);
    expect(dailyBase(hi).dmc).toBe(6);
    expect(lo.spells).toEqual({});
  });

  it('every daily base is legal', () => {
    for (let dmc = 1; dmc <= 6; dmc++) for (let d = 1; d <= 28; d++) expect(() => footprint(dailyBase(dailyFor(`2027-05-${String(d).padStart(2, '0')}`, dmc)))).not.toThrow();
  });

  it('judges each objective on the right thing', () => {
    expect(OBJECTIVES.stars2.met({ ...none, stars: 2 })).toBe(true);
    expect(OBJECTIVES.stars2.met({ ...none, stars: 1 })).toBe(false);
    expect(OBJECTIVES.wreck.met({ ...none, destruction: 0.7 })).toBe(true);
    expect(OBJECTIVES.wreck.met({ ...none, destruction: 0.69 })).toBe(false);
    expect(OBJECTIVES.dmcrush.met({ ...none, dmcDeadAt: 75 })).toBe(true);
    expect(OBJECTIVES.dmcrush.met({ ...none, dmcDeadAt: 76 })).toBe(false);
    expect(OBJECTIVES.dmcrush.met(none)).toBe(false);
    expect(OBJECTIVES.disarm.met({ ...none, defensesLeft: 0 })).toBe(true);
    expect(OBJECTIVES.survivors.met({ ...none, stars: 1, standing: 3 })).toBe(true);
    expect(OBJECTIVES.survivors.met({ ...none, stars: 1, standing: 2 })).toBe(false);
    expect(OBJECTIVES.survivors.met({ ...none, stars: 0, standing: 10 })).toBe(false);
    expect(OBJECTIVES.heist.met({ ...none, lootFrac: 0.6 })).toBe(true);
  });

  it('pays Chapel Credits once per day, then again the next day', () => {
    const s = newGame();
    const c = dailyFor('2027-03-09', 1);
    const start = s.resources.chapel;
    expect(recordDaily(s, c, none)).toEqual({ passed: false, reward: 0 });
    expect(dailyProgress(s, c.day)).toMatchObject({ done: false, attempts: 1 });
    expect(recordDaily(s, c, win)).toEqual({ passed: true, reward: c.reward });
    const afterFirst = s.resources.chapel;
    expect(afterFirst).toBeGreaterThanOrEqual(start + c.reward); // plus the "first daily" achievement
    expect(s.achievements.dailyfirst).toBe(true);
    expect(recordDaily(s, c, win)).toEqual({ passed: true, reward: 0 });
    expect(s.resources.chapel).toBe(afterFirst);
    expect(dailyProgress(s, c.day)).toMatchObject({ done: true, attempts: 3, bestStars: 3 });
    const tomorrow = dailyFor('2027-03-10', 1);
    expect(dailyProgress(s, tomorrow.day)).toMatchObject({ done: false, attempts: 0 });
    expect(recordDaily(s, tomorrow, win).reward).toBe(tomorrow.reward);
    expect(s.stats.dailies).toBe(2);
  });
});

describe('daily raids through the engine', () => {
  it('lends the army: nothing of yours is spent, no loot or trophies change', () => {
    const s = newGame();
    s.army = { freshman: 7 };
    s.trophies = 200;
    const setup = dailySetup(s, '2027-03-09');
    expect(setup.kind).toBe('daily');
    expect(setup.heroes).toEqual({});
    expect(setup.army).toEqual(dailyFor('2027-03-09', 1).army);
    const { result } = playBot(setup, 0);
    const before = { tuition: s.resources.tuition, coffee: s.resources.coffee };
    const r = applyRaidOutcome(s, JSON.parse(JSON.stringify(setup)), result);
    expect(r.cancelled).toBe(false);
    expect(r.daily?.objectiveId).toBe(dailyFor('2027-03-09', 1).objectiveId);
    expect(r.daily?.passed).toBe(OBJECTIVES[r.daily!.objectiveId].met(result.metrics));
    expect(s.army).toEqual({ freshman: 7 });
    expect(s.trophies).toBe(200);
    expect({ tuition: s.resources.tuition, coffee: s.resources.coffee }).toEqual(before);
    expect(s.stats.raids).toBeUndefined();
    expect(s.daily.attempts).toBe(1);
  });

  it('ending before deploying is free and does not count as an attempt', () => {
    const s = newGame();
    const setup = dailySetup(s, '2027-03-09');
    const r = applyRaidOutcome(s, setup, replayRaid(setup, [{ t: 0, k: 'end' }]));
    expect(r.cancelled).toBe(true);
    expect(s.daily.attempts).toBe(0);
  });

  it('records the metrics objectives are judged on', () => {
    const setup = dailySetup(newGame(), '2027-03-09');
    const { result } = playBot(setup, 2);
    const m = result.metrics;
    expect(m.stars).toBe(result.stars);
    expect(m.destruction).toBe(result.destruction);
    expect(m.deployed).toBe(Object.values(setup.army).reduce((a, n) => a + (n ?? 0), 0));
    expect(m.standing).toBeLessThanOrEqual(m.deployed);
    expect(m.lootFrac).toBeGreaterThanOrEqual(0);
    expect(m.lootFrac).toBeLessThanOrEqual(1);
    if (m.dmcDeadAt >= 0) expect(result.stars).toBeGreaterThanOrEqual(1);
  });
});
