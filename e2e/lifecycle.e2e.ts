import { expect, test, type Page } from '@playwright/test';
import { deployPoint, freshGame, startRaid, units } from './helpers';
import { Fingers } from './touch';

// Phone lifecycle (background, close, battery). Runs on the iphone-13 project.

const g = (page: Page, fn: string) => page.evaluate(`(() => { const game = window.game; return ${fn}; })()`);

/** Pretend the app went to the background for `seconds`, then came back. */
async function background(page: Page, seconds: number): Promise<void> {
  await page.evaluate((secs) => {
    const set = (h: boolean) => Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    set(true);
    document.dispatchEvent(new Event('visibilitychange'));
    (window as any).game.hiddenAt -= secs * 1000;
    set(false);
    document.dispatchEvent(new Event('visibilitychange'));
  }, seconds);
}

async function deploySome(page: Page, n: number): Promise<void> {
  const p = await deployPoint(page);
  const f = await Fingers.on(page);
  for (let i = 0; i < n; i++) {
    await f.tap(p.x + i * 6, p.y);
    await page.waitForTimeout(120);
  }
  await expect.poll(() => units(page)).toBe(n);
}

test.beforeEach(async ({ page }) => {
  await freshGame(page);
});

test('a raid carries on while the app is in the background', async ({ page }) => {
  await startRaid(page);
  await deploySome(page, 2);
  const t0 = (await g(page, 'game.raid.engine.tick')) as number;
  await background(page, 60);
  const t1 = (await g(page, 'game.raid.engine.tick')) as number;
  expect(t1 - t0).toBeGreaterThanOrEqual(60 * 30 - 5);
  await expect(page.locator('.toast', { hasText: 'while you were away' })).toBeVisible();
});

test('a long absence finishes the raid and shows the results', async ({ page }) => {
  await startRaid(page);
  await deploySome(page, 2);
  await background(page, 600);
  await expect.poll(() => g(page, 'game.raid?.engine.ended ?? true')).toBe(true);
  await expect(page.locator('.modal, .results, .result-stars').first()).toBeVisible({ timeout: 10_000 });
});

test('a short trip to the background changes nothing', async ({ page }) => {
  await startRaid(page);
  await deploySome(page, 1);
  const t0 = (await g(page, 'game.raid.engine.tick')) as number;
  await background(page, 0.5);
  const t1 = (await g(page, 'game.raid.engine.tick')) as number;
  expect(t1 - t0).toBeLessThan(30);
  await expect(page.locator('.toast', { hasText: 'while you were away' })).toHaveCount(0);
});

test('offline: closing the app mid-raid still counts the raid on next launch', async ({ page }) => {
  const before = (await g(page, 'game.state.army.freshman')) as number;
  await startRaid(page);
  await deploySome(page, 3);
  await page.reload(); // like the phone killing the app
  await page.waitForFunction(() => (window as any).game?.state);
  await expect(page.locator('.toast', { hasText: 'finished while you were away' })).toBeVisible({ timeout: 10_000 });
  expect(await g(page, 'game.state.army.freshman')).toBe(before - 3);
  expect(await page.evaluate(() => localStorage.getItem('cedarville-clash-raid'))).toBeNull();
  // and only once
  await page.reload();
  await page.waitForFunction(() => (window as any).game?.state);
  expect(await g(page, 'game.state.army.freshman')).toBe(before - 3);
});

test('offline: a finished raid leaves nothing to settle later', async ({ page }) => {
  await startRaid(page);
  await deploySome(page, 1);
  await page.locator('.raid-end').dispatchEvent('click');
  await page.locator('.modal .btn, .result-btns .btn').first().waitFor();
  expect(await page.evaluate(() => localStorage.getItem('cedarville-clash-raid'))).toBeNull();
});

test('battery saver draws fewer pixels at 30 fps; Auto restores sharpness', async ({ page }) => {
  await page.evaluate(() => (window as any).game.setQuality('saver'));
  expect(await g(page, 'game.dpr')).toBe(1);
  const fps = await page.evaluate(
    () =>
      new Promise<number>((res) => {
        const g = (window as any).game;
        const start = g.state.clock;
        const t0 = performance.now();
        let frames = 0;
        const orig = g.scene.draw.bind(g.scene);
        g.scene.draw = (...a: unknown[]) => {
          frames++;
          return orig(...a);
        };
        setTimeout(() => {
          g.scene.draw = orig;
          res(frames / ((performance.now() - t0) / 1000));
          void start;
        }, 2000);
      }),
  );
  expect(fps).toBeLessThan(33);
  await page.evaluate(() => (window as any).game.setQuality('auto'));
  expect(await g(page, 'game.dpr')).toBe(await page.evaluate(() => Math.min(2, devicePixelRatio)));
  expect(await page.evaluate(() => localStorage.getItem('cedarville-clash-quality'))).toBe('auto');
});

test('Settings has the graphics switch', async ({ page }) => {
  await page.locator('.side-right .btn.round').first().dispatchEvent('click');
  const b = page.locator('.modal .btn', { hasText: 'Graphics' });
  await expect(b).toHaveText(/Auto/);
  await b.dispatchEvent('click');
  await expect(page.locator('.modal .btn', { hasText: 'Graphics' })).toHaveText(/Sharp/);
});
