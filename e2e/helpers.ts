import type { Page } from '@playwright/test';

/**
 * Start a fresh offline game (each Playwright test has its own empty browser
 * storage) and, unless asked not to, close the welcome dialog.
 */
export async function freshGame(page: Page, opts: { keepWelcome?: boolean } = {}): Promise<void> {
  await page.goto('/');
  await page.getByText("Let's go, Jackets!").waitFor({ timeout: 20_000 });
  if (!opts.keepWelcome) await closeModal(page);
}

export async function closeModal(page: Page): Promise<void> {
  // Escape always closes the open dialog. The close button may be off-screen,
  // which is one of the things these tests check for.
  await page.keyboard.press('Escape');
  await page.locator('.modal-back').waitFor({ state: 'detached', timeout: 5_000 }).catch(() => {});
}

export interface Problem {
  check: string;
  detail: string;
}

/**
 * Layout checks run inside the page:
 * - offscreen: a visible control sits partly outside the viewport (and no
 *   scrollable box can bring it into view).
 * - covered: the middle of a control is under something else, so tapping it
 *   hits the wrong thing. While a dialog is open, only its controls are checked.
 * - small: a control is under 44 CSS px in either direction.
 * - overlap: two HUD widgets (direct children of a .hud) overlap.
 * - hidden-action: a dialog's main button (.btn.big) can't be seen without
 *   scrolling the dialog.
 */
export async function layoutProblems(page: Page): Promise<Problem[]> {
  return page.evaluate(() => {
    const out: { check: string; detail: string }[] = [];
    const vw = innerWidth;
    const vh = innerHeight;
    const name = (e: Element): string => {
      const t = (e.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30);
      return `${e.tagName.toLowerCase()}.${[...e.classList].join('.')}${t ? ` "${t}"` : ''}`;
    };
    const shown = (e: Element): boolean => {
      const r = e.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      for (let n: Element | null = e; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
      }
      return true;
    };
    const scrollParent = (e: Element): Element | null => {
      for (let n = e.parentElement; n && n !== document.body; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (/(auto|scroll)/.test(cs.overflowY + cs.overflowX) && (n.scrollHeight > n.clientHeight + 1 || n.scrollWidth > n.clientWidth + 1)) return n;
      }
      return null;
    };
    // With a dialog open, the HUD behind its backdrop is covered on purpose:
    // only the dialog's own controls count.
    const scope = document.querySelector('.modal-back') ?? document.getElementById('ui')!;
    const controls = [...scope.querySelectorAll('button, .btn, [role="button"]')].filter(shown);
    for (const c of controls) {
      const r = c.getBoundingClientRect();
      const sp = scrollParent(c);
      if (sp) {
        // Inside a scrolling list: the list itself must be on screen.
        const s = sp.getBoundingClientRect();
        if (s.bottom > vh + 1 || s.right > vw + 1 || s.top < -1 || s.left < -1) out.push({ check: 'offscreen', detail: `scroll box of ${name(c)}` });
        continue;
      }
      if (r.right > vw + 1 || r.bottom > vh + 1 || r.left < -1 || r.top < -1) {
        out.push({ check: 'offscreen', detail: name(c) });
        continue;
      }
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (hit && hit !== c && !c.contains(hit)) out.push({ check: 'covered', detail: `${name(c)} under ${name(hit)}` });
      if (Math.min(r.width, r.height) < 44) out.push({ check: 'small', detail: `${name(c)} ${Math.round(r.width)}x${Math.round(r.height)}` });
    }
    for (const b of document.querySelectorAll('.modal .btn.big')) {
      if (!shown(b)) continue;
      const r = b.getBoundingClientRect();
      const sp = scrollParent(b);
      const box = sp ? sp.getBoundingClientRect() : { top: 0, left: 0, bottom: vh, right: vw };
      if (r.top < box.top - 1 || r.bottom > box.bottom + 1 || r.bottom > vh + 1) out.push({ check: 'hidden-action', detail: name(b) });
    }
    for (const hud of document.querySelectorAll('.hud')) {
      if (!shown(hud)) continue;
      const kids = [...hud.children].filter((k) => shown(k) && getComputedStyle(k).pointerEvents !== 'none');
      for (let i = 0; i < kids.length; i++) {
        for (let j = i + 1; j < kids.length; j++) {
          const a = kids[i].getBoundingClientRect();
          const b = kids[j].getBoundingClientRect();
          const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (ox > 2 && oy > 2) out.push({ check: 'overlap', detail: `${name(kids[i])} / ${name(kids[j])}` });
        }
      }
    }
    return out;
  });
}
