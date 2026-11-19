import { describe, expect, it } from 'vitest';
import { Camera } from '../src/core/camera';

describe('camera glide after a touch flick', () => {
  it('moves opposite the finger and slows to a stop', () => {
    const c = new Camera();
    c.x = 0;
    c.fling(-1000, 0); // finger flicked left: campus keeps sliding, camera moves right
    let last = c.x;
    let steps = 0;
    while ((c.vx || c.vy) && steps < 600) {
      c.update(1 / 60);
      expect(c.x).toBeGreaterThanOrEqual(last);
      last = c.x;
      steps++;
    }
    expect(c.x).toBeGreaterThan(100);
    expect(steps).toBeLessThan(120); // stops within about two seconds
  });

  it('stops at the edge of the world', () => {
    const c = new Camera();
    c.x = 1290;
    c.fling(-5000, 0);
    for (let i = 0; i < 30; i++) c.update(1 / 60);
    expect(c.x).toBe(1300);
    expect(c.vx).toBe(0);
  });

  it('stopFling halts it at once', () => {
    const c = new Camera();
    c.fling(800, 800);
    c.stopFling();
    const x = c.x;
    c.update(1 / 60);
    expect(c.x).toBe(x);
  });

  it('zoomAt keeps the point under the fingers still', () => {
    const c = new Camera();
    const before = c.screenToWorld(300, 200);
    c.zoomAt(300, 200, 1.7);
    const after = c.screenToWorld(300, 200);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });
});
