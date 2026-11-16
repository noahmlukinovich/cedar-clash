// Saved base layouts (three slots) and the entry point to the layout editor.
import { sfx } from '../../core/audio';
import { defaultName, isComplete, snapshot } from '../../game/layouts';
import { el } from '../dom';
import type { UI } from '../ui';

export function openLayouts(ui: UI): void {
  const m = ui.modal('Base Layouts', { narrow: true, headIcon: '<span style="font-size:30px">🗺️</span>' });
  const s = ui.state;
  const render = (): void => {
    m.body.innerHTML = '';
    m.body.appendChild(el('p', 'flavor', 'Save up to three campus layouts and switch between them any time. Moving buildings on campus updates the active layout.'));
    const list = el('div', 'layout-list');
    for (let i = 0; i < s.layouts.length; i++) {
      const l = s.layouts[i];
      const active = i === s.activeLayout;
      const complete = !!l && isComplete(s, i);
      const row = el('div', `layout-row ${active ? 'active' : ''}`);
      const status = active ? 'Active' : !l ? 'Empty' : complete ? 'Saved' : 'Needs new buildings placed';
      const info = el('div', 'layout-info');
      info.append(el('div', 'name', ''), el('div', 'meta', status));
      info.firstElementChild!.textContent = l?.name ?? defaultName(i);
      const btns = el('div', 'layout-btns');
      const btn = (label: string, cls: string, fn: () => void): void => {
        const b = el('button', `btn small ${cls}`, label);
        b.onclick = () => {
          sfx('click');
          fn();
        };
        btns.appendChild(b);
      };
      btn('✏️ Edit', 'gold', () => ui.game.startEditor(i));
      if (!active && l) {
        btn('✔ Use', '', () => {
          if (!ui.game.act({ k: 'layoutUse', slot: i }).err) {
            ui.game.village.syncWanderers();
            ui.game.save();
            ui.toast(`${l.name} is now your campus.`, 'good');
            sfx('place');
            render();
          } else {
            ui.toast('Place your new buildings first.', 'info');
            ui.game.startEditor(i);
          }
        });
      }
      if (l) {
        btn('Rename', 'blue', () => {
          const n = prompt('Layout name', l.name);
          if (n && !ui.game.act({ k: 'layoutName', slot: i, name: n }).err) render();
        });
      }
      if (!active) {
        btn('Copy current', 'blue', () => {
          if (l && !confirm(`Overwrite ${l.name} with your current campus?`)) return;
          ui.game.act({ k: 'layoutSave', slot: i, pos: snapshot(s.buildings) });
          render();
        });
        if (l) {
          btn('Clear', 'red', () => {
            if (!confirm(`Clear ${l.name}?`)) return;
            ui.game.act({ k: 'layoutClear', slot: i });
            render();
          });
        }
      }
      row.append(info, btns);
      list.appendChild(row);
    }
    m.body.appendChild(list);
  };
  render();
}
