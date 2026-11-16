import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../server/auth';
import { newPlayerState } from '../server/game';
import { setInviteUses, startServer } from '../server/main';
import type { MeResponse, RaidFinishResponse, RaidStartResponse, ReplayResponse, ReplayRow, SyncResponse, VisitResponse } from '../src/net/protocol';
import { replayRaid } from '../src/raid/engine';
import type { GameState } from '../src/game/state';
import { OBJECTIVES, dailyFor, dayKey } from '../src/game/daily';
import { playBot } from './helpers';

let srv: ReturnType<typeof startServer>;
let base = '';

beforeAll(async () => {
  srv = startServer({ dbPath: ':memory:', host: '127.0.0.1', port: 0, secureCookies: false });
  await srv.ready;
  base = `http://127.0.0.1:${srv.port}`;
  srv.db.st.insertInvite.run('TEST-CODE-0001', 10, Date.now(), 'tests');
});

afterAll(async () => {
  await srv.close();
});

class Client {
  cookie = '';
  async call<T = unknown>(path: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; data: T }> {
    const res = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'X-CC': '1', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(this.cookie ? { Cookie: this.cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    return { status: res.status, data: (await res.json()) as T };
  }
}

/** Edits a player's stored state directly (test setup only). */
function patchState(name: string, fn: (s: GameState) => void): void {
  const row = srv.db.st.userByName.get(name) as { id: number; state: string };
  const s = JSON.parse(row.state) as GameState;
  fn(s);
  srv.db.raw.prepare('UPDATE users SET state = ?, trophies = ? WHERE id = ?').run(JSON.stringify(s), s.trophies, row.id);
}

const alice = new Client();
const bob = new Client();

describe('accounts', () => {
  it('requires a valid invite code', async () => {
    const r = await new Client().call('/api/signup', { username: 'Nobody', password: 'longenough', invite: 'NOPE' });
    expect(r.status).toBe(400);
  });

  it('rejects unsafe campus names', async () => {
    const r = await new Client().call('/api/signup', { username: '<img src=x>', password: 'longenough', invite: 'TEST-CODE-0001' });
    expect(r.status).toBe(400);
  });

  it('signs up and logs in', async () => {
    expect((await alice.call('/api/signup', { username: 'Alice Hall', password: 'alicepass1', invite: 'test-code-0001' })).status).toBe(200);
    expect((await bob.call('/api/signup', { username: 'Bob_U', password: 'bobpass12', invite: 'TEST-CODE-0001' })).status).toBe(200);
    const dup = await new Client().call('/api/signup', { username: 'alice hall', password: 'whatever12', invite: 'TEST-CODE-0001' });
    expect(dup.status).toBe(409);
    const me = await alice.call<MeResponse>('/api/me');
    expect(me.status).toBe(200);
    expect(me.data.user.name).toBe('Alice Hall');
    expect(me.data.state.buildings.length).toBeGreaterThan(5);
    const relog = new Client();
    expect((await relog.call('/api/login', { username: 'ALICE HALL', password: 'wrong' })).status).toBe(401);
    expect((await relog.call('/api/login', { username: 'alice hall', password: 'alicepass1' })).status).toBe(200);
  });

  it('blocks requests without the CSRF header or from another origin', async () => {
    expect((await alice.call('/api/sync', { seq: 1, actions: [] }, { 'X-CC': '0' })).status).toBe(403);
    expect((await alice.call('/api/sync', { seq: 1, actions: [] }, { Origin: 'https://evil.example' })).status).toBe(403);
    expect((await new Client().call('/api/me')).status).toBe(401);
  });
});

describe('admin: invite-uses', () => {
  const left = (code: string): number | undefined => (srv.db.st.invite.get(code) as { uses_left: number } | undefined)?.uses_left;

  it('changes the sign-ups left on an existing code, case-insensitively', () => {
    srv.db.st.insertInvite.run('ADMIN-TEST-0001', 1, Date.now(), null);
    expect(setInviteUses(srv.db, ' admin-test-0001 ', 7)).toBe('ADMIN-TEST-0001');
    expect(left('ADMIN-TEST-0001')).toBe(7);
  });

  it('0 turns a code off and hides it from the unused list', () => {
    setInviteUses(srv.db, 'ADMIN-TEST-0001', 0);
    expect(left('ADMIN-TEST-0001')).toBe(0);
    const codes = (srv.db.st.listInvites.all() as { code: string }[]).map((r) => r.code);
    expect(codes).not.toContain('ADMIN-TEST-0001');
  });

  it('rejects unknown codes and bad numbers without changing anything', () => {
    expect(() => setInviteUses(srv.db, 'NO-SUCH-CODE', 3)).toThrow(/No invite code/);
    for (const bad of [-1, 1.5, 1001, NaN]) expect(() => setInviteUses(srv.db, 'ADMIN-TEST-0001', bad)).toThrow();
    expect(left('ADMIN-TEST-0001')).toBe(0);
  });
});

describe('economy runs on the server', () => {
  it('applies actions and skips retried ones', async () => {
    patchState('Alice Hall', (s) => (s.army = {}));
    const me = await alice.call<MeResponse>('/api/me');
    const before = me.data.state.resources.tuition;
    const r1 = await alice.call<SyncResponse>('/api/sync', { client: 'test-a', seq: me.data.seq + 1, actions: [{ k: 'train', type: 'freshman' }] });
    expect(r1.data.errors).toEqual([]);
    expect(r1.data.state.trainQueue.length).toBe(1);
    // same batch again (a network retry): must not train twice
    const r2 = await alice.call<SyncResponse>('/api/sync', { client: 'test-a', seq: me.data.seq + 1, actions: [{ k: 'train', type: 'freshman' }] });
    expect(r2.data.state.trainQueue.length).toBe(1);
    expect(r2.data.state.resources.tuition).toBeLessThanOrEqual(before);
  });

  it('rejects cheating actions', async () => {
    const me = await alice.call<MeResponse>('/api/me');
    const r = await alice.call<SyncResponse>('/api/sync', {
      client: 'test-b',
      seq: me.data.seq + 1,
      actions: [{ k: 'build', type: 'dmc', x: 5, y: 5 }, { k: 'move', id: 1, x: -5, y: 0 }, { k: 'collect', id: 999 }, { k: 'debugMoney' }],
    });
    expect(r.data.errors.length).toBe(4);
    expect(r.data.state.buildings.filter((b) => b.type === 'dmc').length).toBe(1);
  });
});

describe('two devices on one account', () => {
  it("keeps both devices' actions", async () => {
    const laptop = new Client();
    const phone = new Client();
    // created directly, so this test doesn't use up the per-network sign-up allowance
    srv.db.st.insertUser.run('Two Devices', await hashPassword('twodevices1'), Date.now(), JSON.stringify(newPlayerState('Two Devices', Date.now())), Date.now());
    await laptop.call('/api/login', { username: 'Two Devices', password: 'twodevices1' });
    await phone.call('/api/login', { username: 'Two Devices', password: 'twodevices1' });
    patchState('Two Devices', (s) => (s.army = {}));
    const lm = await laptop.call<MeResponse>('/api/me');
    const pm = await phone.call<MeResponse>('/api/me');
    // the phone sends a few actions first...
    let pseq = pm.data.seq;
    for (let i = 0; i < 3; i++) {
      const r = await phone.call<SyncResponse>('/api/sync', { client: 'phone-1', seq: ++pseq, actions: [{ k: 'train', type: 'freshman' }] });
      expect(r.data.errors).toEqual([]);
    }
    // ...then the laptop, which still has its own (now older) counter
    const r = await laptop.call<SyncResponse>('/api/sync', { client: 'laptop-1', seq: lm.data.seq + 1, actions: [{ k: 'train', type: 'freshman' }, { k: 'train', type: 'freshman' }] });
    expect(r.data.errors).toEqual([]);
    expect(r.data.state.trainQueue.length).toBe(5);
    // and a retry of the laptop's batch is still recognised as a duplicate
    const again = await laptop.call<SyncResponse>('/api/sync', { client: 'laptop-1', seq: lm.data.seq + 1, actions: [{ k: 'train', type: 'freshman' }, { k: 'train', type: 'freshman' }] });
    expect(again.data.state.trainQueue.length).toBe(5);
    srv.db.st.deleteUser.run((srv.db.st.userByName.get('Two Devices') as { id: number }).id);
  });
});

describe('real raids', () => {
  it('raids another player, verified by replay', async () => {
    patchState('Alice Hall', (s) => {
      s.campaignDone = true;
      s.army = { freshman: 40, athlete: 10 };
      s.trophies = 100;
    });
    patchState('Bob_U', (s) => {
      s.resources.tuition = 1000;
      s.trophies = 120;
    });
    const start = await alice.call<RaidStartResponse>('/api/raid/start', { kind: 'random' });
    expect(start.status).toBe(200);
    expect(start.data.setup.kind).toBe('player');
    expect(start.data.setup.defender?.name).toBe('Bob_U');
    // a second attacker can't hit Bob while he's under attack
    const carol = new Client();
    await carol.call('/api/signup', { username: 'Carol', password: 'carolpass', invite: 'TEST-CODE-0001' });
    patchState('Carol', (s) => {
      s.campaignDone = true;
      s.trophies = 120;
    });
    const other = await carol.call<RaidStartResponse>('/api/raid/start', { kind: 'random' });
    expect(other.status).toBe(200);
    expect(other.data.setup.defender?.name).not.toBe('Bob_U');
    await carol.call('/api/raid/finish', { raidId: other.data.raidId, inputs: [{ t: 0, k: 'end' }] });

    const inputs = [];
    for (let i = 0; i < 50; i++) inputs.push({ t: i * 2, k: 'troop', type: i < 40 ? 'freshman' : 'athlete', x: 2 + (i % 8) * 0.5, y: 2 });
    // claims 99 athletes; only 10 exist, so the replay ignores the rest
    for (let i = 0; i < 99; i++) inputs.push({ t: 120 + i, k: 'troop', type: 'athlete', x: 2, y: 2.5 });
    const fin = await alice.call<RaidFinishResponse>('/api/raid/finish', { raidId: start.data.raidId, inputs });
    expect(fin.status).toBe(200);
    expect(fin.data.outcome.cancelled).toBe(false);
    expect(fin.data.state.army.freshman ?? 0).toBe(0);
    expect(fin.data.state.army.athlete ?? 0).toBe(0);

    // retrying finish returns the same result and doesn't double-apply
    const again = await alice.call<RaidFinishResponse>('/api/raid/finish', { raidId: start.data.raidId, inputs });
    expect(again.data.outcome).toEqual(fin.data.outcome);
    expect(again.data.state.trophies).toBe(fin.data.state.trophies);

    // Bob hears about it, once
    const bobMe = await bob.call<MeResponse>('/api/me');
    expect(bobMe.data.defenses.length).toBe(1);
    expect(bobMe.data.defenses[0].attacker).toBe('Alice Hall');
    expect(bobMe.data.state.resources.tuition).toBe(1000 - bobMe.data.defenses[0].tuition);
    expect((await bob.call<MeResponse>('/api/me')).data.defenses.length).toBe(0);

    // both sides can list the raid and fetch its replay, which plays back to the official result
    const raidId = start.data.raidId;
    expect(bobMe.data.defenses[0].raidId).toBe(raidId);
    const aLog = await alice.call<ReplayRow[]>('/api/replays');
    expect(aLog.data).toEqual([expect.objectContaining({ id: raidId, role: 'attack', opponent: 'Bob_U', stars: fin.data.outcome.stars, tuition: fin.data.outcome.gotT, trophies: fin.data.outcome.trophyDelta })]);
    const bLog = await bob.call<ReplayRow[]>('/api/replays');
    expect(bLog.data).toEqual([expect.objectContaining({ id: raidId, role: 'defense', opponent: 'Alice Hall', tuition: bobMe.data.defenses[0].tuition })]);
    for (const c of [alice, bob]) {
      const rp = await c.call<ReplayResponse>('/api/replay?id=' + raidId);
      expect(rp.status).toBe(200);
      expect(rp.data.attacker).toBe('Alice Hall');
      const played = replayRaid(rp.data.setup, rp.data.inputs);
      expect(played.stars).toBe(rp.data.stars);
      expect(played.destruction).toBe(rp.data.destruction);
    }
    // nobody else can watch it; cancelled raids aren't listed or served; a login is required
    expect((await carol.call('/api/replay?id=' + raidId)).status).toBe(404);
    expect((await carol.call<ReplayRow[]>('/api/replays')).data).toEqual([]);
    expect((await carol.call('/api/replay?id=' + other.data.raidId)).status).toBe(404);
    expect((await alice.call('/api/replay?id=nope')).status).toBe(404);
    expect((await new Client().call('/api/replays')).status).toBe(401);
  });

  it('lets a defender take revenge once, free, and not through a shield', async () => {
    const log = await bob.call<ReplayRow[]>('/api/replays');
    const def = log.data.find((r) => r.role === 'defense' && r.opponent === 'Alice Hall')!;
    expect(def.revenge).toBe(true);
    // the attacker can't use it, and nonsense ids are refused
    expect((await alice.call('/api/raid/start', { kind: 'revenge', raidId: def.id })).status).toBe(404);
    expect((await bob.call('/api/raid/start', { kind: 'revenge', raidId: 'nope' })).status).toBe(404);
    // not through a shield
    srv.db.raw.prepare('UPDATE users SET shield_until = ? WHERE name = ?').run(Date.now() + 3600_000, 'Alice Hall');
    const shielded = await bob.call<{ error: string }>('/api/raid/start', { kind: 'revenge', raidId: def.id });
    expect(shielded.status).toBe(409);
    expect(shielded.data.error).toMatch(/shielded/);
    srv.db.raw.prepare('UPDATE users SET shield_until = 0 WHERE name = ?').run('Alice Hall');

    patchState('Bob_U', (s) => {
      s.army = { freshman: 10 };
      s.campaignDone = false; // revenge needs no campaign win
      s.resources.tuition = 0; // and costs no scouting fee
    });
    // calling it off without deploying doesn't use it up
    const first = await bob.call<RaidStartResponse>('/api/raid/start', { kind: 'revenge', raidId: def.id });
    expect(first.status).toBe(200);
    expect(first.data.setup.defender).toEqual({ name: 'Alice Hall', trophies: expect.any(Number), revenge: true });
    await bob.call('/api/raid/finish', { raidId: first.data.raidId, inputs: [{ t: 0, k: 'end' }] });
    expect((await bob.call<ReplayRow[]>('/api/replays')).data.find((r) => r.id === def.id)!.revenge).toBe(true);

    const start = await bob.call<RaidStartResponse>('/api/raid/start', { kind: 'revenge', raidId: def.id });
    expect(start.status).toBe(200);
    const fin = await bob.call<RaidFinishResponse>('/api/raid/finish', { raidId: start.data.raidId, inputs: [{ t: 0, k: 'troop', type: 'freshman', x: 1, y: 1 }] });
    expect(fin.data.outcome.cancelled).toBe(false);
    // used up, for both the log and a second try
    expect((await bob.call<ReplayRow[]>('/api/replays')).data.find((r) => r.id === def.id)!.revenge).toBe(false);
    expect((await bob.call('/api/raid/start', { kind: 'revenge', raidId: def.id })).status).toBe(409);
    // Alice hears about it, with her own revenge button
    const aliceMe = await alice.call<MeResponse>('/api/me');
    expect(aliceMe.data.defenses).toEqual([expect.objectContaining({ attacker: 'Bob_U', raidId: start.data.raidId, revenge: true })]);
    patchState('Bob_U', (s) => (s.campaignDone = true));
  });

  it('cannot finish someone else\'s raid or send malformed inputs', async () => {
    patchState('Alice Hall', (s) => (s.army = { freshman: 5 }));
    const start = await alice.call<RaidStartResponse>('/api/raid/start', { kind: 'random' });
    expect((await bob.call('/api/raid/finish', { raidId: start.data.raidId, inputs: [] })).status).toBe(404);
    expect((await alice.call('/api/raid/finish', { raidId: start.data.raidId, inputs: [{ t: -1, k: 'troop' }] })).status).toBe(400);
    expect((await alice.call('/api/raid/finish', { raidId: start.data.raidId, inputs: [{ t: 0, k: 'troop', type: '__proto__', x: 1, y: 1 }] })).status).toBe(400);
    const ok = await alice.call<RaidFinishResponse>('/api/raid/finish', { raidId: start.data.raidId, inputs: [{ t: 0, k: 'end' }] });
    expect(ok.data.outcome.cancelled).toBe(true);
    expect(ok.data.state.army.freshman).toBe(5);
  });

  it('settles an abandoned raid with the inputs it received', async () => {
    patchState('Alice Hall', (s) => (s.army = { freshman: 6 }));
    const start = await alice.call<RaidStartResponse>('/api/raid/start', { kind: 'random' });
    await alice.call('/api/raid/inputs', { raidId: start.data.raidId, inputs: [{ t: 0, k: 'troop', type: 'freshman', x: 1, y: 1 }] });
    // starting another raid settles the abandoned one first
    const next = await alice.call<RaidStartResponse>('/api/raid/start', { kind: 'random' });
    expect(next.data.setup.army.freshman).toBe(5);
    await alice.call('/api/raid/finish', { raidId: next.data.raidId, inputs: [{ t: 0, k: 'end' }] });
  });

  it('serves a leaderboard', async () => {
    const r = await alice.call<{ name: string; trophies: number }[]>('/api/leaderboard');
    expect(r.data.map((x) => x.name).sort()).toEqual(['Alice Hall', 'Bob_U', 'Carol']);
  });
});

describe('visiting another campus', () => {
  const rowOf = (name: string): Record<string, unknown> => ({ ...(srv.db.st.userByName.get(name) as Record<string, unknown>) });

  it('needs a login and a real player name', async () => {
    expect((await new Client().call('/api/visit?name=Bob_U')).status).toBe(401);
    expect((await alice.call('/api/visit?name=Nobody_Here')).status).toBe(404);
    expect((await alice.call('/api/visit?name=' + encodeURIComponent('<img src=x>'))).status).toBe(404);
    expect((await alice.call('/api/visit')).status).toBe(404);
  });

  it('shows only the public layout, hides traps, and leaves the visited player untouched', async () => {
    patchState('Bob_U', (s) => {
      s.buildings.push({ id: s.nextId++, type: 'nest', x: 5, y: 5, level: 1 }, { id: s.nextId++, type: 'wall', x: 6, y: 6, level: 1 });
      const b = s.buildings.find((x) => x.type === 'registrar')!;
      b.upgrade = { to: b.level + 1, end: s.clock + 1e6, total: 1e6 };
    });
    const before = rowOf('Bob_U');
    const r = await alice.call<VisitResponse>('/api/visit?name=bob_u'); // names are case-insensitive
    expect(r.status).toBe(200);
    expect(Object.keys(r.data).sort()).toEqual(['buildings', 'dmc', 'name', 'trophies']);
    expect(r.data.name).toBe('Bob_U');
    expect(r.data.trophies).toBe(before.trophies);
    const stored = JSON.parse(before.state as string) as GameState;
    expect(r.data.buildings.length).toBe(stored.buildings.length - 1);
    expect(r.data.buildings.some((b) => b.type === 'nest')).toBe(false);
    expect(r.data.buildings.some((b) => b.type === 'wall' && b.x === 6 && b.y === 6)).toBe(true);
    expect(r.data.buildings.find((b) => b.type === 'registrar')?.upgrading).toBe(true);
    for (const b of r.data.buildings) {
      for (const k of Object.keys(b)) expect(['id', 'type', 'x', 'y', 'level', 'name', 'upgrading']).toContain(k);
    }
    expect(JSON.stringify(r.data)).not.toMatch(/stored|resources|army|chapel|stats/);
    expect(rowOf('Bob_U')).toEqual(before); // state, last_seen, shield: nothing written
  });
});

describe('reserve army on the server', () => {
  it('holds trained troops until a raid frees room, then refills in the raid result', async () => {
    // Bob's campus, reset to full halls (20 at Residence Hall Lv1) and an empty queue
    const dana = bob;
    const full = 20;
    patchState('Bob_U', (s) => {
      s.army = { freshman: full };
      s.trainQueue = [];
      s.resources.coffee = 1000;
    });
    const me = await dana.call<MeResponse>('/api/me');
    expect(me.data.state.army.freshman).toBe(full);
    const r1 = await dana.call<SyncResponse>('/api/sync', { client: 'bob-reserve', seq: me.data.seq + 1, actions: [{ k: 'train', type: 'freshman' }, { k: 'train', type: 'freshman' }, { k: 'train', type: 'freshman' }] });
    expect(r1.data.errors).toEqual([]);
    expect(r1.data.state.trainQueue).toHaveLength(3);
    // a minute passes on the server: all three are trained, none can move in
    patchState('Bob_U', (s) => {
      s.lastReal -= 60_000;
      s.campaignDone = false; // so the tutorial raid is available
    });
    const later = await dana.call<MeResponse>('/api/me');
    expect(later.data.state.army.freshman).toBe(full);
    expect(later.data.state.trainQueue).toHaveLength(3);
    expect(later.data.state.trainQueue.every((q) => q.left === 0)).toBe(true);
    // a raid that uses two troops: the result already has two reserve troops in the halls
    const start = await dana.call<RaidStartResponse>('/api/raid/start', { kind: 'campaign' });
    expect(start.status).toBe(200);
    const fin = await dana.call<RaidFinishResponse>('/api/raid/finish', {
      raidId: start.data.raidId,
      inputs: [
        { t: 0, k: 'troop', type: 'freshman', x: 1, y: 1 },
        { t: 1, k: 'troop', type: 'freshman', x: 1, y: 1 },
        { t: 2, k: 'end' },
      ],
    });
    expect(fin.status).toBe(200);
    expect(fin.data.outcome.cancelled).toBe(false);
    expect(fin.data.state.army.freshman).toBe(full);
    expect(fin.data.state.trainQueue).toHaveLength(1);
  });
});

describe('rename', () => {
  it('lets a player rename once, keeping state and name in sync', async () => {
    const c = new Client();
    // inserted directly: the per-IP sign-up limit is already used up by earlier tests
    const now = Date.now();
    srv.db.st.insertUser.run('Renamer', await hashPassword('renamepass1'), now, JSON.stringify(newPlayerState('Renamer', now)), now);
    expect((await c.call('/api/login', { username: 'Renamer', password: 'renamepass1' })).status).toBe(200);
    expect((await c.call('/api/rename', { name: '<b>x</b>' })).status).toBe(400);
    expect((await c.call('/api/rename', { name: 'Alice Hall' })).status).toBe(409); // taken
    expect((await c.call('/api/rename', { name: 'Renamer' })).status).toBe(400); // unchanged
    const ok = await c.call<{ name: string }>('/api/rename', { name: 'Fresh Name' });
    expect(ok.status).toBe(200);
    const me = await c.call<MeResponse>('/api/me');
    expect(me.data.user.name).toBe('Fresh Name');
    expect(me.data.state.playerName).toBe('Fresh Name');
    expect(me.data.state.nameChanged).toBe(true);
    expect((await c.call('/api/rename', { name: 'Another One' })).status).toBe(409); // used up
    expect((await new Client().call('/api/login', { username: 'fresh name', password: 'renamepass1' })).status).toBe(200);
    expect((await new Client().call('/api/login', { username: 'Renamer', password: 'renamepass1' })).status).toBe(401);
  });

  it('requires login', async () => {
    expect((await new Client().call('/api/rename', { name: 'Whoever' })).status).toBe(401);
  });
});

describe('base layouts on the server', () => {
  it('stores layouts, switches between them, and upgrades accounts saved before layouts existed', async () => {
    const c = new Client();
    // inserted directly: the per-IP sign-up limit is already used up by earlier tests
    const now = Date.now();
    srv.db.st.insertUser.run('Layla', await hashPassword('laylapass1'), now, JSON.stringify(newPlayerState('Layla', now)), now);
    expect((await c.call('/api/login', { username: 'Layla', password: 'laylapass1' })).status).toBe(200);
    // an account stored by an older server has no layout fields at all
    patchState('Layla', (s) => {
      delete (s as Partial<GameState>).layouts;
      delete (s as Partial<GameState>).activeLayout;
      s.version = 3;
    });
    const me = await c.call<MeResponse>('/api/me');
    const s0 = me.data.state;
    expect(s0.layouts.map((l) => !!l)).toEqual([true, false, false]);
    const shed = s0.buildings.find((b) => b.type === 'shed')!;
    const pos = Object.fromEntries(s0.buildings.map((b) => [b.id, { x: b.x, y: b.y }]));
    pos[shed.id] = { x: 4, y: 4 };
    const r = await c.call<SyncResponse>('/api/sync', {
      client: 'layout-1',
      seq: 1,
      actions: [
        { k: 'layoutSave', slot: 1, pos },
        { k: 'layoutName', slot: 1, name: 'War base' },
        { k: 'layoutUse', slot: 1 },
        { k: 'layoutSave', slot: 2, pos: { [shed.id]: { x: 4, y: 4 } } }, // incomplete: refused
      ],
    });
    expect(r.data.errors.length).toBe(1);
    const s1 = (await c.call<MeResponse>('/api/me')).data.state;
    expect(s1.activeLayout).toBe(1);
    expect(s1.layouts[1]!.name).toBe('War base');
    expect(s1.layouts[2]).toBeNull();
    const moved = s1.buildings.find((b) => b.id === shed.id)!;
    expect([moved.x, moved.y]).toEqual([4, 4]);
    // the original arrangement is still there to go back to
    expect(s1.layouts[0]!.pos[shed.id]).toEqual({ x: shed.x, y: shed.y });
  });
});

describe('daily challenge on the server', () => {
  it("serves today's challenge, verifies it by replay, and pays once per day without touching the army", async () => {
    patchState('Alice Hall', (s) => {
      s.army = { freshman: 7 };
      s.trainQueue = []; // no reserve troops waiting to move in after the raid
      s.trophies = 300;
      s.daily = { day: null, done: false, attempts: 0, bestStars: 0 };
    });
    const before = (await alice.call<MeResponse>('/api/me')).data.state;
    const start = await alice.call<RaidStartResponse>('/api/raid/start', { kind: 'daily' });
    expect(start.status).toBe(200);
    const setup = start.data.setup;
    expect(setup.kind).toBe('daily');
    expect(setup.daily?.day).toBe(dayKey());
    expect(setup.army).toEqual(dailyFor(dayKey(), setup.daily!.dmc).army);
    expect(setup.heroes).toEqual({});

    // try a few openings locally and send one that clears the objective (if any does)
    let pick = playBot(setup, 0);
    for (let dir = 1; dir < 8 && !OBJECTIVES[dailyFor(setup.daily!.day, setup.daily!.dmc).objectiveId].met(pick.result.metrics); dir++) pick = playBot(setup, dir);
    const passed = OBJECTIVES[dailyFor(setup.daily!.day, setup.daily!.dmc).objectiveId].met(pick.result.metrics);

    const fin = await alice.call<RaidFinishResponse>('/api/raid/finish', { raidId: start.data.raidId, inputs: pick.inputs });
    expect(fin.status).toBe(200);
    const o = fin.data.outcome;
    expect(o.daily?.passed).toBe(passed);
    expect(o.stars).toBe(pick.result.stars);
    expect(fin.data.state.army).toEqual({ freshman: 7 });
    expect(fin.data.state.trophies).toBe(300);
    expect(fin.data.state.resources.tuition).toBe(before.resources.tuition);
    expect(fin.data.state.daily).toMatchObject({ day: dayKey(), done: passed, attempts: 1 });
    if (passed) expect(o.daily?.reward).toBe(dailyFor(dayKey(), setup.daily!.dmc).reward);

    // a second clear the same day pays nothing more
    if (passed) {
      const again = await alice.call<RaidStartResponse>('/api/raid/start', { kind: 'daily' });
      const fin2 = await alice.call<RaidFinishResponse>('/api/raid/finish', { raidId: again.data.raidId, inputs: pick.inputs });
      expect(fin2.data.outcome.daily).toEqual({ objectiveId: o.daily!.objectiveId, passed: true, reward: 0 });
      expect(fin2.data.state.daily.attempts).toBe(2);
    }
  });

  it('matches computer rivals to trophies and never serves the same layout twice running', async () => {
    // nobody else is open to attack for an hour after the raids above, so these are computer rivals
    patchState('Alice Hall', (s) => {
      s.campaignDone = true;
      s.army = { freshman: 3 };
      s.resources.tuition = 100000;
    });
    let last = '';
    for (let i = 0; i < 4; i++) {
      const r = await alice.call<RaidStartResponse>('/api/raid/start', { kind: 'random' });
      expect(r.status).toBe(200);
      if (r.data.setup.kind === 'random') {
        expect(r.data.setup.base.archetype).toBeDefined();
        expect(r.data.setup.base.difficulty).toBeDefined();
        expect(r.data.setup.base.archetype).not.toBe(last);
        last = r.data.setup.base.archetype!;
      }
      await alice.call('/api/raid/finish', { raidId: r.data.raidId, inputs: [{ t: 0, k: 'end' }] });
    }
  });
});
