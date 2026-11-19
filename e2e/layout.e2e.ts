import { expect, test, type Page } from '@playwright/test';
import { freshGame, layoutProblems } from './helpers';
import { KNOWN } from './known-issues';

/** How to reach each screen from a fresh offline game. */
const SCREENS: Record<string, (page: Page) => Promise<void>> = {
  welcome: (page) => freshGame(page, { keepWelcome: true }),
  village: (page) => freshGame(page),
  shop: async (page) => {
    await freshGame(page);
    await openFromHud(page, 'Shop');
  },
  army: async (page) => {
    await freshGame(page);
    await openFromHud(page, 'Army');
  },
  attack: async (page) => {
    await freshGame(page);
    await openFromHud(page, 'Attack!');
  },
  raid: async (page) => {
    await SCREENS.attack(page);
    await page.locator('.modal .btn', { hasText: 'Rival State U' }).first().dispatchEvent('click');
    await page.locator('.raid-top').waitFor();
  },
};

// dispatchEvent, not tap: a tap would land on whatever covers the button,
// and covered buttons are something the checks report on their own.
async function openFromHud(page: Page, label: string): Promise<void> {
  await page.locator('.hud .btn', { hasText: label }).first().dispatchEvent('click');
  await page.locator('.modal').waitFor();
}

for (const [screen, open] of Object.entries(SCREENS)) {
  test(screen, async ({ page }, info) => {
    await open(page);
    await page.waitForTimeout(600); // let open animations settle
    await info.attach(`${screen}.png`, { body: await page.screenshot(), contentType: 'image/png' });
    const found = (await layoutProblems(page)).map((p) => `${p.check}: ${p.detail}`).sort();
    const known = [...(KNOWN[`${info.project.name}/${screen}`] ?? [])].sort();
    expect(
      found,
      'Layout problems changed. New ones need fixing; fixed ones should be removed from e2e/known-issues.ts.',
    ).toEqual(known);
  });
}
