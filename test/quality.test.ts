import { describe, expect, it } from 'vitest';
import { FrameMonitor, lowerDpr, nextQuality } from '../src/core/quality';

const run = (m: FrameMonitor, dt: number, seconds: number): number => {
  let drops = 0;
  for (let t = 0; t < seconds; t += dt) if (m.sample(dt)) drops++;
  return drops;
};

describe('graphics quality', () => {
  it('leaves fast devices alone', () => {
    expect(run(new FrameMonitor(), 1 / 60, 30)).toBe(0);
  });

  it('steps down after a couple of seconds of slow frames', () => {
    const m = new FrameMonitor();
    expect(run(m, 1 / 60, 3)).toBe(0); // start-up settle time
    expect(run(m, 1 / 20, 2.2)).toBe(1);
  });

  it('ignores the slow first seconds (loading)', () => {
    const m = new FrameMonitor();
    expect(run(m, 1 / 10, 2.5)).toBe(0);
  });

  it('a short hiccup is not enough', () => {
    const m = new FrameMonitor();
    run(m, 1 / 60, 3);
    for (let i = 0; i < 6; i++) m.sample(0.1); // 0.6s of stutter
    expect(run(m, 1 / 60, 1.5)).toBe(0);
  });

  it('dpr steps 2 -> 1.5 -> 1 and stops', () => {
    expect(lowerDpr(2)).toBe(1.5);
    expect(lowerDpr(1.5)).toBe(1);
    expect(lowerDpr(1)).toBeNull();
    expect(lowerDpr(3)).toBe(1.5);
  });

  it('settings cycle Auto -> Sharp -> Battery saver -> Auto', () => {
    expect(nextQuality('auto')).toBe('sharp');
    expect(nextQuality('sharp')).toBe('saver');
    expect(nextQuality('saver')).toBe('auto');
  });
});
