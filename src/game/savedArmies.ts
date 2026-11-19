import { TROOPS, TROOP_ORDER } from '../config/troops';
import { SPELLS, SPELL_ORDER } from '../config/spells';
import type { ResourceId } from '../config/types';
import { ARMIES, armyCapacity, armyUsed, brew, queueUsed, spellCapacity, spellsUsed, sscLevel, train, troopUnlocked } from './army';
import { hasEvent, resName } from './economy';
import { cleanName, type GameState, type SavedArmy } from './state';

export const SAVED_ARMY_SLOTS = 3;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Validate untrusted recipes from actions and saves, and copy only known fields. */
export function readSavedArmy(raw: unknown): SavedArmy | null {
  if (!object(raw) || typeof raw.name !== 'string') return null;
  const name = cleanName(raw.name);
  if (!name) return null;
  const read = <T extends string>(v: unknown, keys: T[]): Partial<Record<T, number>> | null => {
    if (!object(v)) return null;
    const out: Partial<Record<T, number>> = {};
    for (const [key, n] of Object.entries(v)) {
      if (!keys.includes(key as T) || typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 500) return null;
      if (n) out[key as T] = n;
    }
    return out;
  };
  const troops = read(raw.troops, TROOP_ORDER);
  const spells = read(raw.spells, SPELL_ORDER);
  if (!troops || !spells || !Object.keys(troops).length && !Object.keys(spells).length) return null;
  return { name, troops, spells };
}

export function savedArmyTotals(s: GameState, p: SavedArmy): { housing: number; spells: number; seconds: number; cost: Record<ResourceId, number> } {
  const cost = { tuition: 0, coffee: 0, chapel: 0 };
  let housing = 0, spellHousing = 0, troopTime = 0, spellTime = 0;
  for (const t of TROOP_ORDER) {
    const n = p.troops[t] ?? 0, d = TROOPS[t];
    housing += n * d.housing;
    troopTime += n * d.trainTime;
    cost[d.res] += n * d.levels[s.troopLevels[t] - 1].cost;
  }
  for (const t of SPELL_ORDER) {
    const n = p.spells[t] ?? 0, d = SPELLS[t];
    spellHousing += n * d.housing;
    spellTime += n * d.brewTime;
    cost[d.res] += n * d.cost;
  }
  return { housing, spells: spellHousing, seconds: Math.max(troopTime * (hasEvent(s, 'finals') ? 2 : 1), spellTime), cost };
}

/** Recipes describe at most one army and may only include unlocked units/spells. */
export function savedArmyCompositionCheck(s: GameState, p: SavedArmy): string | null {
  for (const t of TROOP_ORDER) if (p.troops[t] && !troopUnlocked(s, t)) return `${TROOPS[t].name} is locked`;
  for (const t of SPELL_ORDER) if (p.spells[t] && sscLevel(s) < SPELLS[t].sscLevel) return `${SPELLS[t].name} is locked`;
  const totals = savedArmyTotals(s, p);
  if (totals.housing > armyCapacity(s)) return 'This army exceeds Residence Hall capacity';
  if (totals.spells > spellCapacity(s)) return 'This army exceeds spell capacity';
  return null;
}

export function savedArmyTrainCheck(s: GameState, p: SavedArmy): string | null {
  const err = savedArmyCompositionCheck(s, p);
  if (err) return err;
  const totals = savedArmyTotals(s, p);
  const troopRoom = Math.max(0, armyCapacity(s) * ARMIES - armyUsed(s) - queueUsed(s));
  const spellRoom = Math.max(0, spellCapacity(s) - spellsUsed(s));
  if (totals.housing > troopRoom) return `Not enough room: needs ${totals.housing} troop housing, ${troopRoom} available`;
  if (totals.spells > spellRoom) return `Not enough spell space: needs ${totals.spells}, ${spellRoom} available`;
  for (const r of ['tuition', 'coffee', 'chapel'] as ResourceId[]) if (s.resources[r] < totals.cost[r]) return `Not enough ${resName(r)}`;
  return null;
}

/** All-or-nothing: validate the complete purchase before adding anything to either queue. */
export function trainSavedArmy(s: GameState, p: SavedArmy): string | null {
  const err = savedArmyTrainCheck(s, p);
  if (err) return err;
  for (const t of TROOP_ORDER) for (let n = 0; n < (p.troops[t] ?? 0); n++) train(s, t);
  for (const t of SPELL_ORDER) for (let n = 0; n < (p.spells[t] ?? 0); n++) brew(s, t);
  return null;
}
