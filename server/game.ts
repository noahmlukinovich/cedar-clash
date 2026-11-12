// Server-side game rules: advancing time, applying actions, matchmaking, and settling raids
// by replaying them. All of this is synchronous, so requests can't interleave mid-update.
import { randomBytes, randomInt } from 'node:crypto';
import { LOOT_FRACTION, SCOUT_COST_PER_DMC } from '../src/config/balance';
import { BUILDINGS } from '../src/config/buildings';
import { bus } from '../src/core/bus';
import { type Action, applyAction } from '../src/game/actions';
import { tickArmy } from '../src/game/army';
import { dmcLevel, hasEvent, spend, tickEconomy } from '../src/game/economy';
import { checkChapelSkip, tickEvents } from '../src/game/events';
import { migrate } from '../src/game/save';
import { type GameState, newGame } from '../src/game/state';
import { type DefenseEntry, NAME_RE, type Note, type StateMsg, type VisitResponse } from '../src/net/protocol';
import type { BaseLayout, BasePiece } from '../src/raid/basegen';
import { MAX_INPUTS, type RaidInput, type RaidResult, type RaidSetup, SCOUT_TIME, replayRaid } from '../src/raid/engine';
import { type RaidOutcome, applyRaidOutcome, localSetup, trophyDelta } from '../src/raid/outcome';
import { HEROES, TROOPS } from '../src/config/troops';
import { SPELLS } from '../src/config/spells';
import { RAID_TIME } from '../src/config/balance';
import type { DB, RaidRow, UserRow } from './db';

export class GameError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** Longest offline gap simulated in one go (a month). */
const MAX_ADVANCE = 30 * 86400;
/** How long a defender stays locked (and a raid stays open) before it is settled automatically. */
const RAID_WINDOW_MS = (SCOUT_TIME + RAID_TIME + 90) * 1000;
const HOUR = 3600 * 1000;

// Capture things the shared game code announces on the bus during a request.
let notes: Note[] = [];
bus.on('ticket', (d: { text: string; fine: number }) => notes.push({ ev: 'ticket', data: d }));
bus.on('eventStart', (e: { type: string }) => notes.push({ ev: 'eventStart', data: { type: e.type } }));

export interface Loaded {
  row: UserRow;
  state: GameState;
}

const cryptoRand = (): number => randomInt(0, 2 ** 32) / 2 ** 32;

export function newPlayerState(name: string, now: number): GameState {
  const s = newGame();
  s.playerName = name;
  s.lastReal = now;
  return s;
}

/** Runs the economy forward to `now` (collectors, timers, training, random events). */
export function advance(s: GameState, now: number): void {
  const dt = Math.min(MAX_ADVANCE, Math.max(0, (now - s.lastReal) / 1000));
  s.lastReal = now;
  if (dt <= 0) return;
  s.clock += dt;
  tickEconomy(s, dt);
  tickArmy(s, dt);
  tickEvents(s, dt);
}

/**
 * Loads a player and brings their campus up to date. `quiet` drops the toasts this produces
 * (used when loading someone else, such as a raid's defender).
 */
export function load(db: DB, id: number, now: number, quiet = false): Loaded {
  const row = db.st.userById.get(id) as UserRow | undefined;
  if (!row) throw new GameError('No such player', 404);
  const state = migrate(JSON.parse(row.state));
  const keep = notes;
  if (quiet) notes = [];
  advance(state, now);
  if (quiet) notes = keep;
  return { row, state };
}

export function save(db: DB, u: Loaded, now: number, touch = true): void {
  const s = u.state;
  s.settings.speedIdx = 0;
  s.settings.debug = false;
  u.row.trophies = s.trophies;
  u.row.dmc = dmcLevel(s);
  if (touch) u.row.last_seen = now;
  db.st.saveUser.run(JSON.stringify(s), u.row.seq, u.row.trophies, u.row.dmc, u.row.shield_until, u.row.locked_until, u.row.last_seen, u.row.id);
}

function defenses(db: DB, userId: number): DefenseEntry[] {
  const rows = db.st.unseenDefenses.all(userId) as unknown as RaidRow[];
  if (!rows.length) return [];
  db.st.markSeen.run(userId);
  return rows.map((r) => {
    const res = JSON.parse(r.result ?? '{}') as SettledResult;
    return {
      id: 0,
      attacker: res.attackerName ?? 'Someone',
      stars: res.outcome?.stars ?? 0,
      destruction: res.outcome?.destruction ?? 0,
      tuition: res.defenderLost?.tuition ?? 0,
      coffee: res.defenderLost?.coffee ?? 0,
      trophies: res.defenderTrophies ?? 0,
      at: r.finished ?? 0,
    };
  });
}

function stateMsg(db: DB, u: Loaded, extra: Note[] = [], seq = 0): StateMsg {
  return { state: u.state, seq, shieldUntil: u.row.shield_until, notes: [...extra, ...takeNotes()], defenses: defenses(db, u.row.id) };
}

function takeNotes(): Note[] {
  const n = notes;
  notes = [];
  return n;
}

/** GET /api/me */
export function me(db: DB, userId: number, now: number): StateMsg {
  takeNotes();
  return db.tx(() => {
    settleStaleRaidsFor(db, userId, now);
    const u = load(db, userId, now);
    const extra: Note[] = [];
    const skip = checkChapelSkip(u.state);
    if (skip) extra.push({ ev: 'chapelSkip', data: skip });
    save(db, u, now);
    return stateMsg(db, u, extra);
  });
}

const CLIENT_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * POST /api/sync: apply a batch of actions. Each open copy of the game (device or tab) has
 * its own id and counter, so a retried batch is skipped without one device's counter
 * swallowing another device's actions. (Clients from before ids existed share 'legacy'.)
 */
export function sync(db: DB, userId: number, now: number, client: unknown, seq: unknown, actions: unknown): StateMsg & { errors: string[] } {
  if (!Number.isInteger(seq) || (seq as number) < 1) throw new GameError('Bad request');
  if (!Array.isArray(actions) || actions.length > 300) throw new GameError('Bad request');
  const cid = typeof client === 'string' && CLIENT_RE.test(client) ? client : null;
  takeNotes();
  return db.tx(() => {
    const u = load(db, userId, now);
    let last = cid ? ((db.st.clientSeq.get(userId, cid) as { seq: number } | undefined)?.seq ?? 0) : u.row.seq;
    const errors: string[] = [];
    actions.forEach((a: Action, i: number) => {
      const n = (seq as number) + i;
      if (n <= last) return; // already applied (a retried request)
      const r = applyAction(u.state, a);
      if (r.err) errors.push(r.err);
      last = n;
    });
    if (cid) db.st.setClientSeq.run(userId, cid, last, now);
    else u.row.seq = last;
    save(db, u, now);
    return { ...stateMsg(db, u, [], last), errors };
  });
}

// ---------- Visiting ----------

/**
 * GET /api/visit: the public, read-only view of a player's campus. Only the layout leaves the
 * server (no resources, army, research or stats), hidden traps are left out, and nothing about
 * the visited player is saved or touched.
 */
export function visit(db: DB, now: number, name: unknown): VisitResponse {
  if (typeof name !== 'string' || !NAME_RE.test(name)) throw new GameError('No such player', 404);
  const row = db.st.userByName.get(name) as UserRow | undefined;
  if (!row) throw new GameError('No such player', 404);
  const { state } = load(db, row.id, now, true); // brought up to date in memory only
  const buildings = state.buildings
    .filter((b) => BUILDINGS[b.type]?.category !== 'trap')
    .map((b, i) => ({ id: i + 1, type: b.type, x: b.x, y: b.y, level: b.level, ...(b.name ? { name: b.name } : {}), ...(b.upgrade ? { upgrading: true } : {}) }));
  return { name: row.name, trophies: state.trophies, dmc: dmcLevel(state), buildings };
}

// ---------- Raids ----------

/** A real player's campus as a raid target. */
export function baseFromState(s: GameState, name: string, attackerTrophies: number): BaseLayout {
  const pieces: BasePiece[] = s.buildings.filter((b) => b.level >= 1).map((b) => ({ type: b.type, level: b.level, x: b.x, y: b.y }));
  const stored = (t: string): number => s.buildings.filter((b) => b.type === t).reduce((a, b) => a + (b.stored ?? 0), 0);
  const diff = s.trophies - attackerTrophies;
  return {
    name,
    tagline: 'A real campus!',
    dmc: dmcLevel(s),
    pieces,
    loot: {
      tuition: Math.floor((s.resources.tuition + stored('admissions')) * LOOT_FRACTION),
      coffee: Math.floor((s.resources.coffee + stored('coffeecart')) * LOOT_FRACTION),
    },
    trophiesWin: Math.max(10, Math.min(50, 30 + Math.round(diff / 20))),
    trophiesLose: Math.max(5, Math.min(25, 15 - Math.round(diff / 40))),
  };
}

export function startRaid(db: DB, userId: number, now: number, kind: unknown): { raidId: string; setup: RaidSetup } {
  if (kind !== 'campaign' && kind !== 'random' && kind !== 'elephant') throw new GameError('Bad request');
  takeNotes();
  return db.tx(() => {
    // Only one raid at a time: settle any raid this player left unfinished.
    for (const r of db.st.openRaidsOf.all(userId) as unknown as RaidRow[]) settle(db, r, JSON.parse(r.inputs), now);
    const att = load(db, userId, now);
    const s = att.state;
    let setup: RaidSetup;
    let defenderId: number | null = null;
    if (kind === 'campaign') {
      if (s.campaignDone) throw new GameError('You already beat Rival State U');
      setup = localSetup(s, 'campaign', cryptoRand);
    } else if (kind === 'elephant') {
      if (!hasEvent(s, 'elephantrun')) throw new GameError('The Elephant Run is over');
      setup = localSetup(s, 'elephant', cryptoRand);
    } else {
      if (!s.campaignDone) throw new GameError('Beat Rival State U first!');
      if (!spend(s, 'tuition', SCOUT_COST_PER_DMC * dmcLevel(s))) throw new GameError('Not enough Tuition to scout.');
      const recent = new Set((db.st.recentDefenders.all(userId, now - HOUR) as { defender: number }[]).map((r) => r.defender));
      const ids = (db.st.candidates.all(userId, now, now, s.trophies) as { id: number }[]).map((r) => r.id).filter((id) => !recent.has(id));
      const pick = ids.slice(0, 5);
      setup = localSetup(s, 'random', cryptoRand);
      if (pick.length) {
        defenderId = pick[randomInt(0, pick.length)];
        const def = load(db, defenderId, now, true);
        def.row.locked_until = now + RAID_WINDOW_MS;
        save(db, def, now, false);
        setup = { ...setup, kind: 'player', base: baseFromState(def.state, def.row.name, s.trophies), defender: { name: def.row.name, trophies: def.state.trophies } };
      }
    }
    const raidId = randomBytes(16).toString('hex');
    db.st.insertRaid.run(raidId, userId, defenderId, JSON.stringify(setup), now);
    save(db, att, now);
    takeNotes();
    return { raidId, setup };
  });
}

/** Validates the shape of client-sent raid inputs (the engine re-checks game rules). */
export function parseInputs(v: unknown): RaidInput[] {
  if (!Array.isArray(v) || v.length > MAX_INPUTS) throw new GameError('Bad inputs');
  let last = 0;
  return v.map((i) => {
    if (!i || typeof i !== 'object') throw new GameError('Bad inputs');
    const { t, k, type, x, y } = i as Record<string, unknown>;
    if (!Number.isInteger(t) || (t as number) < last || (t as number) > 1e6) throw new GameError('Bad inputs');
    last = t as number;
    const num = (n: unknown): number => {
      if (typeof n !== 'number' || !Number.isFinite(n)) throw new GameError('Bad inputs');
      return n;
    };
    const ownKey = (o: object, key: unknown): boolean => typeof key === 'string' && Object.prototype.hasOwnProperty.call(o, key);
    switch (k) {
      case 'end':
        return { t: t as number, k };
      case 'ability':
        if (!ownKey(HEROES, type)) throw new GameError('Bad inputs');
        return { t: t as number, k, type } as RaidInput;
      case 'troop':
        if (!ownKey(TROOPS, type)) throw new GameError('Bad inputs');
        return { t: t as number, k, type, x: num(x), y: num(y) } as RaidInput;
      case 'hero':
        if (!ownKey(HEROES, type)) throw new GameError('Bad inputs');
        return { t: t as number, k, type, x: num(x), y: num(y) } as RaidInput;
      case 'spell':
        if (!ownKey(SPELLS, type)) throw new GameError('Bad inputs');
        return { t: t as number, k, type, x: num(x), y: num(y) } as RaidInput;
    }
    throw new GameError('Bad inputs');
  });
}

function ownRaid(db: DB, userId: number, raidId: unknown): RaidRow {
  if (typeof raidId !== 'string' || !/^[0-9a-f]{32}$/.test(raidId)) throw new GameError('Bad request');
  const r = db.st.raid.get(raidId) as RaidRow | undefined;
  if (!r || r.attacker !== userId) throw new GameError('No such raid', 404);
  return r;
}

/** POST /api/raid/inputs: store progress so an abandoned raid still counts. */
export function raidInputs(db: DB, userId: number, raidId: unknown, inputs: unknown): void {
  const r = ownRaid(db, userId, raidId);
  if (r.finished) return;
  const parsed = parseInputs(inputs);
  if (parsed.length < (JSON.parse(r.inputs) as unknown[]).length) return;
  db.st.setInputs.run(JSON.stringify(parsed), r.id);
}

interface SettledResult {
  result: RaidResult;
  outcome: RaidOutcome;
  attackerName: string;
  defenderLost?: { tuition: number; coffee: number };
  defenderTrophies?: number;
}

/** POST /api/raid/finish */
export function finishRaid(db: DB, userId: number, now: number, raidId: unknown, inputs: unknown): StateMsg & { outcome: RaidOutcome } {
  takeNotes();
  return db.tx(() => {
    const r = ownRaid(db, userId, raidId);
    const parsed = parseInputs(inputs);
    let outcome: RaidOutcome;
    if (r.finished) {
      // A retried request: return the stored outcome.
      outcome = (JSON.parse(r.result!) as SettledResult).outcome;
    } else outcome = settle(db, r, parsed, now);
    const u = load(db, userId, now);
    save(db, u, now);
    return { ...stateMsg(db, u), outcome };
  });
}

/** Replays a raid and applies it to the attacker (and defender, for real players). */
function settle(db: DB, r: RaidRow, inputs: RaidInput[], now: number): RaidOutcome {
  const setup = JSON.parse(r.setup) as RaidSetup;
  const result = replayRaid(setup, inputs);
  const att = load(db, r.attacker, now);
  const outcome = applyRaidOutcome(att.state, setup, result);
  const settled: SettledResult = { result, outcome, attackerName: att.row.name };
  if (r.defender != null) {
    const def = load(db, r.defender, now, true);
    def.row.locked_until = 0;
    if (!outcome.cancelled) {
      att.row.shield_until = 0; // attacking a real player drops your own shield
      const lost = takeLoot(def.state, result.loot);
      const delta = trophyDelta(setup, outcome.stars);
      const defTrophies = outcome.win ? -delta : setup.base.trophiesLose;
      def.state.trophies = Math.max(0, def.state.trophies + defTrophies);
      def.state.bestTrophies = Math.max(def.state.bestTrophies, def.state.trophies);
      if (outcome.stars === 3 || outcome.destruction >= 0.99) def.row.shield_until = Math.max(def.row.shield_until, now + 12 * HOUR);
      else if (outcome.destruction >= 0.4) def.row.shield_until = Math.max(def.row.shield_until, now + 6 * HOUR);
      settled.defenderLost = lost;
      settled.defenderTrophies = defTrophies;
    }
    save(db, def, now, false);
  }
  save(db, att, now, false);
  db.st.finishRaid.run(now, JSON.stringify(settled), JSON.stringify(inputs), r.id);
  // A cancelled raid against a player isn't news to them.
  if (outcome.cancelled && r.defender != null) db.raw.prepare('UPDATE raids SET seen = 1 WHERE id = ?').run(r.id);
  return outcome;
}

/** Removes looted resources from a defender: storage first, then uncollected collector stock. */
function takeLoot(s: GameState, loot: { tuition: number; coffee: number }): { tuition: number; coffee: number } {
  const take = (res: 'tuition' | 'coffee', collector: string, amt: number): number => {
    let left = Math.max(0, Math.floor(amt));
    const fromStore = Math.min(s.resources[res], left);
    s.resources[res] -= fromStore;
    left -= fromStore;
    for (const b of s.buildings) {
      if (left <= 0) break;
      if (b.type !== collector || !b.stored) continue;
      const n = Math.min(b.stored, left);
      b.stored -= n;
      left -= n;
    }
    return Math.floor(amt) - left;
  };
  return { tuition: take('tuition', 'admissions', loot.tuition), coffee: take('coffee', 'coffeecart', loot.coffee) };
}

function settleStaleRaidsFor(db: DB, userId: number, now: number): void {
  for (const r of db.st.openRaidsOf.all(userId) as unknown as RaidRow[]) {
    if (r.created < now - RAID_WINDOW_MS) settle(db, r, JSON.parse(r.inputs), now);
  }
}

/** Periodic sweep: settles raids whose players vanished, unlocking their defenders. */
export function settleStaleRaids(db: DB, now: number): number {
  const rows = db.st.staleRaids.all(now - RAID_WINDOW_MS) as unknown as RaidRow[];
  if (!rows.length) return 0;
  takeNotes();
  db.tx(() => {
    for (const r of rows) settle(db, r, JSON.parse(r.inputs), now);
  });
  takeNotes();
  return rows.length;
}
