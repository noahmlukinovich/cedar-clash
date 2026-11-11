// Every player-initiated change to the village goes through applyAction. The client runs it
// immediately (so the game feels instant) and, when playing online, the server runs the same
// code on its own copy of the state, which is the one that counts. Inputs may come from an
// untrusted client, so every field is validated here.
import { BUILDINGS } from '../config/buildings';
import { HEROES, TROOPS } from '../config/troops';
import { SPELLS } from '../config/spells';
import type { BuildingType, HeroType, SpellType, TroopType } from '../config/types';
import { brew, cancelTrain, heroUpgrade, startResearch, train } from './army';
import { buildNew, canPlace, collect, dmcLevel, finishNow, startUpgrade } from './economy';
import { attendChapel } from './events';
import type { BuildingInst, GameState } from './state';

export type Action =
  | { k: 'build'; type: BuildingType; x: number; y: number }
  | { k: 'move'; id: number; x: number; y: number }
  | { k: 'remove'; id: number }
  | { k: 'upgrade'; id: number }
  | { k: 'finish'; id: number }
  | { k: 'collect'; id: number }
  | { k: 'train'; type: TroopType }
  | { k: 'cancelTrain'; idx: number }
  | { k: 'brew'; type: SpellType }
  | { k: 'research'; type: TroopType }
  | { k: 'heroUpgrade'; type: HeroType }
  | { k: 'chapel' };

export interface ActionResult {
  err?: string;
  /** Amount gained (collect, chapel). */
  got?: number;
  building?: BuildingInst;
}

const own = (o: object, k: unknown): boolean => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
const int = (v: unknown): v is number => Number.isInteger(v) && Math.abs(v as number) < 1e9;

function find(s: GameState, id: unknown): BuildingInst | undefined {
  return int(id) ? s.buildings.find((b) => b.id === id) : undefined;
}

export function applyAction(s: GameState, a: Action): ActionResult {
  if (!a || typeof a !== 'object') return { err: 'Bad action' };
  switch (a.k) {
    case 'build': {
      if (!own(BUILDINGS, a.type) || !int(a.x) || !int(a.y)) return { err: 'Bad action' };
      const r = buildNew(s, a.type, a.x, a.y);
      return typeof r === 'string' ? { err: r } : { building: r };
    }
    case 'move': {
      const b = find(s, a.id);
      if (!b || !int(a.x) || !int(a.y)) return { err: 'Bad action' };
      if (!canPlace(s, b.type, a.x, a.y, b.id)) return { err: "Can't place there" };
      b.x = a.x;
      b.y = a.y;
      return {};
    }
    case 'remove': {
      const b = find(s, a.id);
      if (!b || !BUILDINGS[b.type].removable) return { err: "Can't remove that" };
      s.buildings = s.buildings.filter((x) => x.id !== b.id);
      return {};
    }
    case 'upgrade': {
      const b = find(s, a.id);
      if (!b) return { err: 'Bad action' };
      const e = startUpgrade(s, b);
      return e ? { err: e } : {};
    }
    case 'finish': {
      const b = find(s, a.id);
      if (!b || !b.upgrade) return { err: 'Nothing to finish' };
      const e = finishNow(s, b);
      return e ? { err: e } : {};
    }
    case 'collect': {
      const b = find(s, a.id);
      if (!b || (b.type !== 'admissions' && b.type !== 'coffeecart')) return { err: 'Bad action' };
      return { got: collect(s, b) };
    }
    case 'train': {
      if (!own(TROOPS, a.type)) return { err: 'Bad action' };
      const e = train(s, a.type);
      return e ? { err: e } : {};
    }
    case 'cancelTrain': {
      if (!int(a.idx) || a.idx < 0 || a.idx >= s.trainQueue.length) return { err: 'Bad action' };
      cancelTrain(s, a.idx);
      return {};
    }
    case 'brew': {
      if (!own(SPELLS, a.type)) return { err: 'Bad action' };
      const e = brew(s, a.type);
      return e ? { err: e } : {};
    }
    case 'research': {
      if (!own(TROOPS, a.type)) return { err: 'Bad action' };
      const e = startResearch(s, a.type);
      return e ? { err: e } : {};
    }
    case 'heroUpgrade': {
      if (!own(HEROES, a.type)) return { err: 'Bad action' };
      const e = heroUpgrade(s, a.type, dmcLevel(s));
      return e ? { err: e } : {};
    }
    case 'chapel': {
      const got = attendChapel(s);
      return got > 0 ? { got } : { err: "You've already attended today" };
    }
  }
  return { err: 'Unknown action' };
}
