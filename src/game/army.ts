import { BUILDINGS } from '../config/buildings';
import { HEROES, TROOPS } from '../config/troops';
import { SPELLS, SPELL_CAPACITY } from '../config/spells';
import type { HeroType, SpellType, TroopType } from '../config/types';
import { bus } from '../core/bus';
import { bump, canAfford, hasEvent, resName, spend, unlock } from './economy';
import type { GameState } from './state';

export function armyCapacity(s: GameState): number {
  let c = 0;
  for (const b of s.buildings) {
    if (b.type === 'reshall' && b.level >= 1) c += BUILDINGS.reshall.levels[b.level - 1].housing ?? 0;
  }
  return c;
}

export function armyUsed(s: GameState): number {
  let u = 0;
  for (const [t, n] of Object.entries(s.army)) u += (n ?? 0) * TROOPS[t as TroopType].housing;
  return u;
}

export function queueUsed(s: GameState): number {
  return s.trainQueue.reduce((a, q) => a + TROOPS[q.type].housing, 0);
}

export function barracksLevel(s: GameState, type: string): number {
  let m = 0;
  for (const b of s.buildings) if (b.type === type) m = Math.max(m, b.level);
  return m;
}

export function troopUnlocked(s: GameState, t: TroopType): boolean {
  const d = TROOPS[t];
  return barracksLevel(s, d.barracks) >= d.barracksLevel;
}

export function trainCheck(s: GameState, t: TroopType): string | null {
  const d = TROOPS[t];
  if (!troopUnlocked(s, t)) return `Requires ${BUILDINGS[d.barracks].name} Lv${d.barracksLevel}`;
  if (armyUsed(s) + queueUsed(s) + d.housing > armyCapacity(s)) return 'Residence halls are full!';
  const cost = d.levels[s.troopLevels[t] - 1].cost;
  if (!canAfford(s, d.res, cost)) return `Not enough ${resName(d.res)}`;
  return null;
}

export function train(s: GameState, t: TroopType): string | null {
  const err = trainCheck(s, t);
  if (err) return err;
  const d = TROOPS[t];
  const cost = d.levels[s.troopLevels[t] - 1].cost;
  spend(s, d.res, cost);
  s.trainQueue.push({ type: t, left: d.trainTime, total: d.trainTime, paid: cost });
  return null;
}

export function cancelTrain(s: GameState, idx: number): void {
  const q = s.trainQueue[idx];
  if (!q) return;
  const d = TROOPS[q.type];
  // Refund what was paid, not today's price: research finishing in between raises the price.
  // (Items queued before `paid` existed fall back to the current price.)
  s.resources[d.res] += q.paid ?? d.levels[s.troopLevels[q.type] - 1].cost;
  s.trainQueue.splice(idx, 1);
}

/** The training queue as runs of the same troop, in order: what the Army screen shows. */
export function queueRuns(s: GameState): { type: TroopType; count: number; start: number }[] {
  const runs: { type: TroopType; count: number; start: number }[] = [];
  s.trainQueue.forEach((q, i) => {
    const last = runs[runs.length - 1];
    if (last && last.type === q.type) last.count++;
    else runs.push({ type: q.type, count: 1, start: i });
  });
  return runs;
}

/** Real seconds until one queue item is done (Finals Week halves training speed). */
export function trainItemLeft(s: GameState, q: { left: number; chucks?: number }): number {
  return (q.left + Math.max(0, q.chucks ?? 0)) * (hasEvent(s, 'finals') ? 2 : 1);
}

/** Real seconds until the whole training queue is done. */
export function trainQueueLeft(s: GameState): number {
  return s.trainQueue.reduce((a, q) => a + trainItemLeft(s, q), 0);
}

export function sscLevel(s: GameState): number {
  return barracksLevel(s, 'ssc');
}

export function spellCapacity(s: GameState): number {
  return SPELL_CAPACITY[sscLevel(s)] ?? 0;
}

export function spellsUsed(s: GameState): number {
  let n = 0;
  for (const v of Object.values(s.spells)) n += v ?? 0;
  return n + s.spellQueue.length;
}

export function brewCheck(s: GameState, t: SpellType): string | null {
  const d = SPELLS[t];
  if (sscLevel(s) < d.sscLevel) return `Requires Brew Lab Lv${d.sscLevel}`;
  if (spellsUsed(s) + d.housing > spellCapacity(s)) return 'Spell capacity full!';
  if (!canAfford(s, d.res, d.cost)) return `Not enough ${resName(d.res)}`;
  return null;
}

export function brew(s: GameState, t: SpellType): string | null {
  const err = brewCheck(s, t);
  if (err) return err;
  const d = SPELLS[t];
  spend(s, d.res, d.cost);
  s.spellQueue.push({ type: t, left: d.brewTime, total: d.brewTime });
  return null;
}

// ---------- Research ----------

export function libraryLevel(s: GameState): number {
  return barracksLevel(s, 'library');
}

export function researchCheck(s: GameState, t: TroopType): string | null {
  if (s.research) return 'The Library is already researching';
  const lvl = s.troopLevels[t];
  const d = TROOPS[t];
  if (lvl >= d.levels.length) return 'Max level';
  const next = d.levels[lvl];
  const lib = s.buildings.find((b) => b.type === 'library');
  if (!lib || lib.level < 1) return 'Build the Centennial Library first';
  if (lib.upgrade) return 'Library is being upgraded';
  if (libraryLevel(s) < next.libraryLevel) return `Requires Library Lv${next.libraryLevel}`;
  if (!troopUnlocked(s, t)) return 'Unlock this troop first';
  if (!canAfford(s, 'coffee', next.researchCost)) return 'Not enough Coffee';
  return null;
}

export function startResearch(s: GameState, t: TroopType): string | null {
  const err = researchCheck(s, t);
  if (err) return err;
  const next = TROOPS[t].levels[s.troopLevels[t]];
  spend(s, 'coffee', next.researchCost);
  s.research = { troop: t, end: s.clock + next.researchTime, total: next.researchTime };
  return null;
}

// ---------- Heroes ----------

export function heroUnlocked(s: GameState, h: HeroType): boolean {
  return s.buildings.some((b) => b.type === HEROES[h].building && b.level >= 1);
}

export function heroAvailable(s: GameState, h: HeroType): boolean {
  return heroUnlocked(s, h) && !s.heroes[h].upgrade && s.heroes[h].hpFrac >= 0.999;
}

export function heroUpgradeCheck(s: GameState, h: HeroType, dmc: number): string | null {
  const st = s.heroes[h];
  const d = HEROES[h];
  if (!heroUnlocked(s, h)) return 'Build the hero building first';
  if (st.upgrade) return 'Already upgrading';
  if (st.level >= d.levels.length) return 'Max level';
  const n = d.levels[st.level];
  if (dmc < n.dmc) return `Requires DMC ${n.dmc}`;
  if (!canAfford(s, 'chapel', n.upgradeCost)) return 'Not enough Chapel Credits';
  return null;
}

export function heroUpgrade(s: GameState, h: HeroType, dmc: number): string | null {
  const err = heroUpgradeCheck(s, h, dmc);
  if (err) return err;
  const n = HEROES[h].levels[s.heroes[h].level];
  spend(s, 'chapel', n.upgradeCost);
  s.heroes[h].upgrade = { to: s.heroes[h].level + 1, end: s.clock + n.upgradeTime, total: n.upgradeTime };
  return null;
}

// ---------- Tick ----------

export function tickArmy(s: GameState, dt: number): void {
  const finals = hasEvent(s, 'finals');
  let budget = dt * (finals ? 0.5 : 1);
  // Training queue (one at a time, offline-safe loop)
  while (budget > 0 && s.trainQueue.length) {
    const q = s.trainQueue[0];
    if (q.left === q.total && q.chucks === undefined) {
      // first time this item starts: maybe it's stuck in line at Chuck's
      q.chucks = Math.random() < 0.18 ? 3 + Math.random() * 3 : 0;
    }
    if (q.chucks && q.chucks > 0) {
      const use = Math.min(budget, q.chucks);
      q.chucks -= use;
      budget -= use;
      continue;
    }
    const use = Math.min(budget, q.left);
    q.left -= use;
    budget -= use;
    if (q.left <= 0.0001) {
      s.trainQueue.shift();
      s.army[q.type] = (s.army[q.type] ?? 0) + 1;
      bump(s, 'trained_' + q.type);
      if ((s.stats['trained_freshman'] ?? 0) >= 15) unlock(s, 'freshman15');
      bus.emit('trained', q.type);
    }
  }
  // Spells
  let sb = dt;
  while (sb > 0 && s.spellQueue.length) {
    const q = s.spellQueue[0];
    const use = Math.min(sb, q.left);
    q.left -= use;
    sb -= use;
    if (q.left <= 0.0001) {
      s.spellQueue.shift();
      s.spells[q.type] = (s.spells[q.type] ?? 0) + 1;
    }
  }
  // Research
  if (s.research && s.clock >= s.research.end) {
    const t = s.research.troop;
    s.troopLevels[t]++;
    s.research = undefined;
    bus.emit('researchDone', t);
  }
  // Heroes
  for (const h of Object.keys(s.heroes) as HeroType[]) {
    const st = s.heroes[h];
    if (st.upgrade && s.clock >= st.upgrade.end) {
      st.level = st.upgrade.to;
      st.upgrade = undefined;
      st.hpFrac = 1;
      bus.emit('heroDone', h);
    }
    if (st.hpFrac < 1) st.hpFrac = Math.min(1, st.hpFrac + dt / HEROES[h].regenTime);
  }
}
