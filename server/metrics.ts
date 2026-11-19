// Load monitoring: answers "is one CPU core still enough?". The server handles one request
// at a time, so the signal that matters is event-loop lag: how long a request waits behind
// other work (mostly raid checks, which replay the whole raid). Kept in memory, per minute,
// for the last 15 minutes. Read it at /api/status; sustained overload is logged as a warning.
import { monitorEventLoopDelay } from 'node:perf_hooks';

const MINUTE = 60 * 1000;
const KEEP_MINUTES = 15;
const ACTIVE_WINDOW = 5 * MINUTE;

/** Waiting longer than this (99th percentile, in ms) makes the game feel sluggish. */
export const BUSY_LAG_MS = 100;
/** At this much lag, requests are visibly stuck behind each other. */
export const OVERLOADED_LAG_MS = 250;
/** systemd caps the service at 90% of a core (CPUQuota), so 85% is effectively full. */
export const BUSY_CPU = 70;
export const OVERLOADED_CPU = 85;
/** Overloaded means at least this many of the last 5 minutes were over the limits above. */
const OVERLOADED_MINUTES = 3;

export interface MinuteStats {
  /** Start of the minute (ms since epoch). */
  start: number;
  /** Event-loop lag in ms: 99th percentile and worst. */
  lagP99: number;
  lagMax: number;
  /** CPU used by the game process, as a percentage of one core. */
  cpu: number;
  requests: number;
  raidChecks: number;
  raidCheckAvgMs: number;
  raidCheckMaxMs: number;
}

export type Verdict = 'ok' | 'busy' | 'overloaded';

export interface StatusReport {
  verdict: Verdict;
  advice: string;
  uptimeMinutes: number;
  activePlayers: number;
  last15Minutes: {
    lagP99Worst: number;
    cpuAvg: number;
    cpuMax: number;
    requestsPerMinute: number;
    raidChecks: number;
    raidCheckAvgMs: number;
    raidCheckMaxMs: number;
  };
  thresholds: { busyLagMs: number; overloadedLagMs: number; busyCpu: number; overloadedCpu: number };
  /** Oldest first. */
  minutes: MinuteStats[];
}

const round = (n: number, dp = 1): number => Math.round(n * 10 ** dp) / 10 ** dp;

const isOver = (m: MinuteStats): boolean => m.lagP99 >= OVERLOADED_LAG_MS || m.cpu >= OVERLOADED_CPU;
const isBusy = (m: MinuteStats): boolean => m.lagP99 >= BUSY_LAG_MS || m.cpu >= BUSY_CPU;

/** Judges the most recent minutes (oldest first). */
export function verdictFor(minutes: MinuteStats[]): Verdict {
  const recent = minutes.slice(-5);
  if (recent.filter(isOver).length >= OVERLOADED_MINUTES) return 'overloaded';
  if (recent.some(isBusy)) return 'busy';
  return 'ok';
}

const ADVICE: Record<Verdict, string> = {
  ok: 'Plenty of headroom.',
  busy: 'Getting busy at times. Fine for now, but keep an eye on it if it stays like this during normal play.',
  overloaded:
    'One core is no longer enough: requests are queueing behind each other. Move to a bigger droplet (and raise CPUQuota), then consider checking raids on worker threads.',
};

export class Metrics {
  private readonly started: number;
  private minutes: MinuteStats[] = [];
  private cur: { start: number; requests: number; raidChecks: number; raidMs: number; raidMax: number };
  private active = new Map<number, number>();
  private lag = monitorEventLoopDelay({ resolution: 10 });
  private cpuAt = process.cpuUsage();
  private timer: ReturnType<typeof setInterval> | null = null;
  private warned = false;

  constructor(
    private now: () => number = Date.now,
    private log: (msg: string) => void = (m) => console.warn(new Date().toISOString(), m),
  ) {
    this.started = now();
    this.cur = this.fresh(this.started);
  }

  private fresh(start: number) {
    return { start, requests: 0, raidChecks: 0, raidMs: 0, raidMax: 0 };
  }

  /** Starts sampling; call stop() when the server closes. */
  start(): void {
    this.lag.enable();
    this.cpuAt = process.cpuUsage();
    this.timer = setInterval(() => this.rollMinute(), MINUTE);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.lag.disable();
  }

  request(userId: number | null): void {
    this.cur.requests++;
    if (userId != null) this.active.set(userId, this.now());
  }

  /** Runs a raid check and records how long it took (rejected requests aren't counted). */
  timeRaidCheck<T>(fn: () => T): T {
    const t0 = performance.now();
    const out = fn();
    const ms = performance.now() - t0;
    this.cur.raidChecks++;
    this.cur.raidMs += ms;
    this.cur.raidMax = Math.max(this.cur.raidMax, ms);
    return out;
  }

  /** Closes the current minute using the real lag histogram and CPU counters. */
  private rollMinute(): void {
    const elapsed = Math.max(1, this.now() - this.cur.start);
    const used = process.cpuUsage(this.cpuAt);
    this.cpuAt = process.cpuUsage();
    const hasLag = this.lag.count > 0;
    this.closeMinute(
      hasLag ? this.lag.percentile(99) / 1e6 : 0,
      hasLag ? this.lag.max / 1e6 : 0,
      ((used.user + used.system) / 1000 / elapsed) * 100,
    );
    this.lag.reset();
  }

  /** Records a finished minute. Separate from rollMinute so tests can feed in numbers. */
  closeMinute(lagP99: number, lagMax: number, cpu: number): void {
    const c = this.cur;
    this.minutes.push({
      start: c.start,
      lagP99: round(lagP99),
      lagMax: round(lagMax),
      cpu: round(cpu),
      requests: c.requests,
      raidChecks: c.raidChecks,
      raidCheckAvgMs: c.raidChecks ? round(c.raidMs / c.raidChecks) : 0,
      raidCheckMaxMs: round(c.raidMax),
    });
    if (this.minutes.length > KEEP_MINUTES) this.minutes.shift();
    const now = this.now();
    this.cur = this.fresh(now);
    for (const [id, t] of this.active) if (t < now - ACTIVE_WINDOW) this.active.delete(id);

    const v = verdictFor(this.minutes);
    if (v === 'overloaded' && !this.warned) {
      this.warned = true;
      const m = this.minutes[this.minutes.length - 1];
      this.log(`OVERLOADED: one CPU core is no longer enough (lag p99 ${m.lagP99} ms, CPU ${m.cpu}%, ${this.activePlayers()} active players). See /api/status.`);
    } else if (v === 'ok' && this.warned) {
      this.warned = false;
      this.log('Load is back to normal.');
    }
  }

  activePlayers(): number {
    const since = this.now() - ACTIVE_WINDOW;
    let n = 0;
    for (const t of this.active.values()) if (t >= since) n++;
    return n;
  }

  report(): StatusReport {
    const ms = this.minutes;
    const checks = ms.reduce((a, m) => a + m.raidChecks, 0);
    const verdict = verdictFor(ms);
    return {
      verdict,
      advice: ADVICE[verdict],
      uptimeMinutes: Math.floor((this.now() - this.started) / MINUTE),
      activePlayers: this.activePlayers(),
      last15Minutes: {
        lagP99Worst: ms.reduce((a, m) => Math.max(a, m.lagP99), 0),
        cpuAvg: ms.length ? round(ms.reduce((a, m) => a + m.cpu, 0) / ms.length) : 0,
        cpuMax: ms.reduce((a, m) => Math.max(a, m.cpu), 0),
        requestsPerMinute: ms.length ? round(ms.reduce((a, m) => a + m.requests, 0) / ms.length) : 0,
        raidChecks: checks,
        raidCheckAvgMs: checks ? round(ms.reduce((a, m) => a + m.raidCheckAvgMs * m.raidChecks, 0) / checks) : 0,
        raidCheckMaxMs: ms.reduce((a, m) => Math.max(a, m.raidCheckMaxMs), 0),
      },
      thresholds: { busyLagMs: BUSY_LAG_MS, overloadedLagMs: OVERLOADED_LAG_MS, busyCpu: BUSY_CPU, overloadedCpu: OVERLOADED_CPU },
      minutes: ms,
    };
  }
}
