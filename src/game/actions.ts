// Every player-initiated change to the village goes through applyAction. The client runs it
// immediately (so the game feels instant) and, when playing online, the server runs the same
// code on its own copy of the state, which is the one that counts. Inputs may come from an
// untrusted client, so every field is validated here.
import { BUILDINGS } from '../config/buildings';
import { HEROES, TROOPS } from '../config/troops';
import { SPELLS } from '../config/spells';
import type { BeamMode, BuildingType, HeroType, ResourceId, SpellType, TroopType } from '../config/types';
import { brew, cancelTrain, heroUpgrade, startResearch, train } from './army';
import { buildNew, canPlace, collect, dmcLevel, finishNow, startUpgrade } from './economy';
import { attendChapel } from './events';
import { LAYOUT_SLOTS, activate, defaultName, resolve, syncActive } from './layouts';
import { type BuildingInst, type GameState, type Layout, cleanName } from './state';
import type { SavedArmy } from './state';
import { readSavedArmy, SAVED_ARMY_SLOTS, savedArmyCompositionCheck, trainSavedArmy } from './savedArmies';

export type Action =
  | { k: 'build'; type: BuildingType; x: number; y: number }
  | { k: 'move'; id: number; x: number; y: number }
  | { k: 'remove'; id: number }
  /** `res` picks the payment for buildings that take more than one (walls: Tuition or Coffee). */
  | { k: 'upgrade'; id: number; res?: ResourceId }
  | { k: 'finish'; id: number }
  | { k: 'collect'; id: number }
  | { k: 'train'; type: TroopType }
  /**
   * `back` is the item's distance from the end of the queue (0 = last) and wins over `idx`:
   * the head of the queue finishes on its own, at slightly different moments in the browser
   * and on the server, so only a position counted from the end means the same item to both.
   * `type` guards against cancelling something else if the item is already gone.
   */
  | { k: 'cancelTrain'; idx: number; back?: number; type?: TroopType }
  | { k: 'brew'; type: SpellType }
  | { k: 'research'; type: TroopType }
  | { k: 'heroUpgrade'; type: HeroType }
  | { k: 'chapel' }
  /** Stinger Statue: switch between one ramping beam and several flat ones. Free, any time. */
  | { k: 'beamMode'; id: number; mode: BeamMode }
  /** Store a full arrangement in a slot; saving the active slot also moves the campus. */
  | { k: 'layoutSave'; slot: number; pos: Layout['pos'] }
  | { k: 'layoutUse'; slot: number }
  | { k: 'layoutName'; slot: number; name: string }
  | { k: 'layoutClear'; slot: number }
  | { k: 'armySave'; slot: number; army: SavedArmy }
  | { k: 'armyClear'; slot: number }
  | { k: 'armyTrain'; slot: number };

export interface ActionResult {
  err?: string;
  /** Amount gained (collect, chapel). */
  got?: number;
  building?: BuildingInst;
}

const own = (o: object, k: unknown): boolean => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
const int = (v: unknown): v is number => Number.isInteger(v) && Math.abs(v as number) < 1e9;
const slot = (v: unknown): v is number => int(v) && v >= 0 && v < LAYOUT_SLOTS;

function find(s: GameState, id: unknown): BuildingInst | undefined {
  return int(id) ? s.buildings.find((b) => b.id === id) : undefined;
}

export function applyAction(s: GameState, a: Action): ActionResult {
  const r = run(s, a);
  // The active layout slot always mirrors the live campus.
  if (!r.err && (a.k === 'build' || a.k === 'move' || a.k === 'remove')) syncActive(s);
  return r;
}

function run(s: GameState, a: Action): ActionResult {
  if (!a || typeof a !== 'object') return { err: 'Bad action' };
  switch (a.k) {
    case 'armySave': {
      if (!int(a.slot) || a.slot < 0 || a.slot >= SAVED_ARMY_SLOTS) return { err: 'Bad action' };
      const army = readSavedArmy(a.army);
      if (!army) return { err: 'Choose troops or spells and give your army a name' };
      const err = savedArmyCompositionCheck(s, army);
      if (err) return { err };
      s.savedArmies[a.slot] = army;
      return {};
    }
    case 'armyClear':
    case 'armyTrain': {
      if (!int(a.slot) || a.slot < 0 || a.slot >= SAVED_ARMY_SLOTS) return { err: 'Bad action' };
      const army = s.savedArmies[a.slot];
      if (!army) return { err: 'Save an army in this slot first' };
      if (a.k === 'armyClear') s.savedArmies[a.slot] = null;
      else {
        const err = trainSavedArmy(s, army);
        if (err) return { err };
      }
      return {};
    }
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
      if (!b || (a.res !== undefined && a.res !== 'tuition' && a.res !== 'coffee')) return { err: 'Bad action' };
      const e = startUpgrade(s, b, a.res);
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
      if (a.back !== undefined && !int(a.back)) return { err: 'Bad action' };
      const idx = a.back !== undefined ? s.trainQueue.length - 1 - a.back : a.idx;
      if (!int(idx) || idx >= s.trainQueue.length) return { err: 'Bad action' };
      if (idx < 0 || (a.type !== undefined && s.trainQueue[idx].type !== a.type)) return { err: 'That troop already finished training' };
      cancelTrain(s, idx);
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
    case 'beamMode': {
      const b = find(s, a.id);
      if (!b || b.type !== 'stinger' || (a.mode !== 'single' && a.mode !== 'multi')) return { err: 'Bad action' };
      if (a.mode === 'multi') b.mode = 'multi';
      else delete b.mode;
      return {};
    }
    case 'layoutSave': {
      if (!slot(a.slot) || !a.pos || typeof a.pos !== 'object') return { err: 'Bad action' };
      // Keep only positions for buildings that exist, and insist every one is placed legally.
      const pos: Layout['pos'] = {};
      for (const b of s.buildings) {
        const p = own(a.pos, String(b.id)) ? a.pos[b.id] : null;
        if (p && typeof p === 'object' && int(p.x) && int(p.y)) pos[b.id] = { x: p.x, y: p.y };
      }
      if (resolve(s.buildings, pos).missing.length) return { err: 'Place every building first' };
      s.layouts[a.slot] = { name: s.layouts[a.slot]?.name ?? defaultName(a.slot), pos };
      if (a.slot === s.activeLayout) activate(s, a.slot);
      return {};
    }
    case 'layoutUse': {
      if (!slot(a.slot) || !s.layouts[a.slot]) return { err: 'Bad action' };
      return activate(s, a.slot) ? {} : { err: 'Place your new buildings first' };
    }
    case 'layoutName': {
      const l = slot(a.slot) ? s.layouts[a.slot] : null;
      const name = typeof a.name === 'string' ? cleanName(a.name) : '';
      if (!l || !name) return { err: 'Bad action' };
      l.name = name;
      return {};
    }
    case 'layoutClear': {
      if (!slot(a.slot) || a.slot === s.activeLayout) return { err: "Can't clear the active layout" };
      s.layouts[a.slot] = null;
      return {};
    }
  }
  return { err: 'Unknown action' };
}
