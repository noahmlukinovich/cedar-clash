import type { CDPSession, Page } from '@playwright/test';

/** Real multi-finger touches through the Chrome DevTools Protocol. */
export class Fingers {
  private constructor(
    private cdp: CDPSession,
    private page: Page,
  ) {}

  static async on(page: Page): Promise<Fingers> {
    return new Fingers(await page.context().newCDPSession(page), page);
  }

  private send(type: 'touchStart' | 'touchMove' | 'touchEnd', pts: { x: number; y: number }[]): Promise<unknown> {
    return this.cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i, radiusX: 4, radiusY: 4, force: 1 })),
    });
  }

  async tap(x: number, y: number): Promise<void> {
    await this.send('touchStart', [{ x, y }]);
    await this.page.waitForTimeout(40);
    await this.send('touchEnd', []);
  }

  /** Put one finger down and leave it there. */
  async press(x: number, y: number): Promise<void> {
    await this.send('touchStart', [{ x, y }]);
  }

  async release(): Promise<void> {
    await this.send('touchEnd', []);
  }

  /** One finger from a to b in `steps` moves, `ms` apart, after resting `holdMs`. */
  async drag(a: { x: number; y: number }, b: { x: number; y: number }, steps = 10, ms = 16, lift = true, holdMs = 0): Promise<void> {
    await this.send('touchStart', [a]);
    await this.page.waitForTimeout(ms + holdMs);
    for (let i = 1; i <= steps; i++) {
      await this.send('touchMove', [{ x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps }]);
      await this.page.waitForTimeout(ms);
    }
    if (lift) await this.send('touchEnd', []);
  }

  /** Two fingers that both start together and move from a pair to b pair. */
  async two(a: [{ x: number; y: number }, { x: number; y: number }], b: [{ x: number; y: number }, { x: number; y: number }], steps = 10): Promise<void> {
    await this.send('touchStart', a);
    await this.page.waitForTimeout(16);
    for (let i = 1; i <= steps; i++) {
      const f = i / steps;
      await this.send('touchMove', [0, 1].map((k) => ({ x: a[k].x + (b[k].x - a[k].x) * f, y: a[k].y + (b[k].y - a[k].y) * f })));
      await this.page.waitForTimeout(16);
    }
    await this.send('touchEnd', []);
  }
}

/** Reads the camera of the current scene. */
export function cam(page: Page): Promise<{ x: number; y: number; zoom: number; vx: number; vy: number }> {
  return page.evaluate(() => {
    const c = (window as any).game.scene.cam;
    return { x: c.x, y: c.y, zoom: c.zoom, vx: c.vx, vy: c.vy };
  });
}
