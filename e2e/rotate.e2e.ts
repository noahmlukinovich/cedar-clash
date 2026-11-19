import { expect, test } from '@playwright/test';

test('phones in portrait get the "turn your phone" prompt', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#rotate')).toBeVisible();
  await expect(page.locator('#rotate')).toContainText('Turn your phone sideways');
});

test('the prompt goes away in landscape', async ({ page }) => {
  await page.goto('/');
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('#rotate')).toBeHidden();
});
