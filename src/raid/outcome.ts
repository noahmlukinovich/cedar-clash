// Applies a finished raid to the attacker's GameState. Shared by the offline client and
// the server (which runs it on the verified replay result).
import { THREE_STAR_CHAPEL } from '../config/balance';
import type { HeroType, SpellType, TroopType } from '../config/types';
import { fillArmy, heroAvailable } from '../game/army';
import { bump, checkAchievements } from '../game/achievements';
import { addRes, dmcLevel, hasEvent } from '../game/economy';
import type { GameState } from '../game/state';
import { type DailyChallenge, type ObjectiveId, dailyBase, dailyFor, dayKey, recordDaily } from '../game/daily';
import { type Archetype, generateBase, rivalStateU } from './basegen';
import { baseForMatchup, findRival } from './matchmaking';
import type { RaidKind, RaidResult, RaidSetup } from './engine';

export interface RaidOutcome {
  win: boolean;
  stars: number;
  destruction: number;
  tuition: number;
  coffee: number;
  gotT: number;
  gotC: number;
  trophyDelta: number;
  chapel: number;
  cancelled: boolean;
  /** Daily Challenge raids only. */
  daily?: { objectiveId: ObjectiveId; passed: boolean; reward: number };
}

/** Builds the setup for a raid against a computer-generated campus. */
export function localSetup(s: GameState, kind: 'campaign' | 'random' | 'elephant', rand: () => number = Math.random): RaidSetup {
  const dl = dmcLevel(s);
  let base;
  if (kind === 'campaign') base = rivalStateU();
  else if (kind === 'random') {
    // Matched to trophies: see src/raid/matchmaking.ts.
    const m = findRival(s.trophies, dl, rand, s.lastRival as Archetype | undefined);
    s.lastRival = m.archetype;
    base = baseForMatchup(m);
  } else {
    base = generateBase({ dmc: dl, seed: 1 + Math.floor(rand() * 0x7ffffffe), strength: 0.4 });
    base.name = `Elephant Run vs ${base.name}`;
    base.loot.tuition = Math.round(base.loot.tuition * 1.5);
    base.loot.coffee = Math.round(base.loot.coffee * 1.5);
  }
  return {
    kind,
    base,
    seed: (rand() * 2 ** 31) | 0,
    wind: rand() < 0.35,
    ringBySpring: hasEvent(s, 'ringbyspring'),
    troopLevels: { ...s.troopLevels },
    heroLevels: { prof: s.heroes.prof.level, president: s.heroes.president.level },
    heroes: Object.fromEntries((['prof', 'president'] as HeroType[]).filter((h) => heroAvailable(s, h)).map((h) => [h, s.heroes[h].hpFrac])),
    army: { ...s.army },
    spells: { ...s.spells },
  };
}

/** The challenge a daily setup was built for. */
export function challengeOf(setup: RaidSetup): DailyChallenge | null {
  return setup.daily ? dailyFor(setup.daily.day, setup.daily.dmc) : null;
}

/**
 * Builds today's Daily Challenge raid. The campus, the dice and the lent army are fixed by the
 * day and the player's DMC level, so every attempt (and every player at that level) gets the same raid.
 */
export function dailySetup(s: GameState, day = dayKey()): RaidSetup {
  const c = dailyFor(day, dmcLevel(s));
  const troopLevels = Object.fromEntries(Object.keys(s.troopLevels).map((t) => [t, c.troopLevel])) as Record<TroopType, number>;
  return {
    kind: 'daily',
    base: dailyBase(c),
    seed: c.seed,
    wind: false,
    ringBySpring: false,
    troopLevels,
    heroLevels: { prof: s.heroes.prof.level, president: s.heroes.president.level },
    heroes: {},
    army: { ...c.army },
    spells: { ...c.spells },
    daily: { day: c.day, dmc: c.dmc },
  };
}

export function trophyDelta(setup: RaidSetup, stars: number): number {
  const win = stars > 0;
  let d = win ? Math.round((setup.base.trophiesWin * (1 + stars)) / 4) : -setup.base.trophiesLose;
  if (setup.kind === 'elephant') d = Math.max(0, d);
  return d;
}

export function applyRaidOutcome(s: GameState, setup: RaidSetup, r: RaidResult): RaidOutcome {
  const none: RaidOutcome = { win: false, stars: 0, destruction: 0, tuition: 0, coffee: 0, gotT: 0, gotC: 0, trophyDelta: 0, chapel: 0, cancelled: true };
  // Ending a raid before deploying anything is free.
  if (!r.deployedAny) return none;
  const challenge = challengeOf(setup);
  if (setup.kind === 'daily' && challenge) {
    // A practice raid with a lent army: only the objective counts. No loot, trophies or troops spent.
    const d = recordDaily(s, challenge, r.metrics);
    s.lastRaidClock = s.clock;
    return { ...none, cancelled: false, win: d.passed, stars: r.stars, destruction: r.destruction, chapel: d.reward, daily: { objectiveId: challenge.objectiveId, ...d } };
  }
  for (const [t, n] of Object.entries(r.usedTroops) as [TroopType, number][]) s.army[t] = Math.max(0, (s.army[t] ?? 0) - n);
  for (const [t, n] of Object.entries(r.usedSpells) as [SpellType, number][]) s.spells[t] = Math.max(0, (s.spells[t] ?? 0) - n);
  for (const [h, hp] of Object.entries(r.heroHp) as [HeroType, number][]) s.heroes[h].hpFrac = hp;
  for (const [sp, n] of Object.entries(r.usedSpells) as [SpellType, number][]) bump(s, `cast_${sp}`, n);
  if (r.abilities.includes('prof')) bump(s, 'popQuizzes');

  const stars = r.stars;
  const win = stars > 0;
  const tuition = r.loot.tuition + (r.bonus?.tuition ?? 0);
  const coffee = r.loot.coffee + (r.bonus?.coffee ?? 0);
  const gotT = addRes(s, 'tuition', tuition);
  const gotC = addRes(s, 'coffee', coffee);
  const td = trophyDelta(setup, stars);
  s.trophies = Math.max(0, s.trophies + td);
  s.bestTrophies = Math.max(s.bestTrophies, s.trophies);
  let chapel = 0;
  if (stars === 3) {
    chapel = THREE_STAR_CHAPEL;
    addRes(s, 'chapel', chapel);
    bump(s, 'threeStars');
  }
  s.lastRaidClock = s.clock;
  bump(s, 'raids');
  bump(s, 'destroyed', r.buildingsDestroyed);
  bump(s, 'wallsByEngineers', r.wallsByEngineers);
  if (win) bump(s, 'wins');
  else bump(s, 'losses');
  if (win && setup.ringBySpring) bump(s, 'ringWins');
  if (win && r.windSurvived) bump(s, 'windWins');
  if (setup.kind === 'elephant') {
    bump(s, 'elephantRuns');
    s.events = s.events.filter((e) => e.type !== 'elephantrun');
  }
  if (setup.kind === 'campaign' && win) s.campaignDone = true;
  checkAchievements(s); // trophy milestones
  fillArmy(s); // the reserve army moves into the space the raid just freed
  return { win, stars, destruction: r.destruction, tuition, coffee, gotT, gotC, trophyDelta: td, chapel, cancelled: false };
}
