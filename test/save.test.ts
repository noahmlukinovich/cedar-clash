import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SAVE_VERSION, newGame } from '../src/game/state';

// save.ts talks to localStorage; give it an in-memory one.
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});
const { decodeSave, exportSave, importSave, loadGame, migrate, saveGame } = await import('../src/game/save');

const KEY = 'cedarville-clash-save';
const BACKUP = 'cedarville-clash-save-backup';
const CORRUPT = 'cedarville-clash-save-corrupt';

beforeEach(() => store.clear());

describe('migrate', () => {
  it('upgrades a v1 prototype save', () => {
    const s = migrate({ version: 1, resources: { gold: 500, elixir: 300, darkElixir: 7 }, buildings: newGame().buildings });
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.resources).toEqual({ tuition: 500, coffee: 300, chapel: 7 });
    expect(s.heroes.prof.level).toBe(1);
    expect(s.daily).toEqual({ day: null, done: false, attempts: 0, bestStars: 0 });
  });

  it('round-trips a current save unchanged', () => {
    const s = newGame();
    s.trophies = 321;
    s.bestTrophies = 400;
    s.army = { freshman: 12, athlete: 2 };
    s.stats = { raids: 9, trained_freshman: 40 };
    s.achievements = { freshman15: true };
    s.daily = { day: '2027-01-02', done: true, attempts: 3, bestStars: 2 };
    s.buildings.find((b) => b.type === 'registrar')!.upgrade = { to: 2, end: 99, total: 60 };
    expect(migrate(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('keeps saved layouts, the one-time rename and the last rival when upgrading a v4 save', () => {
    const v4 = newGame() as unknown as Record<string, unknown>;
    v4.version = 4;
    delete v4.daily;
    v4.nameChanged = true;
    v4.lastRival = 'donut';
    const slot2 = { name: 'Turtle', pos: { 1: { x: 5, y: 5 } } };
    (v4.layouts as unknown[])[1] = slot2;
    const s = migrate(JSON.parse(JSON.stringify(v4)));
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.daily.day).toBeNull();
    expect(s.nameChanged).toBe(true);
    expect(s.lastRival).toBe('donut');
    expect(s.layouts[1]).toEqual(slot2);
    expect(s.layouts[0]?.pos[1]).toEqual({ x: 18, y: 18 });
  });

  it('rejects things that are not saves', () => {
    expect(() => migrate(null)).toThrow();
    expect(() => migrate('hello')).toThrow();
    expect(() => migrate([1, 2])).toThrow();
  });

  it('repairs wrong-shaped fields instead of passing them through', () => {
    const s = migrate({
      version: SAVE_VERSION,
      clock: 'soon',
      resources: { tuition: -50, coffee: NaN, chapel: '9' },
      buildings: [
        { id: 1, type: 'dmc', x: 18, y: 18, level: 99 },
        { id: 1, type: 'shed', x: 500, y: -4, level: 1 }, // duplicate id, off the map
        { id: 3, type: 'deathstar', x: 1, y: 1, level: 1 }, // unknown building
        { id: 4, type: 'wall', x: 5, y: 5, level: 0 }, // "under construction" with no timer
        'garbage',
      ],
      army: { freshman: -3, athlete: 2.9, dragon: 5 },
      trainQueue: [{ type: 'freshman', left: 999, total: 4 }, { type: 'dragon', left: 1, total: 1 }, null],
      troopLevels: { freshman: 42 },
      heroes: { prof: { level: 0, hpFrac: 7 } },
      trophies: -10,
      achievements: { freshman15: true, madeup: true, dmc3: 'yes' },
      events: [{ type: 'finals', end: 50 }, { type: 'meteor', end: 50 }],
      chapel: null,
      settings: { speedIdx: 17 },
    });
    expect(s.clock).toBe(0);
    expect(s.resources.tuition).toBe(0);
    expect(Number.isFinite(s.resources.coffee)).toBe(true);
    expect(s.buildings.map((b) => b.type)).toEqual(['dmc', 'shed', 'wall']);
    expect(new Set(s.buildings.map((b) => b.id)).size).toBe(3);
    expect(s.buildings[0].level).toBe(6);
    expect(s.buildings[1].x).toBeLessThanOrEqual(38);
    expect(s.buildings[1].y).toBe(0);
    expect(s.buildings[2].level).toBe(1);
    expect(s.nextId).toBeGreaterThan(Math.max(...s.buildings.map((b) => b.id)));
    expect(s.army).toEqual({ athlete: 2 });
    expect(s.trainQueue).toEqual([{ type: 'freshman', left: 4, total: 4 }]);
    expect(s.troopLevels.freshman).toBe(5);
    expect(s.troopLevels.nurse).toBe(1);
    expect(s.heroes.prof).toEqual({ level: 1, hpFrac: 1 });
    expect(s.trophies).toBe(0);
    expect(s.achievements).toEqual({ freshman15: true });
    expect(s.events).toEqual([{ type: 'finals', end: 50 }]);
    expect(s.chapel).toEqual({ lastDay: null, streak: 0 });
    expect(s.settings.speedIdx).toBe(2);
  });

  it('falls back to the starting campus when the DMC is missing', () => {
    const s = migrate({ version: SAVE_VERSION, buildings: [{ id: 1, type: 'shed', x: 5, y: 5, level: 1 }] });
    expect(s.buildings.some((b) => b.type === 'dmc')).toBe(true);
  });
});

describe('load / save', () => {
  it('starts fresh with no save', () => {
    const r = loadGame();
    expect(r.fresh).toBe(true);
    expect(r.recovered).toBeUndefined();
  });

  it('saves, loads, and keeps a backup of what it loaded', () => {
    const s = newGame();
    s.trophies = 77;
    expect(saveGame(s)).toBe(true);
    const r = loadGame();
    expect(r.fresh).toBe(false);
    expect(r.state.trophies).toBe(77);
    expect(store.get(BACKUP)).toBe(store.get(KEY));
  });

  it('credits time away as offline seconds', () => {
    const s = newGame();
    saveGame(s);
    const raw = JSON.parse(store.get(KEY)!);
    raw.lastReal = Date.now() - 3600_000;
    store.set(KEY, JSON.stringify(raw));
    const r = loadGame();
    expect(r.offlineSeconds).toBeGreaterThan(3590);
    expect(r.state.clock).toBeGreaterThan(3590);
  });

  it('restores the backup when the save is corrupt, and never deletes the corrupt one', () => {
    const s = newGame();
    s.trophies = 55;
    saveGame(s);
    loadGame(); // writes the backup
    store.set(KEY, '{"version":4,"resources":{"tui'); // truncated write
    const r = loadGame();
    expect(r.recovered).toBe('backup');
    expect(r.fresh).toBe(false);
    expect(r.state.trophies).toBe(55);
    expect(store.get(CORRUPT)).toBe('{"version":4,"resources":{"tui');
  });

  it('starts over, keeping the corrupt save aside, when there is no backup', () => {
    store.set(KEY, 'not json at all');
    const r = loadGame();
    expect(r.recovered).toBe('lost');
    expect(r.fresh).toBe(true);
    expect(store.get(CORRUPT)).toBe('not json at all');
  });

  it('export then import reproduces the campus', () => {
    const s = newGame();
    s.playerName = 'Cedar Café ☕';
    s.trophies = s.bestTrophies = 900;
    const text = exportSave(s);
    expect(decodeSave(text)).toEqual(s);
    const imported = importSave(text);
    expect(imported.trophies).toBe(900);
    expect(JSON.parse(store.get(KEY)!).playerName).toBe('Cedar Café ☕');
    expect(() => importSave('definitely not a save')).toThrow();
  });
});
