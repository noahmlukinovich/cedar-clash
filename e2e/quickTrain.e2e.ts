import { expect, test } from '@playwright/test';
import { freshGame, layoutProblems } from './helpers';

test('Quick Train saves a preset and respects remaining troop capacity', async ({ page }, info) => {
  await freshGame(page);
  await page.locator('.hud .btn', { hasText: 'Army' }).first().click();
  await page.getByRole('button', { name: 'Quick Train', exact: true }).click();
  await expect(page.locator('.quick-army')).toHaveCount(3);
  await page.getByRole('button', { name: 'Create army', exact: true }).first().click();
  await page.getByLabel('Army name', { exact: true }).fill('Freshman Squad');
  const quantity = page.getByRole('spinbutton', { name: 'Freshman quantity', exact: true });
  await expect(quantity).toHaveAttribute('max', '20');
  await quantity.fill('21');
  await expect(page.getByRole('button', { name: 'Save army', exact: true })).toBeDisabled();
  await quantity.fill('5');
  await page.getByRole('button', { name: 'Save army', exact: true }).click();
  const army = page.locator('.quick-army').first();
  await expect(army.getByRole('heading')).toHaveText('Freshman Squad');
  await expect(army.locator('.quick-metrics')).toContainText('5/20');
  const train = army.getByRole('button', { name: 'Train army', exact: true });
  for (let i = 0; i < 4; i++) {
    await train.click();
    await expect(page.locator('.quick-availability')).toContainText(`${15 - i * 5} troop housing`);
  }
  await expect(train).toBeDisabled();
  await expect(army.locator('.quick-reason')).toContainText('0 available');
  await info.attach('quick-train.png', { body: await page.screenshot(), contentType: 'image/png' });
  expect(await layoutProblems(page)).toEqual([]);
});
