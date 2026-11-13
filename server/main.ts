// Cedar Clash game server: a small JSON API on 127.0.0.1, behind Caddy (which serves the
// built game and terminates HTTPS). Also a tiny admin CLI (invites, users, passwords).
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { NAME_RULES, validCampusName } from '../src/net/protocol';
import { DUMMY_HASH, RateLimiter, hashPassword, newInviteCode, newToken, tokenHash, verifyPassword } from './auth';
import { type DB, type UserRow, openDb } from './db';
import { GameError, finishRaid, me, newPlayerState, raidInputs, renameUser, settleStaleRaids, startRaid, sync, visit } from './game';

const SESSION_DAYS = 30;
const COOKIE = 'cc_session';
const MAX_BODY = 512 * 1024;

export interface ServerConfig {
  dbPath: string;
  host: string;
  port: number;
  /** Mark cookies Secure (true behind HTTPS; false only for local development over http). */
  secureCookies: boolean;
}

export function configFromEnv(): ServerConfig {
  return {
    dbPath: process.env.DB_PATH ?? './data/cedar-clash.db',
    host: process.env.HOST ?? '127.0.0.1',
    port: Number(process.env.PORT ?? 8787),
    secureCookies: process.env.COOKIE_SECURE !== '0',
  };
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function clientIp(req: IncomingMessage): string {
  // Caddy sets X-Forwarded-For; we only listen on localhost, so it can be trusted.
  const xff = req.headers['x-forwarded-for'];
  const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim();
  return first || req.socket.remoteAddress || '?';
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'Request too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!size) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'Bad JSON'));
      }
    });
    req.on('error', reject);
  });
}

function getCookie(req: IncomingMessage, name: string): string | null {
  const h = req.headers.cookie;
  if (!h) return null;
  for (const part of h.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function createApp(db: DB, cfg: ServerConfig) {
  const loginFails = new RateLimiter(10, 15 * 60 * 1000);
  const signups = new RateLimiter(5, 60 * 60 * 1000);
  const requests = new RateLimiter(240, 60 * 1000);

  const cookie = (value: string, maxAge: number): string =>
    `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${cfg.secureCookies ? '; Secure' : ''}`;

  function startSession(res: ServerResponse, userId: number): void {
    const token = newToken();
    db.st.insertSession.run(tokenHash(token), userId, Date.now() + SESSION_DAYS * 86400 * 1000);
    res.setHeader('Set-Cookie', cookie(token, SESSION_DAYS * 86400));
  }

  function sessionUser(req: IncomingMessage): number | null {
    const token = getCookie(req, COOKIE);
    if (!token || token.length > 100) return null;
    const row = db.st.session.get(tokenHash(token)) as { user_id: number; expires: number } | undefined;
    if (!row || row.expires < Date.now()) return null;
    return row.user_id;
  }

  function requireUser(req: IncomingMessage): number {
    const id = sessionUser(req);
    if (id == null) throw new HttpError(401, 'Please log in');
    return id;
  }

  async function signup(req: IncomingMessage, res: ServerResponse, body: Record<string, unknown>): Promise<unknown> {
    const ip = clientIp(req);
    const { username, password, invite } = body;
    if (!validCampusName(username)) throw new HttpError(400, NAME_RULES);
    if (typeof password !== 'string' || password.length < 8 || password.length > 200) throw new HttpError(400, 'Passwords need at least 8 characters');
    if (typeof invite !== 'string' || invite.length > 40) throw new HttpError(400, 'Invite code required');
    if (!signups.hit(ip)) throw new HttpError(429, 'Too many sign-ups from here. Try again later.');
    const code = invite.trim().toUpperCase();
    const inv = db.st.invite.get(code) as { uses_left: number } | undefined;
    if (!inv || inv.uses_left <= 0) throw new HttpError(400, "That invite code isn't valid");
    if (db.st.userByName.get(username)) throw new HttpError(409, 'That campus name is taken');
    const hash = await hashPassword(password);
    const now = Date.now();
    const id = db.tx(() => {
      // re-check inside the transaction (the hash above was async)
      if (db.st.userByName.get(username)) throw new HttpError(409, 'That campus name is taken');
      if (!Number(db.st.useInvite.run(code).changes)) throw new HttpError(400, "That invite code isn't valid");
      const r = db.st.insertUser.run(username, hash, now, JSON.stringify(newPlayerState(username, now)), now);
      return Number(r.lastInsertRowid);
    });
    startSession(res, id);
    return { ok: true };
  }

  async function login(req: IncomingMessage, res: ServerResponse, body: Record<string, unknown>): Promise<unknown> {
    const ip = clientIp(req);
    const { username, password } = body;
    if (typeof username !== 'string' || typeof password !== 'string' || username.length > 40 || password.length > 200) throw new HttpError(400, 'Bad request');
    const key = `${ip}|${username.toLowerCase()}`;
    if (loginFails.blocked(key) || loginFails.blocked(ip)) throw new HttpError(429, 'Too many attempts. Wait 15 minutes and try again.');
    const user = db.st.userByName.get(username) as UserRow | undefined;
    const ok = await verifyPassword(password, user?.pass ?? DUMMY_HASH);
    if (!user || !ok) {
      loginFails.hit(key);
      loginFails.hit(ip); // per-IP budget too, across all names
      throw new HttpError(401, 'Wrong campus name or password');
    }
    loginFails.clear(key);
    startSession(res, user.id);
    return { ok: true };
  }

  async function route(req: IncomingMessage, res: ServerResponse): Promise<unknown> {
    const url = new URL(req.url ?? '/', 'http://x');
    const path = url.pathname;
    const method = req.method ?? 'GET';
    if (!path.startsWith('/api/')) throw new HttpError(404, 'Not found');
    if (path === '/api/health') return { ok: true, loggedIn: sessionUser(req) != null };
    if (!requests.hit(clientIp(req))) throw new HttpError(429, 'Slow down a little');

    let body: Record<string, unknown> = {};
    if (method === 'POST') {
      // CSRF: SameSite=Strict cookies, plus a custom header and JSON body that a
      // cross-site form can't send, plus an Origin check when the browser sends one.
      if (req.headers['x-cc'] !== '1') throw new HttpError(403, 'Forbidden');
      if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) throw new HttpError(415, 'JSON only');
      const origin = req.headers.origin;
      if (origin) {
        let host = '';
        try {
          host = new URL(origin).host;
        } catch {
          /* invalid */
        }
        if (host !== req.headers.host) throw new HttpError(403, 'Forbidden');
      }
      const b = await readBody(req);
      if (!b || typeof b !== 'object' || Array.isArray(b)) throw new HttpError(400, 'Bad request');
      body = b as Record<string, unknown>;
    } else if (method !== 'GET') throw new HttpError(405, 'Method not allowed');

    const now = Date.now();
    const post = (p: string): boolean => method === 'POST' && path === p;
    if (post('/api/signup')) return signup(req, res, body);
    if (post('/api/login')) return login(req, res, body);
    if (post('/api/logout')) {
      const token = getCookie(req, COOKIE);
      if (token) db.st.deleteSession.run(tokenHash(token));
      res.setHeader('Set-Cookie', cookie('', 0));
      return { ok: true };
    }
    if (method === 'GET' && path === '/api/me') {
      const id = requireUser(req);
      const row = db.st.userById.get(id) as unknown as UserRow;
      return { user: { id, name: row.name }, ...me(db, id, now) };
    }
    if (method === 'GET' && path === '/api/leaderboard') {
      requireUser(req);
      return db.st.leaderboard.all();
    }
    if (method === 'GET' && path === '/api/visit') {
      requireUser(req);
      return visit(db, now, url.searchParams.get('name'));
    }
    if (post('/api/rename')) return renameUser(db, requireUser(req), now, body.name);
    if (post('/api/sync')) return sync(db, requireUser(req), now, body.client, body.seq, body.actions);
    if (post('/api/raid/start')) return startRaid(db, requireUser(req), now, body.kind);
    if (post('/api/raid/inputs')) {
      raidInputs(db, requireUser(req), body.raidId, body.inputs);
      return { ok: true };
    }
    if (post('/api/raid/finish')) return finishRaid(db, requireUser(req), now, body.raidId, body.inputs);
    throw new HttpError(404, 'Not found');
  }

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    let status = 200;
    let out: unknown;
    try {
      out = await route(req, res);
    } catch (e) {
      if (e instanceof HttpError || e instanceof GameError) {
        status = e.status;
        out = { error: e.message };
      } else {
        status = 500;
        out = { error: 'Something went wrong on the server' };
        console.error(new Date().toISOString(), req.method, req.url, e);
      }
    }
    const json = JSON.stringify(out ?? null);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(json);
  };
}

export function startServer(cfg: ServerConfig): { close: () => Promise<void>; port: number; ready: Promise<void>; db: DB } {
  const db = openDb(cfg.dbPath);
  const handler = createApp(db, cfg);
  const server = createServer((req, res) => void handler(req, res));
  server.headersTimeout = 15000;
  server.requestTimeout = 30000;
  const sweep = setInterval(() => {
    try {
      settleStaleRaids(db, Date.now());
      db.st.purgeSessions.run(Date.now());
      db.st.purgeClientSeq.run(Date.now() - 30 * 86400 * 1000);
    } catch (e) {
      console.error('sweep failed', e);
    }
  }, 60 * 1000);
  const ready = new Promise<void>((res) => server.listen(cfg.port, cfg.host, () => res()));
  return {
    db,
    ready,
    get port() {
      const a = server.address();
      return typeof a === 'object' && a ? a.port : cfg.port;
    },
    close: () =>
      new Promise((res) => {
        clearInterval(sweep);
        server.close(() => {
          db.close();
          res();
        });
      }),
  };
}

// ---------- CLI ----------

/** Sets how many sign-ups an existing invite code has left (0 turns it off). Returns the normalized code. */
export function setInviteUses(db: DB, code: string, uses: number): string {
  if (!Number.isInteger(uses) || uses < 0 || uses > 1000) throw new Error('uses must be a whole number from 0 to 1000');
  const c = code.trim().toUpperCase();
  if (!Number(db.st.setInviteUses.run(uses, c).changes)) throw new Error(`No invite code ${c}`);
  return c;
}

export async function cli(args: string[]): Promise<void> {
  const cfg = configFromEnv();
  const [cmd, ...rest] = args;
  if (!cmd || cmd === 'serve') {
    const s = startServer(cfg);
    await s.ready;
    console.log(`Cedar Clash server listening on http://${cfg.host}:${s.port} (db: ${cfg.dbPath})`);
    const stop = (): void => void s.close().then(() => process.exit(0));
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
    return;
  }
  const db = openDb(cfg.dbPath);
  try {
    if (cmd === 'invite') {
      const uses = Math.max(1, Math.min(1000, Number(rest[0] ?? 1) || 1));
      const code = newInviteCode();
      db.st.insertInvite.run(code, uses, Date.now(), rest.slice(1).join(' ') || null);
      console.log(`${code}  (good for ${uses} sign-up${uses === 1 ? '' : 's'})`);
    } else if (cmd === 'invite-uses') {
      const [code, n] = rest;
      if (!code || n === undefined || !/^\d+$/.test(n)) throw new Error('usage: invite-uses <code> <uses left (0 turns it off)>');
      const c = setInviteUses(db, code, Number(n));
      console.log(Number(n) === 0 ? `${c} is turned off (0 sign-ups left).` : `${c} now has ${n} sign-up${n === '1' ? '' : 's'} left.`);
    } else if (cmd === 'invites') {
      for (const r of db.st.listInvites.all() as { code: string; uses_left: number; note: string | null }[]) console.log(`${r.code}  ${r.uses_left} left  ${r.note ?? ''}`);
    } else if (cmd === 'users') {
      for (const u of db.st.listUsers.all() as { id: number; name: string; trophies: number; dmc: number; last_seen: number }[]) {
        console.log(`${String(u.id).padStart(4)}  ${u.name.padEnd(20)}  DMC ${u.dmc}  ${String(u.trophies).padStart(5)} trophies  last seen ${new Date(u.last_seen).toISOString()}`);
      }
    } else if (cmd === 'passwd') {
      const [name, pw] = rest;
      const u = db.st.userByName.get(name ?? '') as UserRow | undefined;
      if (!u || !pw || pw.length < 8) throw new Error('usage: passwd <campus name> <new password (8+ chars)>');
      db.st.setPass.run(await hashPassword(pw), u.id);
      db.st.deleteUserSessions.run(u.id);
      console.log(`Password changed for ${u.name}; their sessions were logged out.`);
    } else if (cmd === 'delete-user') {
      const u = db.st.userByName.get(rest[0] ?? '') as UserRow | undefined;
      if (!u) throw new Error('usage: delete-user <campus name>');
      db.st.deleteUser.run(u.id);
      console.log(`Deleted ${u.name}.`);
    } else {
      console.log('Commands: serve | invite [uses] [note] | invite-uses <code> <n> | invites | users | passwd <name> <password> | delete-user <name>');
      process.exitCode = 1;
    }
  } finally {
    db.close();
  }
}
