// The Facilities Crew list: every upgrade you can start right now.
import { BUILDINGS } from '../../config/buildings';
import type { HeroType, TroopType } from '../../config/types';
import { sfx } from '../../core/audio';
import { builders, canAfford } from '../../game/economy';
import { type ExtraRow, type UpgradeRow, listUpgrades } from '../../game/upgrades';
import { toWorld } from '../../core/iso';
import { icon } from '../icons';
import { buildingThumb, unitThumb } from '../thumbs';
import { el, esc, costHtml } from '../dom';
import { fmtTime } from '../dom';
import type { UI } from '../ui';

export function openUpgrades(ui: UI): void {
  const m = ui.modal('Upgrades', { headIcon: icon('builder', 36) });
  let sig = '';
  let timers: { el: HTMLElement; left: () => number }[] = [];
  const fail = (err: string): void => {
    ui.toast(err, 'bad');
    sfx('error');
  };
  const goTo = (id: number): void => {
    const b = ui.state.buildings.find((x) => x.id === id);
    if (!b) return;
    ui.closeModal();
    const vs = ui.game.village;
    vs.select(id);
    const sz = BUILDINGS[b.type].size;
    const w = toWorld(b.x + sz / 2, b.y + sz / 2);
    vs.cam.x = w.x;
    vs.cam.y = w.y;
    vs.cam.clampPos();
  };
  /** A row: [picture + text (optionally clickable)] [right-hand side]. */
  const mkRow = (cls: string, thumb: HTMLElement, title: string, sub: string, go?: () => void): { row: HTMLElement; side: HTMLElement; sub: HTMLElement } => {
    const row = el('div', `up-row ${cls}`);
    const main = el(go ? 'button' : 'div', 'up-main');
    const subEl = el('div', 'up-sub', sub);
    const txt = el('div', 'up-txt');
    txt.append(el('div', 'up-name', title), subEl);
    main.append(thumb, txt);
    if (go) {
      main.title = 'Show on campus';
      main.onclick = go;
    }
    const side = el('div', 'up-side');
    row.append(main, side);
    return { row, side, sub: subEl };
  };
  const time = (t: number): string => (t > 0 ? `⏱ ${fmtTime(t)}` : '⚡ Instant');
  const render = (force = false): void => {
    const s = ui.state;
    const l = listUpgrades(s);
    // Rebuild only when something other than a countdown changed; otherwise just tick the timers.
    const nsig = JSON.stringify([l.progress.map((p) => [p.id, p.to, p.finishCost, s.resources.chapel >= p.finishCost]), l.ready, l.waiting, l.extras.map((e) => ({ ...e, left: e.left !== undefined }))]);
    if (!force && nsig === sig) {
      for (const t of timers) t.el.textContent = fmtTime(t.left());
      return;
    }
    sig = nsig;
    timers = [];
    const scroll = m.body.scrollTop;
    m.body.innerHTML = '';
    const bl = builders(s);
    m.body.appendChild(el('div', 'flavor', `Facilities Crew free: ${bl.total - bl.busy}/${bl.total}. Click a name or picture to find it on campus.`));
    const section = (title: string, n: number): HTMLElement => {
      m.body.appendChild(el('div', 'section-title', `${title} <small>(${n})</small>`));
      const list = el('div', 'up-list');
      m.body.appendChild(list);
      return list;
    };

    if (l.progress.length) {
      const list = section('In progress', l.progress.length);
      for (const p of l.progress) {
        const r = mkRow('', buildingThumb(p.type, p.to, 60, 50), esc(p.name), `${p.to <= 1 ? 'Building' : `Lv ${p.to - 1} → ${p.to}`} · ⏱ <span class="up-left"></span>`, () => goTo(p.id));
        const left = r.sub.querySelector('.up-left') as HTMLElement;
        left.textContent = fmtTime(p.left);
        timers.push({ el: left, left: () => Math.max(0, (ui.state.buildings.find((b) => b.id === p.id)?.upgrade?.end ?? 0) - ui.state.clock) });
        const fin = el('button', 'btn small purple', `Finish ${costHtml('chapel', p.finishCost, canAfford(s, 'chapel', p.finishCost))}`);
        fin.onclick = () => {
          const err = ui.game.act({ k: 'finish', id: p.id }).err;
          if (err) fail(err);
          else sfx('click');
          render(true);
        };
        r.side.appendChild(fin);
        list.appendChild(r.row);
      }
    }

    const buildingRow = (u: UpgradeRow, ready: boolean): HTMLElement => {
      const title = u.type === 'wall' ? `Walls ×${u.count}` : esc(u.name);
      const r = mkRow(ready ? '' : 'waiting', buildingThumb(u.type, u.level, 60, 50), title, `Lv ${u.level} → ${u.level + 1} · ${time(u.time)}`, () => goTo(u.id));
      r.side.appendChild(el('div', '', costHtml(u.res, u.cost, canAfford(s, u.res, u.cost))));
      if (ready) {
        const up = el('button', 'btn small gold', 'Upgrade');
        up.onclick = () => {
          const err = ui.game.act({ k: 'upgrade', id: u.id }).err;
          if (err) fail(err);
          else {
            sfx('build');
            ui.game.village.pop(u.id);
          }
          render(true);
        };
        r.side.appendChild(up);
      } else if (u.reason && canAfford(s, u.res, u.cost)) {
        r.side.appendChild(el('div', 'up-why', u.reason));
      }
      return r.row;
    };
    if (l.ready.length) {
      const list = section('Ready to upgrade', l.ready.length);
      for (const u of l.ready) list.appendChild(buildingRow(u, true));
    }
    if (l.waiting.length) {
      const list = section('Need more resources', l.waiting.length);
      for (const u of l.waiting) list.appendChild(buildingRow(u, false));
    }

    if (l.extras.length) {
      const list = section('Library & heroes', l.extras.length);
      for (const e of l.extras) list.appendChild(extraRow(e));
    }
    if (!l.progress.length && !l.ready.length && !l.waiting.length && !l.extras.length) {
      m.body.appendChild(el('p', 'flavor', 'Nothing left to upgrade at this DMC level. Facilities is, for once, caught up.'));
    }
    m.body.scrollTop = scroll;
  };
  const extraRow = (e: ExtraRow): HTMLElement => {
    const s = ui.state;
    const running = e.left !== undefined;
    const what = e.kind === 'research' ? 'Research' : 'Hero';
    const sub = running ? `${what} · Lv ${e.level} → ${e.level + 1} · ⏱ <span class="up-left"></span>` : `${what} · Lv ${e.level} → ${e.level + 1} · ${time(e.time)}`;
    const r = mkRow(running || e.ok ? '' : 'waiting', unitThumb(e.type, 60, 50, e.level), e.name, sub);
    if (running) {
      const left = r.sub.querySelector('.up-left') as HTMLElement;
      left.textContent = fmtTime(e.left!);
      timers.push({
        el: left,
        left: () => {
          const st = ui.state;
          const end = e.kind === 'research' ? st.research?.end : st.heroes[e.type as HeroType].upgrade?.end;
          return Math.max(0, (end ?? 0) - st.clock);
        },
      });
      r.side.appendChild(el('div', 'up-why', e.kind === 'research' ? 'Researching…' : 'Upgrading…'));
      return r.row;
    }
    r.side.appendChild(el('div', '', costHtml(e.res, e.cost, canAfford(s, e.res, e.cost))));
    if (e.ok) {
      const b = el('button', `btn small ${e.kind === 'research' ? 'blue' : 'purple'}`, e.kind === 'research' ? 'Research' : 'Upgrade');
      b.onclick = () => {
        const err = e.kind === 'research' ? ui.game.act({ k: 'research', type: e.type as TroopType }).err : ui.game.act({ k: 'heroUpgrade', type: e.type as HeroType }).err;
        if (err) fail(err);
        else sfx('build');
        render(true);
      };
      r.side.appendChild(b);
    } else if (e.reason && canAfford(s, e.res, e.cost)) {
      r.side.appendChild(el('div', 'up-why', e.reason));
    }
    return r.row;
  };
  render(true);
  ui.refreshModal = () => render();
}
