import { expect, test } from '@playwright/test';
import { freshGame } from './helpers';

// Installing to the home screen. Runs on the iphone-13 project.

test('the manifest and icons are served and linked', async ({ page, request }) => {
  await page.goto('/');
  expect(await page.locator('link[rel="manifest"]').getAttribute('href')).toBe('manifest.json');
  expect(await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')).toBe('apple-touch-icon.png');
  const m = await request.get('/manifest.json');
  expect(m.ok()).toBe(true);
  const manifest = await m.json();
  expect(manifest).toMatchObject({ display: 'fullscreen', orientation: 'landscape', start_url: './' });
  for (const src of [...manifest.icons.map((i: { src: string }) => i.src), 'apple-touch-icon.png']) {
    const r = await request.get('/' + src);
    expect(r.ok(), src).toBe(true);
    expect(r.headers()['content-type']).toBe('image/png');
  }
});

test('Chrome sees the game as installable', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1000);
  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  expect(installabilityErrors.map((e) => e.errorId)).toEqual([]);
});

test('on iPhone, Settings explains Add to Home Screen', async ({ page }) => {
  await freshGame(page);
  await page.locator('.side-right .btn.round').first().dispatchEvent('click');
  const b = page.locator('.modal .btn', { hasText: 'Add to Home Screen' });
  await expect(b).toBeVisible();
  await b.dispatchEvent('click');
  await expect(page.locator('.modal')).toContainText('Share');
});

test('once installed, the button is gone', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));
  await freshGame(page);
  await page.locator('.side-right .btn.round').first().dispatchEvent('click');
  await expect(page.locator('.modal .btn', { hasText: 'Graphics' })).toBeVisible();
  await expect(page.locator('.modal .btn', { hasText: 'Add to Home Screen' })).toHaveCount(0);
});
