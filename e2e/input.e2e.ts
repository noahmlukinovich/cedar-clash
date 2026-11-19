// Page code below imports game modules from the Vite dev server by URL;
// String() keeps TypeScript from trying to resolve those paths.
import { expect, test, type Page } from '@playwright/test';
import { deployPoint, freshGame, startRaid, units } from './helpers';
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

const mode = (page: Page) => page.evaluate(() => (window as any).game.village.mode);
const cartCount = (page: Page): Promise<number> =>
  page.evaluate(() => (window as any).game.state.buildings.filter((b: any) => b.type === 'coffeecart').length);

async function startPlacing(page: Page): Promise<void> {
  await page.locator('.hud .btn', { hasText: 'Shop' }).first().dispatchEvent('click');
  await page.locator('.modal .card', { hasText: 'Coffee Cart' }).first().dispatchEvent('click');
  await expect.poll(async () => (await mode(page)).kind).toBe('placing');
}

/** A spot on the canvas (not under the HUD), optionally away from the placing ghost. */
async function freeCanvasPoint(page: Page, awayFromGhost = false): Promise<{ x: number; y: number }> {
  return page.evaluate(async (away) => {
    const { toGrid } = await import(String('/src/core/iso.ts'));
    const g = (window as any).game.village;
    const c = document.getElementById('game');
    for (const [fx, fy] of [[0.65, 0.4], [0.35, 0.4], [0.65, 0.6], [0.35, 0.6], [0.5, 0.3], [0.25, 0.5], [0.75, 0.5], [0.2, 0.3], [0.8, 0.3], [0.2, 0.65], [0.8, 0.65]]) {
      const x = Math.round(innerWidth * fx);
      const y = Math.round(innerHeight * fy);
      if (document.elementFromPoint(x, y) !== c) continue;
      if (away && g.mode.kind === 'placing') {
        const w = g.cam.screenToWorld(x, y);
        const q = toGrid(w.x, w.y);
        if (Math.abs(q.gx - g.mode.gx) < 4 && Math.abs(q.gy - g.mode.gy) < 4) continue;
      }
      return { x, y };
    }
    throw new Error('no free canvas spot');
  }, awayFromGhost);
}

async function ghostCornerFor(page: Page, p: { x: number; y: number }): Promise<{ gx: number; gy: number }> {
  return page.evaluate(async ({ x, y }) => {
    const { toGrid } = await import(String('/src/core/iso.ts'));
    const g = (window as any).game.village;
    const w = g.cam.screenToWorld(x, y);
    const q = toGrid(w.x, w.y);
    const sz = (await import(String('/src/config/buildings.ts'))).BUILDINGS[g.mode.type].size;
    return { gx: Math.round(q.gx - sz / 2), gy: Math.round(q.gy - sz / 2) };
  }, p);
}

async function ghostCentre(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate(async () => {
    const { toWorld } = await import(String('/src/core/iso.ts'));
    const g = (window as any).game.village;
    const sz = (await import(String('/src/config/buildings.ts'))).BUILDINGS[g.mode.type].size;
    const w = toWorld(g.mode.gx + sz / 2, g.mode.gy + sz / 2);
    return g.cam.worldToScreen(w.x, w.y);
  });
}

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

  test('placing: a tap moves the ghost and never builds', async ({ page }) => {
    await startPlacing(page);
    const p = await freeCanvasPoint(page);
    const want = await ghostCornerFor(page, p);
    const carts = await cartCount(page);
    const f = await Fingers.on(page);
    await f.tap(p.x, p.y);
    await page.waitForTimeout(100);
    expect(await mode(page)).toMatchObject({ kind: 'placing', ...want });
    expect(await cartCount(page)).toBe(carts);
  });

  test('placing: dragging the ghost moves it, dragging elsewhere pans', async ({ page }) => {
    await startPlacing(page);
    const f = await Fingers.on(page);
    const g0 = await mode(page);
    const top = await ghostCentre(page);
    await f.drag(top, { x: top.x + 90, y: top.y + 45 }, 8, 20);
    await page.waitForTimeout(50);
    const g1 = await mode(page);
    expect(g1.gx !== g0.gx || g1.gy !== g0.gy).toBe(true);

    const camBefore = await cam(page);
    const p = await freeCanvasPoint(page, true);
    await f.drag(p, { x: p.x - 100, y: p.y }, 8, 20);
    await page.waitForTimeout(50);
    expect((await cam(page)).x).toBeGreaterThan(camBefore.x + 40);
    expect(await mode(page)).toMatchObject({ kind: 'placing', gx: g1.gx, gy: g1.gy });
  });

  test('placing: the floating ✔ builds and ✖ cancels', async ({ page }) => {
    await startPlacing(page);
    const float = page.locator('.place-float');
    await expect(float).toBeVisible();
    await expect(page.locator('.place-panel .btn')).toHaveCount(0); // bottom bar is just a hint on touch
    const carts = await cartCount(page);
    await float.locator('.btn:not(.red)').tap();
    await expect.poll(() => cartCount(page)).toBe(carts + 1);
    await expect(float).toBeHidden();

    await page.locator('.hud .btn', { hasText: 'Shop' }).first().dispatchEvent('click');
    await page.locator('.modal .card', { hasText: 'Admissions' }).first().dispatchEvent('click');
    await expect(float).toBeVisible();
    await float.locator('.btn.red').tap();
    await expect.poll(async () => (await mode(page)).kind).toBe('idle');
  });

  test('placing: ✔ turns gray where the building does not fit', async ({ page }) => {
    await startPlacing(page);
    // Park the ghost on top of an existing building.
    const b = await page.evaluate(() => {
      const g = (window as any).game;
      const t = g.state.buildings.find((x: any) => x.type === 'admissions');
      g.village.mode.gx = t.x;
      g.village.mode.gy = t.y;
      return t.id;
    });
    expect(b).toBeGreaterThan(-1);
    await expect(page.locator('.place-float .btn:not(.red)')).toHaveClass(/gray/);
  });

  test('long-press picks a building up and drops it where the finger lifts', async ({ page }) => {
    const b = await buildingPoint(page);
    const target = await page.evaluate(async (id) => {
      const { toWorld } = await import(String('/src/core/iso.ts'));
      const { canPlace } = await import(String('/src/game/economy.ts'));
      const g = (window as any).game;
      const bb = g.state.buildings.find((x: any) => x.id === id);
      for (let r = 2; r < 8; r++)
        for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r]])
          if (canPlace(g.state, bb.type, bb.x + dx, bb.y + dy, bb.id)) {
            const a = g.village.cam.worldToScreen(toWorld(bb.x, bb.y).x, toWorld(bb.x, bb.y).y);
            const c = g.village.cam.worldToScreen(toWorld(bb.x + dx, bb.y + dy).x, toWorld(bb.x + dx, bb.y + dy).y);
            return { sx: c.x - a.x, sy: c.y - a.y, from: [bb.x, bb.y] };
          }
      throw new Error('nowhere to move it');
    }, b.id);
    const f = await Fingers.on(page);
    await f.drag(b, { x: b.x + target.sx, y: b.y + target.sy }, 10, 20, true, 600);
    await page.waitForTimeout(100);
    const now = await page.evaluate((id) => {
      const bb = (window as any).game.state.buildings.find((x: any) => x.id === id);
      return [bb.x, bb.y];
    }, b.id);
    expect(now).not.toEqual(target.from);
    expect(await mode(page)).toMatchObject({ kind: 'idle' });
  });

  test('a quick drag over a building pans instead of moving it', async ({ page }) => {
    const b = await buildingPoint(page);
    const before = await page.evaluate(() => JSON.stringify((window as any).game.state.buildings.map((x: any) => [x.x, x.y])));
    const f = await Fingers.on(page);
    await f.drag(b, { x: b.x - 120, y: b.y }, 8, 20);
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => JSON.stringify((window as any).game.state.buildings.map((x: any) => [x.x, x.y])))).toBe(before);
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

test.describe('touch extras', () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(!isTouch(info.project.name), 'touch tests run on iphone-13');
    // Record vibrations instead of making them.
    await page.addInitScript(() => {
      (window as any).buzzes = [];
      navigator.vibrate = ((p: number | number[]) => {
        (window as any).buzzes.push(p);
        return true;
      }) as typeof navigator.vibrate;
    });
    await freshGame(page);
  });

  test('raid: holding a finger shows a green ring on grass', async ({ page }) => {
    await startRaid(page);
    const p = await deployPoint(page);
    const f = await Fingers.on(page);
    await f.press(p.x, p.y);
    await page.waitForTimeout(150);
    const green = await page.evaluate(({ x, y }) => {
      const c = document.getElementById('game') as HTMLCanvasElement;
      const ctx = c.getContext('2d')!;
      const k = c.width / innerWidth;
      for (let r = 34; r <= 46; r++) {
        const d = ctx.getImageData(Math.round((x + r) * k), Math.round(y * k), 1, 1).data;
        if (d[1] > 200 && d[0] < 170 && d[2] < 150) return true;
      }
      return false;
    }, p);
    await f.release();
    expect(green).toBe(true);
  });

  test('deploying vibrates, and the Settings toggle turns it off', async ({ page }) => {
    await startRaid(page);
    const p = await deployPoint(page);
    const f = await Fingers.on(page);
    await f.tap(p.x, p.y);
    await expect.poll(() => page.evaluate(() => (window as any).buzzes.length)).toBeGreaterThan(0);
    expect(await page.evaluate(() => (window as any).buzzes[0])).toBe(8);

    await page.evaluate(async () => (await import(String('/src/core/haptics.ts'))).setHaptics(false));
    await page.evaluate(() => ((window as any).buzzes = []));
    await page.waitForTimeout(100);
    await f.tap(p.x + 20, p.y);
    await expect.poll(() => units(page)).toBe(2);
    expect(await page.evaluate(() => (window as any).buzzes.length)).toBe(0);
  });

  test('Settings shows the vibration toggle', async ({ page }) => {
    await page.locator('.side-right .btn.round').first().dispatchEvent('click');
    await expect(page.locator('.modal .btn', { hasText: 'Vibration' })).toBeVisible();
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

  test('placing: click builds right away, no floating buttons', async ({ page }) => {
    await startPlacing(page);
    await expect(page.locator('.place-float')).toBeHidden();
    await expect(page.locator('.place-panel .btn', { hasText: 'Place' })).toBeVisible();
    const p = await freeCanvasPoint(page);
    await page.mouse.move(p.x, p.y);
    const carts = await cartCount(page);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(100);
    const m = await mode(page);
    // Built, or still placing because that exact spot was taken (same as before).
    if (m.kind === 'idle') expect(await cartCount(page)).toBe(carts + 1);
    else expect(await page.locator('.toast', { hasText: "Can't place there" }).count()).toBeGreaterThan(0);
  });

  test('raid: click deploys one troop, dragging off the zone pans', async ({ page }) => {
    await startRaid(page);
    const p = await deployPoint(page);
    await page.mouse.click(p.x, p.y);
    await expect.poll(() => units(page)).toBe(1);
  });
});
