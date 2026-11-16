import { describe, expect, it } from 'vitest';
import { DAILY_REWARD_BASE, DAILY_REWARD_PER_DMC } from '../src/config/balance';
import { ACHIEVEMENTS } from '../src/config/humor';
import { TROOPS } from '../src/config/troops';
import { bus } from '../src/core/bus';
import { ACHIEVEMENT_RULES, bump, checkAchievements } from '../src/game/achievements';
import { cancelTrain, train } from '../src/game/army';
import { type DailyResult, OBJECTIVES, dailyBase, dailyFor, dailyProgress, recordDaily } from '../src/game/daily';
import { addRes, buildNew, builders, caps, dmcLevel, startUpgrade, tickEconomy } from '../src/game/economy';
import { type GameState, newGame } from '../src/game/state';
import { generateBase } from '../src/raid/basegen';
import { settleRaid } from '../src/raid/raidResults';
import { RaidSim } from '../src/raid/sim';
import { footprint, simOptions } from './helpers';

const rich = (): GameState => {
  const s = newGame();
  s.resources = { tuition: 1e6, coffee: 1e6, chapel: 1e6 };
  return s;
};

describe('economy', () => {
  it('caps and builder counts follow the campus as it changes', () => {
    const s = rich();
    const before = caps(s).tuition;
    expect(builders(s)).toEqual({ total: 2, busy: 0 });
    const reg = s.buildings.find((b) => b.type === 'registrar')!;
    expect(startUpgrade(s, reg)).toBeNull();
    expect(builders(s).busy).toBe(1); // cached totals were refreshed by the upgrade
    s.clock += 1e6;
    tickEconomy(s, 0);
    expect(reg.level).toBe(2);
    expect(caps(s).tuition).toBeGreaterThan(before);
    expect(builders(s).busy).toBe(0);
  });

  it('never stores more than the cap', () => {
    const s = newGame();
    const cap = caps(s).tuition;
    expect(addRes(s, 'tuition', 1e9)).toBe(cap - 1500);
    expect(s.resources.tuition).toBe(cap);
  });

  it('refuses to build past the DMC limit or on occupied ground', () => {
    const s = rich();
    const dmc = s.buildings.find((b) => b.type === 'dmc')!;
    expect(typeof buildNew(s, 'wall', dmc.x, dmc.y)).toBe('string');
    expect(typeof buildNew(s, 'presidents', 5, 5)).toBe('string'); // needs DMC 5
    expect(typeof buildNew(s, 'wall', 5, 5)).toBe('object');
    expect(dmcLevel(s)).toBe(1);
  });

  it('cancelling training refunds what was paid, not the current price', () => {
    const s = newGame();
    s.resources.coffee = 1000;
    s.army = {};
    expect(train(s, 'freshman')).toBeNull();
    const paid = 1000 - s.resources.coffee;
    expect(paid).toBe(TROOPS.freshman.levels[0].cost);
    s.troopLevels.freshman = 3; // research finishes while it is queued
    cancelTrain(s, 0);
    expect(s.resources.coffee).toBe(1000);
  });
});

describe('achievements', () => {
  it('has a rule for every achievement and vice versa', () => {
    expect(Object.keys(ACHIEVEMENT_RULES).sort()).toEqual(ACHIEVEMENTS.map((a) => a.id).sort());
  });

  it('a fresh campus has earned nothing', () => {
    expect(checkAchievements(newGame())).toEqual([]);
  });

  it('unlocks from counters, once, and announces it', () => {
    const s = newGame();
    const heard: string[] = [];
    bus.on('achievement', (id) => heard.push(id));
    bump(s, 'trained_freshman', 14);
    expect(s.achievements.freshman15).toBeUndefined();
    bump(s, 'trained_freshman');
    expect(s.achievements.freshman15).toBe(true);
    bump(s, 'trained_freshman', 50);
    expect(heard.filter((h) => h === 'freshman15')).toHaveLength(1);
  });

  it('unlocks from state that is not a counter', () => {
    const s = newGame();
    s.buildings.find((b) => b.type === 'dmc')!.level = 5;
    s.bestTrophies = 700;
    s.chapel.streak = 3;
    expect(checkAchievements(s).sort()).toEqual(['chapelregular', 'climber', 'dmc3', 'dmc5']);
  });

  it('the starting lake does not count as placing one', () => {
    const s = rich();
    expect(s.achievements.lakebridge).toBeUndefined();
    expect(typeof buildNew(s, 'lake', 5, 5)).toBe('object');
    expect(s.achievements.lakebridge).toBe(true);
  });
});

describe('daily challenge', () => {
  const none: DailyResult = { stars: 0, destruction: 0, dmcDeadAt: -1, deployed: 10, lost: 10, defensesLeft: 3, lootFrac: 0 };

  it('is the same for everyone on the same day and DMC, and changes daily', () => {
    expect(dailyFor('2027-03-09', 3)).toEqual(dailyFor('2027-03-09', 3));
    expect(dailyBase(dailyFor('2027-03-09', 3))).toEqual(dailyBase(dailyFor('2027-03-09', 3)));
    const days = new Set<string>();
    const objectives = new Set<string>();
    for (let d = 1; d <= 28; d++) {
      const c = dailyFor(`2027-02-${String(d).padStart(2, '0')}`, 3);
      days.add(JSON.stringify(dailyBase(c).pieces));
      objectives.add(c.objectiveId);
    }
    expect(days.size).toBe(28);
    expect(objectives.size).toBe(Object.keys(OBJECTIVES).length);
  });

  it('shares the objective across DMC levels but scales the army, base and reward', () => {
    const lo = dailyFor('2027-03-09', 1);
    const hi = dailyFor('2027-03-09', 6);
    expect(lo.objectiveId).toBe(hi.objectiveId);
    expect(lo.title).toBe(hi.title);
    expect(lo.reward).toBe(DAILY_REWARD_BASE + DAILY_REWARD_PER_DMC);
    expect(hi.reward).toBeGreaterThan(lo.reward);
    const housing = (c: typeof lo): number => Object.entries(c.army).reduce((a, [t, n]) => a + TROOPS[t as keyof typeof TROOPS].housing * n!, 0);
    expect(housing(hi)).toBeGreaterThan(housing(lo) * 3);
    expect(dailyBase(hi).dmc).toBe(6);
    expect(lo.spells).toEqual({});
  });

  it('only lends troops, and every daily base is legal', () => {
    for (let dmc = 1; dmc <= 6; dmc++) {
      for (let d = 1; d <= 28; d++) {
        const c = dailyFor(`2027-05-${String(d).padStart(2, '0')}`, dmc);
        for (const [t, n] of Object.entries(c.army)) {
          expect(TROOPS[t as keyof typeof TROOPS]).toBeDefined();
          expect(n).toBeGreaterThan(0);
        }
        expect(() => footprint(dailyBase(c))).not.toThrow();
      }
    }
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
    expect(OBJECTIVES.survivors.met({ ...none, stars: 1, lost: 6 })).toBe(true);
    expect(OBJECTIVES.survivors.met({ ...none, stars: 1, lost: 7 })).toBe(false);
    expect(OBJECTIVES.survivors.met({ ...none, stars: 0, lost: 0 })).toBe(false);
    expect(OBJECTIVES.heist.met({ ...none, lootFrac: 0.6 })).toBe(true);
  });

  it('pays Chapel Credits once per day, then again the next day', () => {
    const s = newGame();
    const c = dailyFor('2027-03-09', 1);
    const win: DailyResult = { stars: 3, destruction: 1, dmcDeadAt: 20, deployed: 10, lost: 0, defensesLeft: 0, lootFrac: 1 };
    const start = s.resources.chapel;

    expect(recordDaily(s, c, none)).toEqual({ passed: false, reward: 0 });
    expect(dailyProgress(s, c.day)).toMatchObject({ done: false, attempts: 1 });
    expect(s.resources.chapel).toBe(start);

    expect(recordDaily(s, c, win)).toEqual({ passed: true, reward: c.reward });
    expect(s.resources.chapel).toBe(start + c.reward);
    expect(s.achievements.dailyfirst).toBe(true);

    expect(recordDaily(s, c, win)).toEqual({ passed: true, reward: 0 });
    expect(s.resources.chapel).toBe(start + c.reward);
    expect(dailyProgress(s, c.day)).toMatchObject({ done: true, attempts: 3, bestStars: 3 });

    const tomorrow = dailyFor('2027-03-10', 1);
    expect(dailyProgress(s, tomorrow.day)).toMatchObject({ done: false, attempts: 0 });
    expect(recordDaily(s, tomorrow, win).reward).toBe(tomorrow.reward);
    expect(s.stats.dailies).toBe(2);
  });
});

describe('settleRaid', () => {
  const wonSim = (): RaidSim => {
    const sim = new RaidSim(generateBase({ dmc: 1, seed: 3, archetype: 'fortress' }), simOptions());
    for (const b of sim.buildings) sim.damageBuilding(b, 1e9);
    return sim;
  };

  it('a ranked 3-star win banks loot, trophies, credits and stats', () => {
    const s = newGame();
    const sim = wonSim();
    const r = settleRaid(s, sim, sim.base, 'random');
    expect(r).toMatchObject({ win: true, stars: 3, trophyDelta: sim.base.trophiesWin, chapel: 10 });
    expect(s.trophies).toBe(sim.base.trophiesWin);
    expect(s.resources.tuition).toBeGreaterThan(1500);
    expect(r.gotT).toBeLessThanOrEqual(r.tuition); // storage cap may leave some behind
    expect(s.stats).toMatchObject({ raids: 1, wins: 1, threeStars: 1 });
    expect(s.achievements.deanslist).toBe(true);
  });

  it('a loss costs trophies but never goes below zero', () => {
    const s = newGame();
    s.trophies = 4;
    const sim = new RaidSim(generateBase({ dmc: 1, seed: 3 }), simOptions());
    const r = settleRaid(s, sim, sim.base, 'random');
    expect(r.win).toBe(false);
    expect(r.trophyDelta).toBeLessThan(0);
    expect(s.trophies).toBe(0);
    expect(s.stats.losses).toBe(1);
  });

  it('a daily raid touches nothing but the daily record', () => {
    const s = newGame();
    const c = dailyFor('2027-03-09', 1);
    const sim = wonSim();
    const before = JSON.stringify({ r: { ...s.resources, chapel: 0 }, t: s.trophies, army: s.army });
    const r = settleRaid(s, sim, sim.base, 'daily', { daily: c });
    expect(r.trophyDelta).toBe(0);
    expect(r.gotT).toBe(0);
    expect(r.daily?.passed).toBe(c.objective.met({ stars: 3, destruction: 1, dmcDeadAt: sim.dmcDeadAt, deployed: 0, lost: 0, defensesLeft: 0, lootFrac: 1 }));
    expect(JSON.stringify({ r: { ...s.resources, chapel: 0 }, t: s.trophies, army: s.army })).toBe(before);
    expect(s.stats.raids).toBeUndefined();
    expect(s.stats.threeStars).toBeUndefined();
  });
});
