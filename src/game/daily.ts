// Daily Challenge: one seeded raid per calendar day, the same for everyone at
// the same DMC level. The army is lent (yours is not spent), there is no loot
// and no trophies, and it can be retried freely. Meeting the day's objective
// pays Chapel Credits once.
import { DAILY_ARMY_HOUSING, DAILY_BASE_STRENGTH, DAILY_REWARD_BASE, DAILY_REWARD_PER_DMC, MAX_DMC } from '../config/balance';
import { DAILY_TITLES } from '../config/humor';
import { TROOPS } from '../config/troops';
import type { SpellType, TroopType } from '../config/types';
import { Rng } from '../core/rng';
import { ARCHETYPES, type BaseLayout, generateBase } from '../raid/basegen';
import { bump } from './achievements';
import { addRes } from './economy';
import type { GameState } from './state';

/** What a finished daily raid is judged on. */
export interface DailyResult {
  stars: number;
  destruction: number; // 0..1
  dmcDeadAt: number; // seconds into the raid, or -1 if it survived
  deployed: number;
  lost: number;
  defensesLeft: number;
  lootFrac: number; // 0..1 of the loot on offer
}

export type ObjectiveId = 'stars2' | 'wreck' | 'dmcrush' | 'disarm' | 'survivors' | 'heist';

export interface Objective {
  name: string;
  desc: string;
  met: (r: DailyResult) => boolean;
  /** Short live readout for the raid HUD. */
  progress: (r: DailyResult) => string;
}

const pct = (v: number): string => `${Math.floor(v * 100)}%`;

export const OBJECTIVES: Record<ObjectiveId, Objective> = {
  stars2: {
    name: 'Honor Roll',
    desc: 'Earn at least 2 stars.',
    met: (r) => r.stars >= 2,
    progress: (r) => `${r.stars}/2 stars`,
  },
  wreck: {
    name: 'Demolition Derby',
    desc: 'Reach 70% destruction.',
    met: (r) => r.destruction >= 0.7,
    progress: (r) => `${pct(r.destruction)} / 70%`,
  },
  dmcrush: {
    name: 'Fire Drill',
    desc: 'Destroy the DMC within 75 seconds of your first deployment.',
    met: (r) => r.dmcDeadAt >= 0 && r.dmcDeadAt <= 75,
    progress: (r) => (r.dmcDeadAt >= 0 ? `DMC down at ${Math.ceil(r.dmcDeadAt)}s` : 'DMC still standing'),
  },
  disarm: {
    name: 'Quiet Hours',
    desc: 'Destroy every defense building.',
    met: (r) => r.defensesLeft === 0,
    progress: (r) => `${r.defensesLeft} defense${r.defensesLeft === 1 ? '' : 's'} left`,
  },
  survivors: {
    name: 'Group Project',
    desc: 'Win (1+ star) with at least a third of your troops still standing.',
    met: (r) => r.stars >= 1 && r.deployed > 0 && (r.deployed - r.lost) * 3 >= r.deployed,
    progress: (r) => `${r.deployed - r.lost}/${r.deployed} standing`,
  },
  heist: {
    name: 'Tuition Refund',
    desc: 'Carry off at least 60% of the loot on offer.',
    met: (r) => r.lootFrac >= 0.6,
    progress: (r) => `${pct(r.lootFrac)} / 60% looted`,
  },
};
const OBJECTIVE_IDS = Object.keys(OBJECTIVES) as ObjectiveId[];

/** Army recipes: share of the housing budget per troop, and the DMC that unlocks the recipe. */
const RECIPES: { minDmc: number; mix: Partial<Record<TroopType, number>> }[] = [
  { minDmc: 1, mix: { freshman: 1 } },
  { minDmc: 2, mix: { freshman: 0.6, engineer: 0.4 } },
  { minDmc: 2, mix: { athlete: 0.5, freshman: 0.5 } },
  { minDmc: 3, mix: { athlete: 0.4, freshman: 0.3, theology: 0.3 } },
  { minDmc: 3, mix: { athlete: 0.35, freshman: 0.3, engineer: 0.15, nurse: 0.2 } },
];

export interface DailyChallenge {
  day: string;
  seed: number;
  dmc: number;
  title: string;
  objectiveId: ObjectiveId;
  objective: Objective;
  army: Partial<Record<TroopType, number>>;
  spells: Partial<Record<SpellType, number>>;
  /** Every lent troop is this level, whatever you have researched. */
  troopLevel: number;
  reward: number;
}

/** FNV-1a, so a date string becomes a well-mixed seed. */
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0 || 1;
}

/** Local calendar day, e.g. "2026-03-09". */
export function dayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dailyFor(day: string, dmcLevel: number): DailyChallenge {
  const dmc = Math.max(1, Math.min(MAX_DMC, Math.round(dmcLevel)));
  // The objective and title depend only on the date; the army and base also on DMC.
  const dayRng = new Rng(hashString(day));
  const objectiveId = dayRng.pick(OBJECTIVE_IDS);
  const title = dayRng.pick(DAILY_TITLES);
  const seed = hashString(`${day}#${dmc}`);
  const rng = new Rng(seed);

  const recipe = rng.pick(RECIPES.filter((r) => r.minDmc <= dmc));
  const budget = DAILY_ARMY_HOUSING[dmc];
  const army: Partial<Record<TroopType, number>> = {};
  let used = 0;
  for (const [t, share] of Object.entries(recipe.mix) as [TroopType, number][]) {
    if (t === 'freshman') continue;
    const n = Math.max(1, Math.floor((budget * share) / TROOPS[t].housing));
    army[t] = n;
    used += n * TROOPS[t].housing;
  }
  army.freshman = Math.max(4, budget - used); // freshmen (1 housing each) fill whatever is left

  const spells: Partial<Record<SpellType, number>> = {};
  if (dmc >= 3) spells.allnighter = 1;
  if (dmc >= 5) spells.snowday = 1;

  return {
    day,
    seed,
    dmc,
    title,
    objectiveId,
    objective: OBJECTIVES[objectiveId],
    army,
    spells,
    troopLevel: Math.max(1, Math.min(5, dmc - 1)),
    reward: DAILY_REWARD_BASE + DAILY_REWARD_PER_DMC * dmc,
  };
}

/** The rival campus for a challenge. Always the same layout for the same challenge. */
export function dailyBase(c: DailyChallenge): BaseLayout {
  const rng = new Rng(c.seed ^ 0x5bd1e995);
  const base = generateBase({ dmc: c.dmc, seed: c.seed, strength: DAILY_BASE_STRENGTH, archetype: rng.pick(ARCHETYPES) });
  base.name = c.title;
  base.tagline = `Daily Challenge · ${c.objective.name}`;
  base.trophiesWin = 0;
  base.trophiesLose = 0;
  return base;
}

/** Today's progress, treating a stored record from another day as blank. */
export function dailyProgress(s: GameState, day = dayKey()): GameState['daily'] {
  return s.daily.day === day ? s.daily : { day, done: false, attempts: 0, bestStars: 0 };
}

/** Record a finished attempt. Pays the reward the first time the objective is met that day. */
export function recordDaily(s: GameState, c: DailyChallenge, r: DailyResult): { passed: boolean; reward: number } {
  const d = { ...dailyProgress(s, c.day) };
  d.attempts++;
  d.bestStars = Math.max(d.bestStars, r.stars);
  const passed = c.objective.met(r);
  let reward = 0;
  if (passed && !d.done) {
    d.done = true;
    reward = addRes(s, 'chapel', c.reward);
    s.daily = d;
    bump(s, 'dailies');
  }
  s.daily = d;
  return { passed, reward };
}
