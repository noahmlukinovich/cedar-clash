// Applies a finished raid to the attacker's GameState. Shared by the offline client and
// the server (which runs it on the verified replay result).
import { THREE_STAR_CHAPEL } from '../config/balance';
import type { HeroType, SpellType, TroopType } from '../config/types';
import { heroAvailable } from '../game/army';
import { addRes, bump, dmcLevel, hasEvent, unlock } from '../game/economy';
import type { GameState } from '../game/state';
import { generateBase, rivalStateU } from './basegen';
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
}

/** Builds the setup for a raid against a computer-generated campus. */
export function localSetup(s: GameState, kind: Exclude<RaidKind, 'player'>, rand: () => number = Math.random): RaidSetup {
  const dl = dmcLevel(s);
  const base = kind === 'campaign' ? rivalStateU() : generateBase(Math.max(1, Math.min(6, dl + (rand() < 0.25 ? 1 : 0) - (rand() < 0.2 ? 1 : 0))), (rand() * 1e9) | 0);
  if (kind === 'elephant') {
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

export function trophyDelta(setup: RaidSetup, stars: number): number {
  const win = stars > 0;
  let d = win ? Math.round((setup.base.trophiesWin * (1 + stars)) / 4) : -setup.base.trophiesLose;
  if (setup.kind === 'elephant') d = Math.max(0, d);
  return d;
}

export function applyRaidOutcome(s: GameState, setup: RaidSetup, r: RaidResult): RaidOutcome {
  // Ending a raid before deploying anything is free.
  if (!r.deployedAny) {
    return { win: false, stars: 0, destruction: 0, tuition: 0, coffee: 0, gotT: 0, gotC: 0, trophyDelta: 0, chapel: 0, cancelled: true };
  }
  for (const [t, n] of Object.entries(r.usedTroops) as [TroopType, number][]) s.army[t] = Math.max(0, (s.army[t] ?? 0) - n);
  for (const [t, n] of Object.entries(r.usedSpells) as [SpellType, number][]) s.spells[t] = Math.max(0, (s.spells[t] ?? 0) - n);
  for (const [h, hp] of Object.entries(r.heroHp) as [HeroType, number][]) s.heroes[h].hpFrac = hp;
  if ((r.usedSpells.allnighter ?? 0) > 0) unlock(s, 'allnighter');
  if (r.abilities.includes('prof')) unlock(s, 'popquiz');

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
    unlock(s, 'deanslist');
  }
  s.lastRaidClock = s.clock;
  bump(s, 'raids');
  bump(s, 'destroyed', r.buildingsDestroyed);
  bump(s, 'wallsByEngineers', r.wallsByEngineers);
  if (win) bump(s, 'wins');
  else bump(s, 'losses');
  if ((s.stats.losses ?? 0) >= 3) unlock(s, 'probation');
  if ((s.stats.destroyed ?? 0) >= 100) unlock(s, 'destroyer');
  if ((s.stats.wallsByEngineers ?? 0) >= 25) unlock(s, 'wallbreaker');
  if (win && setup.ringBySpring) unlock(s, 'ringbyspring');
  if (win && r.windSurvived) unlock(s, 'windblown');
  if (setup.kind === 'elephant') {
    unlock(s, 'elephant');
    s.events = s.events.filter((e) => e.type !== 'elephantrun');
  }
  if (setup.kind === 'campaign' && win) s.campaignDone = true;
  return { win, stars, destruction: r.destruction, tuition, coffee, gotT, gotC, trophyDelta: td, chapel, cancelled: false };
}
