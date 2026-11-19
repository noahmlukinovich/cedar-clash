import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from '../src/config/humor';
import { bus } from '../src/core/bus';
import { ACHIEVEMENT_RULES, bump, checkAchievements } from '../src/game/achievements';
import { buildNew } from '../src/game/economy';
import { type GameState, newGame } from '../src/game/state';
import type { RaidResult } from '../src/raid/engine';
import { applyRaidOutcome, localSetup } from '../src/raid/outcome';

const rich = (): GameState => {
  const s = newGame();
  s.resources = { tuition: 1e6, coffee: 1e6, chapel: 0 };
  return s;
};

describe('achievements', () => {
  it('has a rule for every achievement and vice versa', () => {
    expect(Object.keys(ACHIEVEMENT_RULES).sort()).toEqual(ACHIEVEMENTS.map((a) => a.id).sort());
  });

  it('a fresh campus has earned nothing', () => {
    expect(checkAchievements(newGame())).toEqual([]);
  });

  it('unlocks from counters once, pays the reward, and announces it', () => {
    const s = newGame();
    const heard: string[] = [];
    bus.on('achievement', (id) => heard.push(id));
    const chapel = s.resources.chapel;
    bump(s, 'trained_freshman', 14);
    expect(s.achievements.freshman15).toBeUndefined();
    bump(s, 'trained_freshman');
    expect(s.achievements.freshman15).toBe(true);
    expect(s.resources.chapel).toBe(chapel + ACHIEVEMENTS.find((a) => a.id === 'freshman15')!.reward);
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

  it('raid results feed the counters behind the raid achievements', () => {
    const s = newGame();
    const setup = localSetup(s, 'campaign', () => 0.5);
    const r: RaidResult = {
      stars: 3,
      destruction: 1,
      loot: { tuition: 0, coffee: 0 },
      usedTroops: { freshman: 1 },
      usedSpells: { allnighter: 1 },
      heroHp: {},
      abilities: ['prof'],
      buildingsDestroyed: 12,
      wallsByEngineers: 0,
      windSurvived: true,
      deployedAny: true,
      ticks: 100,
      metrics: { stars: 3, destruction: 1, dmcDeadAt: 3, deployed: 1, standing: 1, defensesLeft: 0, lootFrac: 1 },
    };
    applyRaidOutcome(s, setup, r);
    expect(s.stats).toMatchObject({ raids: 1, wins: 1, threeStars: 1, cast_allnighter: 1, popQuizzes: 1, windWins: 1, destroyed: 12 });
    expect(s.achievements).toMatchObject({ deanslist: true, allnighter: true, popquiz: true, windblown: true });
  });
});
