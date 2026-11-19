// Page code below imports game modules from the Vite dev server by URL;
// String() keeps TypeScript from trying to resolve those paths.
import { expect, test, type Page } from '@playwright/test';
import { freshGame } from './helpers';
import { cam, Fingers } from './touch';

// Touch behaves the same on every phone, so these run on one phone project;
// the mouse tests run on the desktop project.
const isTouch = (name: string): boolean => name === 'iphone-13';

/** Screen point of a building's middle that isn't under a HUD element. */
async function buildingPoint(page: Page): Promise<{ id: number; x: number; y: number }> {
  return page.evaluate(async () => {
    const { toWorld } = await import(String('/src/core/iso.ts'));
    const g = (window as any).game;
    const canvas = document.getElementById('game');
    for (const b of g.state.buildings) {
      const sz = (await import(String('/src/config/buildings.ts'))).BUILDINGS[b.type].size;
      if (sz < 2) continue;
      const w = toWorld(b.x + sz / 2, b.y + sz / 2);
      const s = g.village.cam.worldToScreen(w.x, w.y - 10);
      if (s.x < 60 || s.y < 60 || s.x > innerWidth - 60 || s.y > innerHeight - 60) continue;
      if (document.elementFromPoint(s.x, s.y) !== canvas) continue;
      if (g.village.pick(s.x, s.y)?.id !== b.id) continue;
      return { id: b.id, x: s.x, y: s.y };
    }
    throw new Error('no building on screen');
  });
}

/** Screen point on grass where the raid allows deploying, clear of the HUD. */
async function deployPoint(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate(async () => {
    const { toGrid } = await import(String('/src/core/iso.ts'));
    const r = (window as any).game.raid;
    const canvas = document.getElementById('game');
    for (let y = 80; y < innerHeight - 80; y += 20) {
      for (let x = 80; x < innerWidth - 80; x += 20) {
        if (document.elementFromPoint(x, y) !== canvas) continue;
        const w = r.cam.screenToWorld(x, y);
        const g = toGrid(w.x, w.y);
        const gx = Math.round(g.gx * 4) / 4;
        const gy = Math.round(g.gy * 4) / 4;
        if (gx < 1 || gy < 1 || gx > 39 || gy > 39) continue;
        if (r.sim.canDeploy(gx, gy) && r.sim.canDeploy(gx + 3, gy) && r.sim.canDeploy(gx - 3, gy)) return { x, y };
      }
    }
    throw new Error('no deployable grass on screen');
  });
}

async function startRaid(page: Page): Promise<void> {
  await page.locator('.hud .btn', { hasText: 'Attack!' }).first().dispatchEvent('click');
  await page.locator('.modal .btn', { hasText: 'Rival State U' }).first().dispatchEvent('click');
  await page.locator('.raid-top').waitFor();
  await page.waitForTimeout(500);
}

const units = (page: Page): Promise<number> => page.evaluate(() => (window as any).game.raid.sim.units.length);
const mid = (page: Page) => page.evaluate(() => ({ x: innerWidth / 2, y: innerHeight / 2 }));

test.describe('touch', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(!isTouch(info.project.name), 'touch tests run on iphone-13');
    await freshGame(page);
  });

  test('one finger drags the campus without selecting', async ({ page }) => {
    const f = await Fingers.on(page);
    const m = await mid(page);
    const before = await cam(page);
    await f.drag({ x: m.x, y: m.y }, { x: m.x - 120, y: m.y - 60 }, 10, 30);
    await page.waitForTimeout(50);
    const after = await cam(page);
    expect(after.x - before.x).toBeGreaterThan(80 / before.zoom);
    expect(after.y - before.y).toBeGreaterThan(30 / before.zoom);
    expect(await page.evaluate(() => (window as any).game.village.selectedId)).toBe(-1);
  });

  test('a small wobble still counts as a tap', async ({ page }) => {
    const f = await Fingers.on(page);
    const b = await buildingPoint(page);
    await f.drag({ x: b.x, y: b.y }, { x: b.x + 7, y: b.y + 4 }, 3);
    await expect.poll(() => page.evaluate(() => (window as any).game.village.selectedId)).toBe(b.id);
  });

  test('tapping a building selects it', async ({ page }) => {
    const f = await Fingers.on(page);
    const b = await buildingPoint(page);
    await f.tap(b.x, b.y);
    await expect.poll(() => page.evaluate(() => (window as any).game.village.selectedId)).toBe(b.id);
    await expect(page.locator('.sel-panel').first()).toBeVisible();
  });

  test('pinching zooms around the fingers', async ({ page }) => {
    const f = await Fingers.on(page);
    const m = await mid(page);
    const before = await cam(page);
    const anchor = await page.evaluate(({ x, y }) => (window as any).game.scene.cam.screenToWorld(x, y), m);
    await f.two(
      [{ x: m.x - 40, y: m.y }, { x: m.x + 40, y: m.y }],
      [{ x: m.x - 100, y: m.y }, { x: m.x + 100, y: m.y }],
    );
    const after = await cam(page);
    expect(after.zoom / before.zoom).toBeGreaterThan(2);
    const still = await page.evaluate(({ x, y }) => (window as any).game.scene.cam.screenToWorld(x, y), m);
    expect(Math.abs(still.x - anchor.x)).toBeLessThan(3);
    expect(Math.abs(still.y - anchor.y)).toBeLessThan(3);
    expect(await page.evaluate(() => (window as any).game.village.selectedId)).toBe(-1);
  });

  test('pinching in zooms out', async ({ page }) => {
    const f = await Fingers.on(page);
    const m = await mid(page);
    const before = await cam(page);
    await f.two(
      [{ x: m.x - 120, y: m.y }, { x: m.x + 120, y: m.y }],
      [{ x: m.x - 60, y: m.y }, { x: m.x + 60, y: m.y }],
    );
    expect((await cam(page)).zoom).toBeLessThan(before.zoom * 0.8);
  });

  test('a flick keeps the camera gliding', async ({ page }) => {
    const f = await Fingers.on(page);
    const m = await mid(page);
    await f.drag({ x: m.x + 100, y: m.y }, { x: m.x - 100, y: m.y }, 6, 12);
    const atRelease = await cam(page);
    expect(Math.abs(atRelease.vx)).toBeGreaterThan(0);
    await page.waitForTimeout(300);
    expect((await cam(page)).x).toBeGreaterThan(atRelease.x + 5);
  });

  test('a slow drag that stops does not glide', async ({ page }) => {
    const f = await Fingers.on(page);
    const m = await mid(page);
    await f.drag({ x: m.x + 60, y: m.y }, { x: m.x - 60, y: m.y }, 10, 40, false);
    await page.waitForTimeout(150); // finger rests before lifting
    await f.tap(m.x - 60, m.y).catch(() => {}); // end the touch
    expect((await cam(page)).vx).toBe(0);
  });

  test('placing: tapping puts the ghost where the finger is', async ({ page }) => {
    await page.locator('.hud .btn', { hasText: 'Shop' }).first().dispatchEvent('click');
    await page.locator('.modal .card', { hasText: 'Coffee Cart' }).first().dispatchEvent('click');
    await expect.poll(() => page.evaluate(() => (window as any).game.village.mode.kind)).toBe('placing');
    // A spot off-centre that's on the canvas (the placing bar has buttons).
    const p = await page.evaluate(() => {
      const c = document.getElementById('game');
      for (const [fx, fy] of [[0.65, 0.4], [0.35, 0.4], [0.65, 0.6], [0.35, 0.6], [0.5, 0.3]]) {
        const x = Math.round(innerWidth * fx);
        const y = Math.round(innerHeight * fy);
        if (document.elementFromPoint(x, y) === c) return { x, y };
      }
      throw new Error('no free canvas spot');
    });
    const want = await page.evaluate(async ({ x, y }) => {
      const { toGrid } = await import(String('/src/core/iso.ts'));
      const g = (window as any).game.village;
      const w = g.cam.screenToWorld(x, y);
      const q = toGrid(w.x, w.y);
      const sz = (await import(String('/src/config/buildings.ts'))).BUILDINGS[g.mode.type].size;
      return { gx: Math.round(q.gx - sz / 2), gy: Math.round(q.gy - sz / 2) };
    }, p);
    const f = await Fingers.on(page);
    await f.tap(p.x, p.y);
    await page.waitForTimeout(100);
    const placed = await page.evaluate(
      ({ gx, gy }) => {
        const g = (window as any).game;
        const m = g.village.mode;
        return m.kind === 'placing' ? m.gx === gx && m.gy === gy : g.state.buildings.some((b: any) => b.type === 'coffeecart' && b.x === gx && b.y === gy);
      },
      want,
    );
    expect(placed).toBe(true);
  });

  test('raid: a tap on grass deploys one troop', async ({ page }) => {
    await startRaid(page);
    const p = await deployPoint(page);
    const f = await Fingers.on(page);
    await f.tap(p.x, p.y);
    await expect.poll(() => units(page)).toBe(1);
  });

  test('raid: holding a finger keeps deploying', async ({ page }) => {
    await startRaid(page);
    const p = await deployPoint(page);
    const f = await Fingers.on(page);
    await f.drag(p, { x: p.x + 2, y: p.y }, 1, 700);
    expect(await units(page)).toBeGreaterThan(3);
  });

  test('raid: a two-finger pan moves the camera and deploys nothing', async ({ page }) => {
    await startRaid(page);
    const p = await deployPoint(page);
    const before = await cam(page);
    const f = await Fingers.on(page);
    await f.two(
      [{ x: p.x, y: p.y }, { x: p.x + 60, y: p.y + 10 }],
      [{ x: p.x - 100, y: p.y }, { x: p.x - 40, y: p.y + 10 }],
    );
    expect(await units(page)).toBe(0);
    expect((await cam(page)).x).toBeGreaterThan(before.x + 30);
  });
});

test.describe('mouse (desktop stays the same)', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'mouse tests run on desktop');
    await freshGame(page);
  });

  test('drag pans with no glide, click selects, wheel zooms', async ({ page }) => {
    const m = await mid(page);
    const before = await cam(page);
    await page.mouse.move(m.x, m.y);
    await page.mouse.down();
    await page.mouse.move(m.x - 150, m.y - 50, { steps: 4 });
    await page.mouse.up();
    const after = await cam(page);
    expect(after.x - before.x).toBeCloseTo(150 / before.zoom, 0);
    expect(after.vx).toBe(0);
    expect(await page.evaluate(() => (window as any).game.village.selectedId)).toBe(-1);

    const b = await buildingPoint(page);
    await page.mouse.click(b.x, b.y);
    await expect.poll(() => page.evaluate(() => (window as any).game.village.selectedId)).toBe(b.id);

    const z = (await cam(page)).zoom;
    await page.mouse.move(m.x, m.y);
    await page.mouse.wheel(0, -100);
    await expect.poll(async () => (await cam(page)).zoom).toBeCloseTo(z * 1.1, 3);
  });

  test('raid: click deploys one troop, dragging off the zone pans', async ({ page }) => {
    await startRaid(page);
    const p = await deployPoint(page);
    await page.mouse.click(p.x, p.y);
    await expect.poll(() => units(page)).toBe(1);
  });
});
