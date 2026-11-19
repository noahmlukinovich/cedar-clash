import { describe, expect, it } from 'vitest';
import { Metrics, verdictFor, type MinuteStats } from '../server/metrics';

const minute = (lagP99: number, cpu: number): MinuteStats => ({ start: 0, lagP99, lagMax: lagP99, cpu, requests: 0, raidChecks: 0, raidCheckAvgMs: 0, raidCheckMaxMs: 0 });

describe('load verdict', () => {
  it('is ok with headroom, busy on a spike, overloaded when sustained', () => {
    expect(verdictFor([])).toBe('ok');
    expect(verdictFor([minute(5, 10), minute(8, 20)])).toBe('ok');
    expect(verdictFor([minute(5, 10), minute(150, 30)])).toBe('busy');
    expect(verdictFor([minute(5, 75)])).toBe('busy');
    // two bad minutes out of five is still only busy
    expect(verdictFor([minute(300, 50), minute(300, 50), minute(5, 10), minute(5, 10), minute(5, 10)])).toBe('busy');
    expect(verdictFor([minute(300, 50), minute(5, 90), minute(5, 10), minute(400, 20), minute(5, 10)])).toBe('overloaded');
    // old trouble ages out of the last five minutes
    expect(verdictFor([minute(300, 90), minute(300, 90), minute(300, 90), ...Array.from({ length: 5 }, () => minute(5, 10))])).toBe('ok');
  });
});

describe('Metrics', () => {
  it('counts active players and raid checks, and warns once on sustained overload', () => {
    let t = 1_000_000;
    const logs: string[] = [];
    const m = new Metrics(() => t, (msg) => logs.push(msg));
    m.request(1);
    m.request(2);
    m.request(2);
    m.request(null);
    expect(m.timeRaidCheck(() => 42)).toBe(42);
    expect(() => m.timeRaidCheck(() => { throw new Error('bad raid'); })).toThrow();
    t += 60_000;
    m.closeMinute(4, 9, 12);
    const r = m.report();
    expect(r.verdict).toBe('ok');
    expect(r.activePlayers).toBe(2);
    expect(r.minutes).toHaveLength(1);
    expect(r.minutes[0]).toMatchObject({ requests: 4, raidChecks: 1, lagP99: 4, cpu: 12 });
    expect(r.last15Minutes.raidChecks).toBe(1);

    for (let i = 0; i < 3; i++) {
      t += 60_000;
      m.closeMinute(400, 900, 88);
    }
    expect(m.report().verdict).toBe('overloaded');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('OVERLOADED');
    t += 60_000;
    m.closeMinute(400, 900, 88);
    expect(logs).toHaveLength(1); // no repeat while it stays overloaded

    for (let i = 0; i < 5; i++) {
      t += 60_000;
      m.closeMinute(3, 5, 5);
    }
    expect(m.report().verdict).toBe('ok');
    expect(logs[1]).toContain('back to normal');
    // players drop out of the active count after 5 quiet minutes
    expect(m.report().activePlayers).toBe(0);
    expect(m.report().minutes.length).toBeLessThanOrEqual(15);
  });
});
