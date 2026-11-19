// Daily Challenge: one seeded raid per day, the same for everyone at the same DMC level.
// The army is lent (yours is not spent), there is no loot and no trophy change, and it can be
// retried freely. Meeting the day's objective pays Chapel Credits once per day.
//
// Days are UTC calendar days, so the browser and the server always agree on which challenge
// is current. Shared by both: no DOM here.
import { DAILY_ARMY_HOUSING, DAILY_BASE_STRENGTH, DAILY_REWARD_BASE, DAILY_REWARD_PER_DMC, MAX_DMC } from '../config/balance';
import { DAILY_TITLES } from '../config/humor';
import { TROOPS, TROOP_ORDER } from '../config/troops';
import type { SpellType, TroopType } from '../config/types';
import { Rng } from '../core/rng';
import { ARCHETYPES, type BaseLayout, generateBase } from '../raid/basegen';
import { bump } from './achievements';
import { addRes } from './economy';
import type { GameState } from './state';

/** What a finished daily raid is judged on. Computed by the raid engine. */
export interface DailyMetrics {
  stars: number;
  destruction: number; // 0..1
  dmcDeadAt: number; // seconds into the raid, or -1 if it survived
  deployed: number; // troops and heroes sent in
  standing: number; // of those, still on their feet at the end
  defensesLeft: number;
  lootFrac: number; // 0..1 of the loot on offer
}

export type ObjectiveId = 'stars2' | 'wreck' | 'dmcrush' | 'disarm' | 'survivors' | 'heist';

export interface Objective {
  name: string;
  desc: string;
  met: (r: DailyMetrics) => boolean;
  /** Short live readout for the raid HUD. */
  progress: (r: DailyMetrics) => string;
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
    desc: 'Win (1+ star) with at least a quarter of your troops still standing.',
    met: (r) => r.stars >= 1 && r.deployed > 0 && r.standing * 4 >= r.deployed,
    progress: (r) => `${r.standing}/${r.deployed} standing`,
  },
  heist: {
    name: 'Tuition Refund',
    desc: 'Carry off at least 60% of the loot on offer.',
    met: (r) => r.lootFrac >= 0.6,
    progress: (r) => `${pct(r.lootFrac)} / 60% looted`,
  },
};
const OBJECTIVE_IDS = Object.keys(OBJECTIVES) as ObjectiveId[];

/** Army recipes: share of the housing budget per troop, and the DMC level that unlocks the recipe. */
const RECIPES: { minDmc: number; mix: Partial<Record<TroopType, number>> }[] = [
  { minDmc: 1, mix: { freshman: 1 } },
  { minDmc: 2, mix: { freshman: 0.6, engineer: 0.4 } },
  { minDmc: 2, mix: { athlete: 0.5, freshman: 0.5 } },
  { minDmc: 3, mix: { athlete: 0.4, freshman: 0.3, theology: 0.3 } },
  { minDmc: 3, mix: { athlete: 0.35, freshman: 0.3, engineer: 0.15, nurse: 0.2 } },
  { minDmc: 3, mix: { runner: 0.5, music: 0.2, freshman: 0.3 } },
  { minDmc: 4, mix: { ra: 0.3, business: 0.3, freshman: 0.4 } },
  { minDmc: 4, mix: { goteam: 0.4, athlete: 0.3, freshman: 0.3 } },
  { minDmc: 4, mix: { rock: 0.3, engineer: 0.2, freshman: 0.5 } },
  { minDmc: 7, mix: { senior: 0.35, athlete: 0.25, freshman: 0.4 } },
  { minDmc: 7, mix: { thesis: 0.3, nurse: 0.1, engineer: 0.2, freshman: 0.4 } },
  { minDmc: 8, mix: { rock: 0.25, thesis: 0.25, music: 0.15, freshman: 0.35 } },
];

export interface DailyChallenge {
  day: string;
  seed: number;
  dmc: number;
  title: string;
  objectiveId: ObjectiveId;
  army: Partial<Record<TroopType, number>>;
  spells: Partial<Record<SpellType, number>>;
  /** Every lent troop is this level (the most your DMC allows), whatever you have researched. */
  troopLevel: number;
  reward: number;
}

/** FNV-1a, so a date string becomes a well-mixed seed. */
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0 || 1;
}

/** UTC calendar day, e.g. "2026-03-09". */
export function dayKey(ms = Date.now()): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Milliseconds until the next challenge (UTC midnight). */
export function msUntilNextDaily(ms = Date.now()): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - ms;
}

export function dailyFor(day: string, dmcLevel: number): DailyChallenge {
  const dmc = Math.max(1, Math.min(MAX_DMC, Math.round(dmcLevel)));
  // The objective and title depend only on the date; the army and base also on the DMC level.
  const dayRng = new Rng(hashString(day));
  const objectiveId = dayRng.pick(OBJECTIVE_IDS);
  const title = dayRng.pick(DAILY_TITLES);
  const seed = hashString(`${day}#${dmc}`);
  const rng = new Rng(seed);

  const recipe = rng.pick(RECIPES.filter((r) => r.minDmc <= dmc));
  const budget = DAILY_ARMY_HOUSING[dmc];
  const army: Partial<Record<TroopType, number>> = {};
  let used = 0;
  for (const t of TROOP_ORDER) {
    const share = recipe.mix[t];
    if (!share || t === 'freshman') continue;
    const n = Math.max(1, Math.floor((budget * share) / TROOPS[t].housing));
    army[t] = n;
    used += n * TROOPS[t].housing;
  }
  army.freshman = Math.max(4, budget - used); // freshmen (1 housing each) fill whatever is left

  const spells: Partial<Record<SpellType, number>> = {};
  if (dmc >= 3) spells.allnighter = 1;
  if (dmc >= 5) spells.snowday = 1;
  if (dmc >= 8) spells.syllabus = 1;

  return {
    day,
    seed,
    dmc,
    title,
    objectiveId,
    army,
    spells,
    troopLevel: Math.max(1, Math.min(7, dmc)),
    reward: DAILY_REWARD_BASE + DAILY_REWARD_PER_DMC * dmc,
  };
}

/** The rival campus for a challenge. Always the same layout for the same challenge. */
export function dailyBase(c: DailyChallenge): BaseLayout {
  const rng = new Rng(c.seed ^ 0x5bd1e995);
  const base = generateBase({ dmc: c.dmc, seed: c.seed, strength: DAILY_BASE_STRENGTH, archetype: rng.pick(ARCHETYPES) });
  base.name = c.title;
  base.tagline = `Daily Challenge · ${OBJECTIVES[c.objectiveId].name}`;
  base.trophiesWin = 0;
  base.trophiesLose = 0;
  return base;
}

/** Today's progress, treating a stored record from another day as blank. */
export function dailyProgress(s: GameState, day = dayKey()): GameState['daily'] {
  return s.daily.day === day ? s.daily : { day, done: false, attempts: 0, bestStars: 0 };
}

/** Record a finished attempt. Pays the reward the first time the objective is met that day. */
export function recordDaily(s: GameState, c: DailyChallenge, m: DailyMetrics): { passed: boolean; reward: number } {
  const d = { ...dailyProgress(s, c.day) };
  d.attempts++;
  d.bestStars = Math.max(d.bestStars, m.stars);
  const passed = OBJECTIVES[c.objectiveId].met(m);
  let reward = 0;
  if (passed && !d.done) {
    d.done = true;
    reward = addRes(s, 'chapel', c.reward);
  }
  s.daily = d;
  if (reward > 0) bump(s, 'dailies');
  return { passed, reward };
}
