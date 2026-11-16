// Settings, debug tools and save management.
import { DEBUG_SPEEDS } from '../../config/balance';
import { EVENT_INFO } from '../../config/humor';
import { isMuted, setMuted, sfx } from '../../core/audio';
import { pick } from '../../core/rng';
import { caps } from '../../game/economy';
import { startEvent } from '../../game/events';
import { exportSave, importSave, resetSave, saveGame, staleSave } from '../../game/save';
import { MAX_NAME_LEN, cleanName, renamePlayer } from '../../game/state';
import { setPrefersOffline } from '../../net/login';
import { NAME_RULES, validCampusName } from '../../net/protocol';
import { namePlatesOn, setNamePlates } from '../../render/world';
import { icon } from '../icons';
import { el, esc } from '../dom';
import { fmtTime } from '../dom';
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
    const online = ui.game.online;
    const news = el('button', 'btn gold', "🎉 What's new");
    news.onclick = () => {
      sfx('click');
      ui.openWhatsNew();
    };
    const save = el('button', 'btn', online ? '🔄 Sync now' : '💾 Save now');
    save.onclick = () => {
      ui.game.save();
      if (online) ui.toast('Synced with the server.', 'good');
      else if (!staleSave) ui.toast('Saved!', 'good');
    };
    const plates = el('button', 'btn blue', namePlatesOn() ? '🏷️ Name plates: On' : '🏷️ Name plates: Off');
    plates.onclick = () => {
      sfx('click');
      setNamePlates(!namePlatesOn());
      render();
    };
    row1.append(mute, plates, save, news);
    row1.style.flexWrap = 'wrap';
    m.body.appendChild(row1);

    if (online) {
      m.body.appendChild(el('div', 'section-title', 'Account'));
      const shield = online.shieldUntil > Date.now() ? ` · 🛡️ Shield for ${fmtTime((online.shieldUntil - Date.now()) / 1000)}` : '';
      m.body.appendChild(el('div', '', `Playing online as <b>${esc(online.user.name)}</b>${shield}`));
      const nameRow = el('div', 'row');
      const nameIn = el('input');
      nameIn.type = 'text';
      nameIn.maxLength = 20;
      nameIn.value = online.user.name;
      nameIn.disabled = !!s.nameChanged;
      nameIn.style.flex = '1';
      const nameBtn = el('button', 'btn small', s.nameChanged ? '🔒 Name locked' : '✏️ Rename (once!)');
      nameBtn.disabled = !!s.nameChanged;
      nameBtn.onclick = async () => {
        const name = nameIn.value.trim();
        if (!validCampusName(name)) return ui.toast(NAME_RULES, 'bad');
        if (!confirm(`Rename your campus to "${name}"? Other players will see it, and you can only do this once.`)) return;
        nameBtn.disabled = true;
        try {
          await online.rename(name);
          s.playerName = name;
          s.nameChanged = true;
          ui.toast('Name updated!', 'good');
        } catch (e) {
          ui.toast((e as Error).message, 'bad');
        }
        render();
      };
      nameRow.append(nameIn, nameBtn);
      m.body.appendChild(nameRow);
      if (!s.nameChanged) m.body.appendChild(el('div', 'flavor', 'You get one rename. Choose wisely.'));
      const r2 = el('div', 'row');
      const out = el('button', 'btn small red', 'Log out');
      out.onclick = async () => {
        await online.flush();
        await online.logout().catch(() => undefined);
        ui.game.resetting = true;
        location.reload();
      };
      r2.append(out);
      m.body.appendChild(r2);
      m.body.appendChild(el('p', 'flavor', 'Your campus is saved on the server. Other players can raid it while you are away; a shield protects you for a while after a big raid.'));
      appendControls();
      return;
    }

    if (ui.game.serverAvailable) {
      m.body.appendChild(el('div', 'section-title', 'Online play'));
      const go = el('button', 'btn small blue', '🌐 Log in / sign up to play online');
      go.onclick = () => {
        saveGame(s);
        setPrefersOffline(false);
        ui.game.resetting = true;
        location.reload();
      };
      m.body.appendChild(go);
      m.body.appendChild(el('p', 'flavor', 'Online campuses are separate from this offline save, and real players can raid them.'));
    }

    m.body.appendChild(el('div', 'section-title', 'Campus name'));
    const nameRow = el('div', 'row');
    const nameIn = el('input');
    nameIn.type = 'text';
    nameIn.maxLength = MAX_NAME_LEN;
    nameIn.value = s.playerName;
    nameIn.disabled = !!s.nameChanged;
    nameIn.style.flex = '1';
    const nameBtn = el('button', 'btn small', s.nameChanged ? '🔒 Name locked' : '✏️ Rename (once!)');
    nameBtn.disabled = !!s.nameChanged;
    nameBtn.onclick = () => {
      const name = cleanName(nameIn.value);
      if (!confirm(`Rename your campus to "${name}"? You can only do this once.`)) return;
      const err = renamePlayer(s, nameIn.value);
      if (err) ui.toast(err, 'bad');
      else {
        saveGame(s);
        ui.toast('Name updated!', 'good');
        render();
      }
    };
    nameRow.append(nameIn, nameBtn);
    m.body.appendChild(nameRow);
    if (!s.nameChanged) m.body.appendChild(el('div', 'flavor', 'You get one rename. Choose wisely.'));

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
    appendControls();
  };
  const appendControls = (): void => {
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
