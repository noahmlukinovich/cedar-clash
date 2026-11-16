// Settings, debug tools and save management.
import { DEBUG_SPEEDS } from '../../config/balance';
import { EVENT_INFO } from '../../config/humor';
import { isMuted, setMuted } from '../../core/audio';
import { caps } from '../../game/economy';
import { startEvent } from '../../game/events';
import { exportSave, importSave, resetSave, saveGame } from '../../game/save';
import { el } from '../dom';
import { icon } from '../icons';
import type { UI } from '../ui';

export function openSettings(ui: UI): void {
  const m = ui.modal('Settings', { narrow: true, headIcon: icon('gear', 36) });
  const s = ui.state;
  const render = (): void => {
    m.body.innerHTML = '';
    const row1 = el('div', 'row');
    const mute = el('button', 'btn blue', isMuted() ? '🔇 Sound: Off' : '🔊 Sound: On');
    mute.onclick = () => {
      setMuted(!isMuted());
      s.settings.muted = isMuted();
      render();
    };
    const save = el('button', 'btn', '💾 Save now');
    save.onclick = () => {
      if (saveGame(s)) ui.toast('Saved!', 'good');
      else ui.showUpdateBar('stale');
    };
    row1.append(mute, save);
    m.body.appendChild(row1);

    m.body.appendChild(el('div', 'section-title', 'Debug'));
    const dr = el('div', 'debug-row');
    const sp = el('button', 'btn gold', `⏩ Speed: ${DEBUG_SPEEDS[s.settings.speedIdx]}x`);
    sp.onclick = () => {
      s.settings.speedIdx = (s.settings.speedIdx + 1) % DEBUG_SPEEDS.length;
      render();
    };
    const res = el('button', 'btn small', '+ Resources');
    res.onclick = () => {
      const c = caps(s);
      s.resources.tuition = c.tuition;
      s.resources.coffee = c.coffee;
      s.resources.chapel = Math.min(c.chapel, s.resources.chapel + 100);
      ui.toast('Financial aid has been approved.', 'good');
    };
    const fin = el('button', 'btn small', '⚡ Finish builds');
    fin.onclick = () => {
      for (const b of s.buildings) if (b.upgrade) b.upgrade.end = s.clock;
      if (s.research) s.research.end = s.clock;
      for (const q of s.trainQueue) {
        q.left = 0.01;
        q.chucks = 0;
      }
      for (const q of s.spellQueue) q.left = 0.01;
      for (const h of Object.values(s.heroes)) {
        if (h.upgrade) h.upgrade.end = s.clock;
        h.hpFrac = 1;
      }
    };
    dr.append(sp, res, fin);
    for (const ev of ['ringbyspring', 'finals', 'construction', 'elephantrun'] as const) {
      const b = el('button', 'btn small purple', `${EVENT_INFO[ev].icon} ${EVENT_INFO[ev].name}`);
      b.onclick = () => startEvent(s, ev);
      dr.appendChild(b);
    }
    const tk = el('button', 'btn small purple', '🚓 Ticket');
    tk.onclick = () => {
      s.nextTicketCheck = s.clock;
      s.lastRaidClock = -9999;
      ui.toast('Campus Safety is on patrol (needs a mostly-full army)...');
    };
    dr.appendChild(tk);
    m.body.appendChild(dr);

    m.body.appendChild(el('div', 'section-title', 'Save data'));
    const r3 = el('div', 'row');
    const exp = el('button', 'btn small blue', '📋 Copy save to clipboard');
    exp.onclick = () => {
      void navigator.clipboard?.writeText(exportSave(s));
      ui.toast('Save copied (base64).', 'good');
    };
    const reset = el('button', 'btn small red', '🗑️ Reset save');
    reset.onclick = () => {
      if (confirm('Really reset? Your whole campus will be expelled.')) {
        resetSave();
        ui.game.resetting = true;
        location.reload();
      }
    };
    const imp = el('button', 'btn small blue', '📥 Import save');
    imp.onclick = () => {
      const text = prompt('Paste a save copied with "Copy save to clipboard". This replaces your current campus.');
      if (!text) return;
      try {
        importSave(text);
      } catch {
        ui.toast('That does not look like a Cedarville Clash save.', 'bad');
        return;
      }
      ui.game.resetting = true; // don't let the unload handler write the old campus back
      location.reload();
    };
    r3.append(exp, imp, reset);
    m.body.appendChild(r3);
    m.body.appendChild(el('div', 'section-title', 'Controls'));
    m.body.appendChild(
      el(
        'div',
        '',
        `Drag or <kbd>WASD</kbd>/arrows to pan · Wheel or <kbd>+</kbd>/<kbd>-</kbd> to zoom · Click a building to select · Drag a selected building to move it · <kbd>Esc</kbd> cancel · <kbd>Del</kbd> remove decor · <kbd>\`</kbd> toggle speed. In raids: pick a card, click/hold on green grass to deploy; <kbd>1</kbd>-<kbd>9</kbd> pick cards; <kbd>Space</kbd> uses the hero ability.`,
      ),
    );
    m.body.appendChild(el('p', 'flavor', 'Cedarville Clash is an unofficial, affectionate fan parody. Not affiliated with or endorsed by any university or game studio. All art is procedurally drawn.'));
  };
  render();
}
