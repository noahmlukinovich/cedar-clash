// Lifetime stats and achievements.
// Each achievement is one row in ACHIEVEMENT_RULES: a test on the game state. Game code only
// records what happened (`bump`); it never needs to know which achievement that might earn.
// Unlocking pays the achievement's Chapel Credit reward. Shared by the browser and the server.
import { ACHIEVEMENTS, type AchievementId } from '../config/humor';
import type { StatKey } from '../config/types';
import { bus } from '../core/bus';
import { addRes } from './economy';
import type { GameState } from './state';

export function stat(s: GameState, key: StatKey): number {
  return s.stats[key] ?? 0;
}

/** Add to a lifetime counter, then unlock anything that counter now earns. */
export function bump(s: GameState, key: StatKey, n = 1): void {
  if (n === 0) return;
  s.stats[key] = stat(s, key) + n;
  checkAchievements(s);
}

const dmc = (s: GameState): number => s.buildings.find((b) => b.type === 'dmc')?.level ?? 1;

export const ACHIEVEMENT_RULES: Record<AchievementId, (s: GameState) => boolean> = {
  deanslist: (s) => stat(s, 'threeStars') >= 1,
  probation: (s) => stat(s, 'losses') >= 3,
  lakebridge: (s) => stat(s, 'lakesBuilt') >= 1,
  freshman15: (s) => stat(s, 'trained_freshman') >= 15,
  chapelregular: (s) => s.chapel.streak >= 3,
  ticketed: (s) => stat(s, 'tickets') >= 1,
  allnighter: (s) => stat(s, 'cast_allnighter') >= 1,
  dmc3: (s) => dmc(s) >= 3,
  dmc5: (s) => dmc(s) >= 5,
  dmc8: (s) => dmc(s) >= 8,
  popquiz: (s) => stat(s, 'popQuizzes') >= 1,
  ringbyspring: (s) => stat(s, 'ringWins') >= 1,
  windblown: (s) => stat(s, 'windWins') >= 1,
  elephant: (s) => stat(s, 'elephantRuns') >= 1,
  destroyer: (s) => stat(s, 'destroyed') >= 100,
  wallbreaker: (s) => stat(s, 'wallsByEngineers') >= 25,
  dailyfirst: (s) => stat(s, 'dailies') >= 1,
  dailyfive: (s) => stat(s, 'dailies') >= 5,
  climber: (s) => s.bestTrophies >= 700,
};

const IDS = Object.keys(ACHIEVEMENT_RULES) as AchievementId[];

/** Unlock (and pay for) every achievement whose rule now holds. Returns the new ones. */
export function checkAchievements(s: GameState): AchievementId[] {
  const got: AchievementId[] = [];
  for (const id of IDS) {
    if (s.achievements[id] || !ACHIEVEMENT_RULES[id](s)) continue;
    s.achievements[id] = true;
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (a) addRes(s, 'chapel', a.reward);
    got.push(id);
    bus.emit('achievement', id);
  }
  return got;
}
