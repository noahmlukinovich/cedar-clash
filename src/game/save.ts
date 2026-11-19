import { BUILDINGS } from '../config/buildings';
import { GRID } from '../config/balance';
import { ACHIEVEMENTS } from '../config/humor';
import { SPELLS } from '../config/spells';
import { HEROES, TROOPS } from '../config/troops';
import type { BuildingType, EventType, HeroType, ResourceId, SpellType, TroopType } from '../config/types';
import { ensureLayouts } from './layouts';
import { readSavedArmy, SAVED_ARMY_SLOTS } from './savedArmies';
import { type ActiveEvent, type BuildingInst, type GameState, type HeroState, type Layout, type QueueItem, SAVE_VERSION, type Timer, newGame } from './state';

const KEY = 'cedarville-clash-save';
/** Which build last wrote the save (kept separately so checking it is cheap). */
const BUILD_KEY = 'cedarville-clash-build';
/** The save as it was when this session loaded it: the last known-good copy. */
const BACKUP_KEY = 'cedarville-clash-save-backup';
/** A save that could not be read is parked here instead of being overwritten. */
const CORRUPT_KEY = 'cedarville-clash-save-corrupt';
export const BUILD_TIME: number = __BUILD_TIME__;

/**
 * Set when the save on disk was written by a NEWER build (or newer schema) than
 * this tab is running. While set, this tab never writes, so it can't clobber
 * the newer save; the UI asks the player to reload instead.
 */
export let staleSave = false;

function savedByNewer(): boolean {
  const b = Number(localStorage.getItem(BUILD_KEY) ?? 0);
  return b > BUILD_TIME;
}

type AnySave = Record<string, unknown> & { version?: number };

/**
 * Migrations: each entry upgrades a save FROM version n to n+1.
 * v1 (prototype) used "gold"/"elixir"/"darkElixir" resource names.
 * v2 lacked heroes / spells / events.
 * v3 lacked base layouts.
 * v4 lacked the Daily Challenge.
 */
const MIGRATIONS: Record<number, (s: AnySave) => AnySave> = {
  1: (s) => {
    const r = (s.resources ?? {}) as Record<string, number>;
    s.resources = {
      tuition: r.gold ?? r.tuition ?? 0,
      coffee: r.elixir ?? r.coffee ?? 0,
      chapel: r.darkElixir ?? r.chapel ?? 0,
    };
    s.version = 2;
    return s;
  },
  2: (s) => {
    const fresh = newGame();
    s.heroes = s.heroes ?? fresh.heroes;
    s.spells = s.spells ?? {};
    s.spellQueue = s.spellQueue ?? [];
    s.events = s.events ?? [];
    s.version = 3;
    return s;
  },
  3: (s) => {
    // Slot 1 becomes the current campus (filled in by ensureLayouts).
    s.layouts = [null, null, null];
    s.activeLayout = 0;
    s.version = 4;
    return s;
  },
  4: (s) => {
    s.daily = s.daily ?? newGame().daily;
    s.version = 5;
    return s;
  },
};

// ---------- Validation ----------
// A save is untrusted input: it may be hand-edited, truncated, or written by a
// buggy build. Everything below coerces it into a well-formed GameState, falling
// back to the new-game value for any field that is missing or the wrong shape.

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function num(v: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

function int(v: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  return Math.floor(num(v, fallback, min, max));
}

const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const bool = (v: unknown, fallback = false): boolean => (typeof v === 'boolean' ? v : fallback);

function timer(v: unknown): Timer | undefined {
  if (!isObj(v)) return undefined;
  const total = num(v.total, NaN, 0);
  const end = num(v.end, NaN);
  return Number.isFinite(total) && Number.isFinite(end) ? { end, total } : undefined;
}

function counts<K extends string>(v: unknown, keys: readonly K[]): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {};
  if (!isObj(v)) return out;
  for (const k of keys) {
    const n = int(v[k], 0, 0, 100000);
    if (n > 0) out[k] = n;
  }
  return out;
}

function queue<T extends string>(v: unknown, keys: readonly T[]): QueueItem<T>[] {
  if (!Array.isArray(v)) return [];
  const out: QueueItem<T>[] = [];
  for (const q of v) {
    if (!isObj(q) || !keys.includes(q.type as T)) continue;
    const total = num(q.total, 1, 0.001);
    const item: QueueItem<T> = { type: q.type as T, total, left: num(q.left, total, 0, total) };
    if (typeof q.chucks === 'number') item.chucks = num(q.chucks, 0, 0, 60);
    if (typeof q.paid === 'number') item.paid = num(q.paid, 0, 0);
    out.push(item);
  }
  return out;
}

const TROOP_KEYS = Object.keys(TROOPS) as TroopType[];
const SPELL_KEYS = Object.keys(SPELLS) as SpellType[];
const HERO_KEYS = Object.keys(HEROES) as HeroType[];
const RES_KEYS: ResourceId[] = ['tuition', 'coffee', 'chapel'];
const EVENT_KEYS: EventType[] = ['ringbyspring', 'finals', 'construction', 'elephantrun'];

function buildings(v: unknown, fallback: BuildingInst[]): { list: BuildingInst[]; maxId: number } {
  if (!Array.isArray(v)) return { list: fallback, maxId: Math.max(0, ...fallback.map((b) => b.id)) };
  const list: BuildingInst[] = [];
  const seen = new Set<number>();
  let maxId = 0;
  for (const raw of v) {
    if (!isObj(raw) || !(String(raw.type) in BUILDINGS)) continue;
    const type = raw.type as BuildingType;
    const def = BUILDINGS[type];
    let id = int(raw.id, 0, 1);
    if (id < 1 || seen.has(id)) id = Math.max(maxId, ...seen) + 1;
    seen.add(id);
    maxId = Math.max(maxId, id);
    const b: BuildingInst = {
      id,
      type,
      x: int(raw.x, 0, 0, GRID - def.size),
      y: int(raw.y, 0, 0, GRID - def.size),
      level: int(raw.level, 1, 0, def.levels.length),
    };
    const up = timer(raw.upgrade);
    if (up && isObj(raw.upgrade)) b.upgrade = { ...up, to: int(raw.upgrade.to, b.level + 1, 1, def.levels.length) };
    if (b.level === 0 && !b.upgrade) b.level = 1; // "under construction" with no timer would never finish
    if (typeof raw.stored === 'number') b.stored = num(raw.stored, 0, 0);
    if (typeof raw.name === 'string') b.name = raw.name;
    if (type === 'stinger' && (raw.mode === 'single' || raw.mode === 'multi')) b.mode = raw.mode;
    list.push(b);
  }
  // A campus with no DMC cannot be played: treat the list as unusable.
  if (!list.some((b) => b.type === 'dmc')) return { list: fallback, maxId: Math.max(0, ...fallback.map((b) => b.id)) };
  return { list, maxId };
}

/** Saved layouts: keep well-formed slots (ensureLayouts then fixes up the active one). */
function layouts(v: unknown): (Layout | null)[] {
  if (!Array.isArray(v)) return [null, null, null];
  return v.slice(0, 3).map((l): Layout | null => {
    if (!isObj(l) || !isObj(l.pos)) return null;
    const pos: Layout['pos'] = {};
    for (const [id, p] of Object.entries(l.pos)) {
      if (!/^\d+$/.test(id) || !isObj(p)) continue;
      pos[Number(id)] = { x: int(p.x, 0, 0, GRID - 1), y: int(p.y, 0, 0, GRID - 1) };
    }
    return { name: str(l.name, '').slice(0, 40), pos };
  });
}

function hero(v: unknown, h: HeroType): HeroState {
  const max = HEROES[h].levels.length;
  if (!isObj(v)) return { level: 1, hpFrac: 1 };
  const out: HeroState = { level: int(v.level, 1, 1, max), hpFrac: num(v.hpFrac, 1, 0, 1) };
  const up = timer(v.upgrade);
  if (up && isObj(v.upgrade)) out.upgrade = { ...up, to: int(v.upgrade.to, out.level + 1, 1, max) };
  return out;
}

/** Coerce an already-migrated save object into a well-formed GameState. */
export function sanitize(raw: AnySave): GameState {
  const fresh = newGame();
  const res = isObj(raw.resources) ? raw.resources : {};
  const b = buildings(raw.buildings, fresh.buildings);
  const troopLevels = { ...fresh.troopLevels };
  if (isObj(raw.troopLevels)) for (const t of TROOP_KEYS) troopLevels[t] = int(raw.troopLevels[t], 1, 1, TROOPS[t].levels.length);

  const stats: GameState['stats'] = {};
  if (isObj(raw.stats)) for (const [k, v] of Object.entries(raw.stats)) if (typeof v === 'number' && Number.isFinite(v)) (stats as Record<string, number>)[k] = Math.max(0, v);
  const achievements: GameState['achievements'] = {};
  if (isObj(raw.achievements)) for (const a of ACHIEVEMENTS) if (raw.achievements[a.id] === true) achievements[a.id] = true;

  const events: ActiveEvent[] = [];
  if (Array.isArray(raw.events)) {
    for (const e of raw.events) {
      if (!isObj(e) || !EVENT_KEYS.includes(e.type as EventType)) continue;
      const ev: ActiveEvent = { type: e.type as EventType, end: num(e.end, 0) };
      if (typeof e.x === 'number' && typeof e.y === 'number') {
        ev.x = int(e.x, 0, 0, GRID - 2);
        ev.y = int(e.y, 0, 0, GRID - 2);
      }
      events.push(ev);
    }
  }

  let research: GameState['research'];
  const rt = timer(raw.research);
  if (rt && isObj(raw.research) && TROOP_KEYS.includes(raw.research.troop as TroopType)) {
    const troop = raw.research.troop as TroopType;
    if (troopLevels[troop] < TROOPS[troop].levels.length) research = { ...rt, troop };
  }

  const chapel = isObj(raw.chapel) ? raw.chapel : {};
  const daily = isObj(raw.daily) ? raw.daily : {};
  const settings = isObj(raw.settings) ? raw.settings : {};
  const heroes = isObj(raw.heroes) ? raw.heroes : {};
  const trophies = int(raw.trophies, 0, 0);
  const clock = num(raw.clock, 0, 0);

  const s: GameState = {
    version: SAVE_VERSION,
    clock,
    lastReal: num(raw.lastReal, Date.now(), 0),
    nextId: Math.max(int(raw.nextId, 1, 1), b.maxId + 1),
    resources: { tuition: 0, coffee: 0, chapel: 0 },
    buildings: b.list,
    army: counts(raw.army, TROOP_KEYS),
    trainQueue: queue(raw.trainQueue, TROOP_KEYS),
    spells: counts(raw.spells, SPELL_KEYS),
    spellQueue: queue(raw.spellQueue, SPELL_KEYS),
    troopLevels,
    heroes: { prof: hero(heroes.prof, 'prof'), president: hero(heroes.president, 'president') },
    trophies,
    bestTrophies: Math.max(trophies, int(raw.bestTrophies, 0, 0)),
    stats,
    achievements,
    chapel: { lastDay: strOrNull(chapel.lastDay), streak: int(chapel.streak, 0, 0) },
    daily: { day: strOrNull(daily.day), done: bool(daily.done), attempts: int(daily.attempts, 0, 0), bestStars: int(daily.bestStars, 0, 0, 3) },
    events,
    nextEventCheck: num(raw.nextEventCheck, clock + 60),
    settings: { muted: bool(settings.muted), speedIdx: int(settings.speedIdx, 0, 0, 2), debug: bool(settings.debug) },
    campaignDone: bool(raw.campaignDone),
    lastRaidClock: num(raw.lastRaidClock, 0),
    nextTicketCheck: num(raw.nextTicketCheck, clock + 240),
    playerName: str(raw.playerName, fresh.playerName).slice(0, 40),
    layouts: layouts(raw.layouts),
    activeLayout: int(raw.activeLayout, 0, 0, 2),
    savedArmies: Array.from({ length: SAVED_ARMY_SLOTS }, (_, i) => readSavedArmy(Array.isArray(raw.savedArmies) ? raw.savedArmies[i] : null)),
  };
  if (raw.nameChanged === true) s.nameChanged = true;
  if (typeof raw.lastRival === 'string') s.lastRival = raw.lastRival;
  if (research) s.research = research;
  for (const r of RES_KEYS) s.resources[r] = num(res[r], fresh.resources[r], 0);
  if (typeof chapel.skipNoticeShown === 'string') s.chapel.skipNoticeShown = chapel.skipNoticeShown;
  for (const h of HERO_KEYS) s.heroes[h] = hero(heroes[h], h);
  ensureLayouts(s);
  return s;
}

/** Upgrade any older save to the current schema and validate it. Throws if it isn't a save at all. */
export function migrate(raw: unknown): GameState {
  if (!isObj(raw)) throw new Error('Save is not an object');
  let s: AnySave = raw;
  let v = typeof s.version === 'number' ? s.version : 1;
  while (v < SAVE_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) break;
    s = m(s);
    v = s.version as number;
  }
  return sanitize(s);
}

// ---------- Load / save ----------

export interface LoadResult {
  state: GameState;
  offlineSeconds: number;
  fresh: boolean;
  /** Set when the main save was unreadable. 'backup': the previous session's copy was restored. 'lost': nothing usable, started over. */
  recovered?: 'backup' | 'lost';
}

function parseSave(txt: string): { state: GameState; newer: boolean } {
  const raw: unknown = JSON.parse(txt);
  const state = migrate(raw);
  const v = isObj(raw) ? raw.version : undefined;
  return { state, newer: typeof v === 'number' && v > SAVE_VERSION };
}

function withOffline(state: GameState): { state: GameState; offlineSeconds: number } {
  const offline = Math.max(0, (Date.now() - state.lastReal) / 1000);
  state.clock += offline;
  state.lastReal = Date.now();
  return { state, offlineSeconds: offline };
}

export function loadGame(): LoadResult {
  let txt: string | null = null;
  try {
    txt = localStorage.getItem(KEY);
  } catch (e) {
    console.warn('Storage unavailable; progress will not be saved', e);
  }
  if (!txt) return { state: newGame(), offlineSeconds: 0, fresh: true };

  try {
    const { state, newer } = parseSave(txt);
    if (newer || savedByNewer()) staleSave = true;
    // The save read cleanly: keep this copy as the fallback for next time.
    try {
      localStorage.setItem(BACKUP_KEY, txt);
    } catch {
      // out of quota: carry on without a backup
    }
    return { ...withOffline(state), fresh: false };
  } catch (e) {
    console.warn('Save could not be read', e);
  }

  // Unreadable. Park it so it is never overwritten, then try last session's copy.
  try {
    localStorage.setItem(CORRUPT_KEY, txt);
  } catch {
    // nothing more we can do
  }
  try {
    const backup = localStorage.getItem(BACKUP_KEY);
    if (backup) return { ...withOffline(parseSave(backup).state), fresh: false, recovered: 'backup' };
  } catch (e) {
    console.warn('Backup save could not be read either', e);
  }
  return { state: newGame(), offlineSeconds: 0, fresh: true, recovered: 'lost' };
}

/** Returns false if the save was skipped because a newer version owns it. */
export function saveGame(state: GameState): boolean {
  state.lastReal = Date.now();
  try {
    if (staleSave || savedByNewer()) {
      staleSave = true;
      return false;
    }
    localStorage.setItem(KEY, JSON.stringify(state));
    localStorage.setItem(BUILD_KEY, String(BUILD_TIME));
    return true;
  } catch (e) {
    console.warn('Save failed', e);
    return false;
  }
}

// ---------- Offline raid in progress ----------
// If the page is closed or killed mid-raid, the raid carries on without the
// player: next launch replays it from the stored inputs and applies the result.
const RAID_KEY = 'cedarville-clash-raid';

export interface PendingRaid {
  setup: import('../raid/engine').RaidSetup;
  inputs: import('../raid/engine').RaidInput[];
}

export function savePendingRaid(p: PendingRaid | null): void {
  try {
    if (p) localStorage.setItem(RAID_KEY, JSON.stringify(p));
    else localStorage.removeItem(RAID_KEY);
  } catch {
    // private window or full storage: the raid just won't survive a reload
  }
}

export function loadPendingRaid(): PendingRaid | null {
  try {
    const txt = localStorage.getItem(RAID_KEY);
    return txt ? (JSON.parse(txt) as PendingRaid) : null;
  } catch {
    return null;
  }
}

/** Re-check (e.g. when another tab writes) whether a newer build owns the save. */
export function checkStale(): boolean {
  if (!staleSave && savedByNewer()) staleSave = true;
  return staleSave;
}

export function resetSave(): void {
  localStorage.removeItem(KEY);
  localStorage.removeItem(RAID_KEY);
  localStorage.removeItem(BUILD_KEY);
  localStorage.removeItem(BACKUP_KEY);
}

export function exportSave(state: GameState): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(state))));
}

/** Decode a string made by exportSave (or raw JSON). Throws if it is not a save. */
export function decodeSave(text: string): GameState {
  const t = text.trim();
  const json = t.startsWith('{') ? t : decodeURIComponent(escape(atob(t)));
  return migrate(JSON.parse(json));
}

/** Replace the stored save with an imported one. The caller should reload afterwards. */
export function importSave(text: string): GameState {
  const state = decodeSave(text);
  state.lastReal = Date.now();
  localStorage.setItem(KEY, JSON.stringify(state));
  localStorage.setItem(BUILD_KEY, String(BUILD_TIME));
  return state;
}
