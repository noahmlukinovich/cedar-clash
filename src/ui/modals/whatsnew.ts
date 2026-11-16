// The What's New popup.
import { CHANGELOG, LATEST_CHANGE } from '../../config/changelog';
import { sfx } from '../../core/audio';
import { el, esc } from '../dom';
import type { UI } from '../ui';

const SEEN_KEY = 'cedarville-clash-whatsnew';

/** Newest What's New entry this browser has shown (0 if none, or if storage is unavailable). */
export function seenChange(): number {
  try {
    return Number(localStorage.getItem(SEEN_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

export function markChangeSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, String(LATEST_CHANGE));
  } catch {
    /* private mode: the popup may show again next time, which is harmless */
  }
}

export function openWhatsNew(ui: UI, seen = LATEST_CHANGE): void {
  const m = ui.modal("What's New", { narrow: true, headIcon: '<span style="font-size:30px">🎉</span>' });
  markChangeSeen();
  for (const e of CHANGELOG) {
    const isNew = e.v > seen;
    const box = el('div', `news ${isNew ? 'new' : ''}`);
    box.appendChild(el('div', 'news-head', `<b>${esc(e.title)}</b>${isNew ? '<span class="news-tag">NEW</span>' : ''}<small>${esc(e.date)}</small>`));
    const ul = el('ul');
    for (const it of e.items) ul.appendChild(el('li', '', esc(it)));
    box.appendChild(ul);
    m.body.appendChild(box);
  }
  const ok = el('button', 'btn big', 'Got it');
  ok.style.marginTop = '4px';
  ok.onclick = () => {
    sfx('click');
    m.close();
  };
  m.body.appendChild(ok);
}
