// A detached, read-only public view of progression. Never includes resources, troop counts,
// queues, hero health, hidden traps, achievements or other private game state.
import type { HeroType } from '../config/types';
import { TROOP_ORDER } from '../config/troops';
import { SPELL_ORDER, SPELLS } from '../config/spells';
import { heroUnlocked, sscLevel, troopUnlocked } from './army';
import { dmcLevel } from './economy';
import type { GameState } from './state';
import type { PlayerProfile } from '../net/protocol';

export function publicPlayerProfile(s: GameState, name = s.playerName): PlayerProfile {
  const troopLevels: PlayerProfile['troopLevels'] = {};
  for (const t of TROOP_ORDER) if (troopUnlocked(s, t)) troopLevels[t] = s.troopLevels[t];
  const heroLevels: PlayerProfile['heroLevels'] = {};
  for (const h of ['prof', 'president'] as HeroType[]) if (heroUnlocked(s, h)) heroLevels[h] = s.heroes[h].level;
  const brewLevel = sscLevel(s);
  return { name, dmc: dmcLevel(s), trophies: s.trophies, bestTrophies: s.bestTrophies, troopLevels, spells: SPELL_ORDER.filter((t) => brewLevel >= SPELLS[t].sscLevel), heroLevels };
}
