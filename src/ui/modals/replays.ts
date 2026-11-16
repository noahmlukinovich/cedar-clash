// The Raid Log (online): your recent raids and the raids on you, each with a replay and, where allowed, revenge.
import { sfx } from '../../core/audio';
import { el, esc, fmt, fmtTime } from '../dom';
import type { UI } from '../ui';

/** The raid log: recent raids you made and raids on you, each with a replay. */
export async function openReplays(ui: UI): Promise<void> {
  const online = ui.game.online;
  if (!online) return;
  let rows;
  try {
    rows = await online.replays();
  } catch (e) {
    ui.toast((e as Error).message, 'bad');
    return;
  }
  const m = ui.modal('Raid Log', { headIcon: '<span style="font-size:30px">🎬</span>' });
  const list = el('div', 'league-list');
  for (const r of rows) {
    const atk = r.role === 'attack';
    const sign = atk ? '+' : '−';
    const row = el(
      'div',
      'league-row replay-row',
      `<span>${atk ? '⚔️ You raided' : '🛡️ Raided by'} <b>${esc(r.opponent)}</b><br><small>${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)} ${Math.floor(r.destruction * 100)}% · ${sign}${fmt(r.tuition)} Tuition · ${sign}${fmt(r.coffee)} Coffee · ${r.trophies >= 0 ? '+' : ''}${r.trophies} trophies · ${fmtTime(Math.max(0, (Date.now() - r.at) / 1000))} ago</small></span><span class="lb-side"></span>`,
    );
    const go = el('button', 'btn small gold', '🎬 Watch');
    go.title = 'Watch this raid again';
    go.onclick = () => {
      sfx('click');
      void ui.game.watchReplay(r.id);
    };
    row.lastElementChild!.appendChild(go);
    if (r.revenge) {
      const rv = el('button', 'btn small red', '⚔️ Revenge');
      rv.title = `Raid ${r.opponent} back (free, once)`;
      rv.onclick = () => {
        sfx('click');
        void ui.game.startRaid({ kind: 'revenge', raidId: r.id });
      };
      row.lastElementChild!.appendChild(rv);
    }
    list.appendChild(row);
  }
  if (!rows.length) list.appendChild(el('div', 'flavor', 'No raids yet. Go pick a fight, or wait for someone to pick one with you.'));
  m.body.appendChild(list);
}
