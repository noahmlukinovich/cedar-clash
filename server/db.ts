// SQLite storage (Node's built-in node:sqlite, so there is no native module to compile).
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import type * as Sqlite from 'node:sqlite';

// Loaded via require so bundlers/test runners that don't know this newer builtin leave it alone.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof Sqlite;

export interface UserRow {
  id: number;
  name: string;
  pass: string;
  created: number;
  state: string;
  seq: number;
  trophies: number;
  dmc: number;
  shield_until: number;
  locked_until: number;
  last_seen: number;
}

export interface RaidRow {
  id: string;
  attacker: number;
  defender: number | null;
  setup: string;
  inputs: string;
  created: number;
  finished: number | null;
  result: string | null;
  seen: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass TEXT NOT NULL,
  created INTEGER NOT NULL,
  state TEXT NOT NULL,
  seq INTEGER NOT NULL DEFAULT 0,
  trophies INTEGER NOT NULL DEFAULT 0,
  dmc INTEGER NOT NULL DEFAULT 1,
  shield_until INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  last_seen INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS invites (
  code TEXT PRIMARY KEY,
  uses_left INTEGER NOT NULL,
  created INTEGER NOT NULL,
  note TEXT
);
CREATE TABLE IF NOT EXISTS raids (
  id TEXT PRIMARY KEY,
  attacker INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  defender INTEGER REFERENCES users(id) ON DELETE SET NULL,
  setup TEXT NOT NULL,
  inputs TEXT NOT NULL DEFAULT '[]',
  created INTEGER NOT NULL,
  finished INTEGER,
  result TEXT,
  seen INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS raids_open ON raids(finished, created);
CREATE INDEX IF NOT EXISTS raids_attacker ON raids(attacker, created);
CREATE INDEX IF NOT EXISTS raids_defender ON raids(defender, seen);
-- Last action batch applied per open copy of the game (one per device/tab), so a retried
-- request is recognised without one device's counter blocking another's.
CREATE TABLE IF NOT EXISTS client_seq (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client TEXT NOT NULL,
  seq INTEGER NOT NULL,
  updated INTEGER NOT NULL,
  PRIMARY KEY (user_id, client)
);
`;

export type DB = ReturnType<typeof openDb>;

export function openDb(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
  db.exec(SCHEMA);

  const st = {
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    userByName: db.prepare('SELECT * FROM users WHERE name = ?'),
    insertUser: db.prepare('INSERT INTO users (name, pass, created, state, last_seen) VALUES (?, ?, ?, ?, ?)'),
    saveUser: db.prepare('UPDATE users SET state = ?, seq = ?, trophies = ?, dmc = ?, shield_until = ?, locked_until = ?, last_seen = ? WHERE id = ?'),
    setName: db.prepare('UPDATE users SET name = ? WHERE id = ?'),
    setPass: db.prepare('UPDATE users SET pass = ? WHERE id = ?'),
    listUsers: db.prepare('SELECT id, name, trophies, dmc, created, last_seen FROM users ORDER BY id'),
    deleteUser: db.prepare('DELETE FROM users WHERE id = ?'),
    leaderboard: db.prepare('SELECT name, trophies, dmc FROM users ORDER BY trophies DESC, id ASC LIMIT 50'),
    candidates: db.prepare(
      'SELECT id FROM users WHERE id != ? AND shield_until < ? AND locked_until < ? ORDER BY ABS(trophies - ?) ASC LIMIT 12',
    ),
    recentDefenders: db.prepare('SELECT defender FROM raids WHERE attacker = ? AND defender IS NOT NULL AND created > ?'),

    clientSeq: db.prepare('SELECT seq FROM client_seq WHERE user_id = ? AND client = ?'),
    setClientSeq: db.prepare(
      'INSERT INTO client_seq (user_id, client, seq, updated) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, client) DO UPDATE SET seq = excluded.seq, updated = excluded.updated',
    ),
    purgeClientSeq: db.prepare('DELETE FROM client_seq WHERE updated < ?'),

    insertSession: db.prepare('INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)'),
    session: db.prepare('SELECT user_id, expires FROM sessions WHERE token = ?'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token = ?'),
    deleteUserSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
    purgeSessions: db.prepare('DELETE FROM sessions WHERE expires < ?'),

    insertInvite: db.prepare('INSERT INTO invites (code, uses_left, created, note) VALUES (?, ?, ?, ?)'),
    invite: db.prepare('SELECT * FROM invites WHERE code = ?'),
    useInvite: db.prepare('UPDATE invites SET uses_left = uses_left - 1 WHERE code = ? AND uses_left > 0'),
    listInvites: db.prepare('SELECT * FROM invites WHERE uses_left > 0 ORDER BY created'),
    setInviteUses: db.prepare('UPDATE invites SET uses_left = ? WHERE code = ?'),

    insertRaid: db.prepare('INSERT INTO raids (id, attacker, defender, setup, created) VALUES (?, ?, ?, ?, ?)'),
    raid: db.prepare('SELECT * FROM raids WHERE id = ?'),
    setInputs: db.prepare('UPDATE raids SET inputs = ? WHERE id = ? AND finished IS NULL'),
    finishRaid: db.prepare('UPDATE raids SET finished = ?, result = ?, inputs = ? WHERE id = ?'),
    openRaidsOf: db.prepare('SELECT * FROM raids WHERE attacker = ? AND finished IS NULL'),
    staleRaids: db.prepare('SELECT * FROM raids WHERE finished IS NULL AND created < ?'),
    unseenDefenses: db.prepare('SELECT * FROM raids WHERE defender = ? AND seen = 0 AND finished IS NOT NULL ORDER BY finished'),
    markSeen: db.prepare('UPDATE raids SET seen = 1 WHERE defender = ? AND seen = 0 AND finished IS NOT NULL'),
  };

  return {
    raw: db,
    st,
    tx<T>(fn: () => T): T {
      db.exec('BEGIN IMMEDIATE');
      try {
        const r = fn();
        db.exec('COMMIT');
        return r;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    close(): void {
      db.close();
    },
  };
}
