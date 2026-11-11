import { GameState, SAVE_VERSION, newGame } from './state';

const KEY = 'cedarville-clash-save';
/** Which build last wrote the save (kept separately so checking it is cheap). */
const BUILD_KEY = 'cedarville-clash-build';
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
};

export function migrate(raw: AnySave): GameState {
  let s = raw;
  let v = typeof s.version === 'number' ? s.version : 1;
  while (v < SAVE_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) break;
    s = m(s);
    v = s.version as number;
  }
  // Fill any missing fields with defaults so older/partial saves never crash.
  const fresh = newGame() as unknown as AnySave;
  for (const k of Object.keys(fresh)) {
    if (s[k] === undefined) s[k] = fresh[k];
  }
  const g = s as unknown as GameState;
  g.troopLevels = { ...newGame().troopLevels, ...g.troopLevels };
  g.settings = { ...newGame().settings, ...g.settings };
  g.version = SAVE_VERSION;
  return g;
}

export function loadGame(): { state: GameState; offlineSeconds: number; fresh: boolean } {
  try {
    const txt = localStorage.getItem(KEY);
    if (txt) {
      const raw = JSON.parse(txt);
      if ((typeof raw.version === 'number' && raw.version > SAVE_VERSION) || savedByNewer()) staleSave = true;
      const state = migrate(raw);
      const offline = Math.max(0, (Date.now() - state.lastReal) / 1000);
      state.clock += offline;
      state.lastReal = Date.now();
      return { state, offlineSeconds: offline, fresh: false };
    }
  } catch (e) {
    console.warn('Save load failed; starting fresh', e);
  }
  return { state: newGame(), offlineSeconds: 0, fresh: true };
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

/** Re-check (e.g. when another tab writes) whether a newer build owns the save. */
export function checkStale(): boolean {
  if (!staleSave && savedByNewer()) staleSave = true;
  return staleSave;
}

export function resetSave(): void {
  localStorage.removeItem(KEY);
  localStorage.removeItem(BUILD_KEY);
}

export function exportSave(state: GameState): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(state))));
}
