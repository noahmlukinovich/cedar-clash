// Online mode: talks to the game server. The server owns the real GameState; the client
// applies actions immediately for responsiveness and then adopts the server's copy.
import type { Action } from '../game/actions';
import type { BuildingInst, GameState } from '../game/state';
import type { RaidInput } from '../raid/engine';
import type {
  LeaderRow,
  MeResponse,
  RaidFinishResponse,
  RaidStartRequest,
  RaidStartResponse,
  StateMsg,
  SyncResponse,
  UserInfo,
} from './protocol';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, body?: unknown, timeoutMs = 15000): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? { 'X-CC': '1' } : { 'Content-Type': 'application/json', 'X-CC': '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      signal: ctl.signal,
    });
    const txt = await res.text();
    let data: unknown = null;
    try {
      data = txt ? JSON.parse(txt) : null;
    } catch {
      /* not JSON */
    }
    if (!res.ok) throw new ApiError((data as { error?: string } | null)?.error ?? `Server error (${res.status})`, res.status);
    return data as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError("Can't reach the server", 0);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Copies the server's state into the live local object in place, keeping building objects
 * (which UI panels hold references to) the same objects where ids match.
 */
export function adoptState(local: GameState, server: GameState): void {
  const byId = new Map(local.buildings.map((b) => [b.id, b]));
  const buildings: BuildingInst[] = server.buildings.map((sb) => {
    const lb = byId.get(sb.id);
    if (!lb) return sb;
    for (const k of Object.keys(lb) as (keyof BuildingInst)[]) if (!(k in sb)) delete lb[k];
    Object.assign(lb, sb);
    return lb;
  });
  const settings = local.settings;
  Object.assign(local, server);
  local.buildings = buildings;
  // sound etc. are per-device; debug speed is never allowed online
  local.settings = { ...settings, speedIdx: 0, debug: false };
}

const POLL_SECONDS = 20;

export class OnlineSession {
  private queue: Action[] = [];
  private seq: number;
  private inFlight = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private pollT = 0;
  private retryT = 0;
  offline = false;
  shieldUntil = 0;

  constructor(
    public user: UserInfo,
    me: MeResponse,
    /** Called with every state message from the server. */
    private onState: (m: StateMsg, adopt: boolean) => void,
    private onError: (msg: string) => void,
    private busy: () => boolean,
  ) {
    this.seq = me.seq;
    this.shieldUntil = me.shieldUntil;
  }

  get idle(): boolean {
    return !this.inFlight && this.queue.length === 0;
  }

  enqueue(a: Action): void {
    this.queue.push(a);
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => void this.flush(), 120);
  }

  async flush(): Promise<void> {
    if (this.inFlight) return;
    this.flushTimer = null;
    const batch = this.queue.slice();
    const seq = this.seq + 1;
    this.inFlight = true;
    try {
      const r = await api<SyncResponse>('/api/sync', { seq, actions: batch });
      this.queue.splice(0, batch.length);
      this.seq = r.seq;
      this.shieldUntil = r.shieldUntil;
      this.offline = false;
      for (const e of r.errors) this.onError(e);
      // Only adopt when nothing newer is waiting, or local optimistic changes would flicker.
      this.onState(r, this.queue.length === 0 && !this.busy());
    } catch (e) {
      this.offline = true;
      this.retryT = 3;
      if ((e as ApiError).status === 401) this.onError('You were logged out. Reload to log in again.');
    } finally {
      this.inFlight = false;
    }
    if (this.queue.length && !this.offline) void this.flush();
  }

  /** Called every frame: periodic refresh, and retries after a network error. */
  tick(dt: number): void {
    if (this.busy()) return;
    if (this.offline) {
      this.retryT -= dt;
      if (this.retryT <= 0 && !this.inFlight) void this.flush();
      return;
    }
    this.pollT += dt;
    if (this.pollT >= POLL_SECONDS && this.idle) {
      this.pollT = 0;
      void this.flush();
    }
  }

  async startRaid(kind: RaidStartRequest['kind']): Promise<RaidStartResponse> {
    await this.flush();
    return api<RaidStartResponse>('/api/raid/start', { kind } satisfies RaidStartRequest);
  }

  private lastPushed = 0;
  /** Streams inputs so an abandoned raid still counts. */
  pushInputs(raidId: string, inputs: RaidInput[]): void {
    if (inputs.length === this.lastPushed) return;
    this.lastPushed = inputs.length;
    void api('/api/raid/inputs', { raidId, inputs }).catch(() => (this.lastPushed = -1));
  }

  async finishRaid(raidId: string, inputs: RaidInput[]): Promise<RaidFinishResponse> {
    this.lastPushed = 0;
    let lastErr: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const r = await api<RaidFinishResponse>('/api/raid/finish', { raidId, inputs });
        this.shieldUntil = r.shieldUntil;
        return r;
      } catch (e) {
        lastErr = e;
        if ((e as ApiError).status !== 0) break;
        await new Promise((res) => setTimeout(res, 1000 * 2 ** attempt));
      }
    }
    throw lastErr;
  }

  leaderboard(): Promise<LeaderRow[]> {
    return api<LeaderRow[]>('/api/leaderboard');
  }

  async logout(): Promise<void> {
    await api('/api/logout', {});
  }
}
