// Picks a computer-generated rival for "Find a Rival" from the player's trophies. (Online,
// the server first looks for a real player near your trophy count and only falls back to
// this when nobody is available.)
//
// Trophies imply a DMC level the ladder expects you to be at. If your trophies
// are ahead of your campus you are matched up (bigger, better-built rivals that
// pay more trophies and loot); if they are behind, you are matched down. Winning
// therefore makes the next rival harder, and losing makes it easier.
import { MAX_DMC } from '../config/balance';
import { ARCHETYPES, type Archetype, type BaseLayout, generateBase } from './basegen';

/** Trophies needed per expected DMC level. */
export const TROPHIES_PER_DMC = 350;

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

/** The DMC level the ladder expects at this trophy count (fractional). */
export function expectedDmc(trophies: number): number {
  return clamp(1 + trophies / TROPHIES_PER_DMC, 1, MAX_DMC + 0.5);
}

export interface Matchup {
  dmc: number;
  strength: number;
  archetype: Archetype;
  seed: number;
  /** 0 (easiest) .. 4 (hardest), relative to the player. Index into DIFFICULTY_LABELS. */
  difficulty: number;
  trophiesWin: number;
  trophiesLose: number;
}

/** `rand` returns 0..1; the server passes a crypto-backed one, tests a seeded one. */
export type Rand = () => number;

/** `avoid` is the previous rival's layout, so the same shape doesn't come up twice in a row. */
export function findRival(trophies: number, playerDmc: number, rand: Rand, avoid?: Archetype): Matchup {
  const range = (a: number, b: number): number => a + rand() * (b - a);
  // How far the ladder thinks you are ahead of (+) or behind (-) your campus.
  const pressure = clamp(expectedDmc(trophies) - playerDmc, -1.5, 1.5);
  const dmc = clamp(playerDmc + clamp(Math.round(pressure * 0.6 + range(-0.7, 0.7)), -1, 1), 1, MAX_DMC);
  const strength = clamp(0.5 + pressure * 0.3 + range(-0.15, 0.15), 0.05, 1);
  // One DMC level is worth about as much as going from half-built to maxed.
  const score = dmc - playerDmc + (strength - 0.5) * 2;
  const difficulty = score <= -0.9 ? 0 : score <= -0.3 ? 1 : score < 0.3 ? 2 : score < 0.9 ? 3 : 4;
  const pool = ARCHETYPES.filter((a) => a !== avoid);
  return {
    dmc,
    strength,
    archetype: pool[Math.floor(rand() * pool.length)],
    seed: 1 + Math.floor(rand() * 0x7ffffffe),
    difficulty,
    trophiesWin: clamp(Math.round(28 + score * 9), 12, 45),
    trophiesLose: clamp(Math.round(14 - score * 5), 5, 24),
  };
}

export function baseForMatchup(m: Matchup): BaseLayout {
  const base = generateBase({ dmc: m.dmc, seed: m.seed, strength: m.strength, archetype: m.archetype });
  base.trophiesWin = m.trophiesWin;
  base.trophiesLose = m.trophiesLose;
  base.difficulty = m.difficulty;
  return base;
}
