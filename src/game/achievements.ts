// Lifetime stats and achievements.
// Every achievement is one row here: a rule over the game state. Game code only
// records what happened (`bump`); nothing else needs to know which achievement
// that might unlock.
import type { AchievementId } from '../config/humor';
import type { StatKey } from '../config/types';
import { bus } from '../core/bus';
import type { GameState } from './state';

export function stat(s: GameState, key: StatKey): number {
  return s.stats[key] ?? 0;
}

/** Add to a lifetime counter, then unlock anything that counter earns. */
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

/** Unlock every achievement whose rule now holds. Returns the newly unlocked ids. */
export function checkAchievements(s: GameState): AchievementId[] {
  const got: AchievementId[] = [];
  for (const id of IDS) {
    if (s.achievements[id] || !ACHIEVEMENT_RULES[id](s)) continue;
    s.achievements[id] = true;
    got.push(id);
    bus.emit('achievement', id);
  }
  return got;
}
