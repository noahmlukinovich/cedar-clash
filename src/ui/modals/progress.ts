// Achievements, the league ladder and the online leaderboard.
import { ACHIEVEMENTS, leagueFor, LEAGUES } from '../../config/humor';
import { sfx } from '../../core/audio';
import { icon } from '../icons';
import { el, esc, textOn } from '../dom';
import { dmcLevel } from '../../game/economy';
import { expectedDmc } from '../../raid/matchmaking';
import type { UI } from '../ui';

export function openAchievements(ui: UI): void {
  const m = ui.modal('Achievements', { headIcon: icon('medal', 36) });
  const s = ui.state;
  const list = el('div', 'ach-list');
  for (const a of ACHIEVEMENTS) {
    const got = !!s.achievements[a.id];
    list.appendChild(el('div', `ach ${got ? '' : 'locked'}`, `${icon('medal', 40)}<div><b>${a.name}</b><br><span style="font-size:13px">${a.desc}</span><br><span style="font-size:12px">Reward: ${a.reward} ${icon('chapel', 14)}</span></div>`));
  }
  m.body.appendChild(el('div', 'section-title', `${Object.keys(s.achievements).length}/${ACHIEVEMENTS.length} unlocked`));
  m.body.appendChild(list);
}

export function openLeagues(ui: UI): void {
  const m = ui.modal('League Ladder', { narrow: true, headIcon: icon('trophy', 36) });
  const s = ui.state;
  const cur = leagueFor(s.trophies);
  const list = el('div', 'league-list');
  for (const l of [...LEAGUES].reverse()) {
    const r = el('div', `league-row ${l === cur ? 'me' : ''}`, `<span>${l.name}</span><span>${icon('trophy', 18)} ${l.min}+</span>`);
    r.style.background = l.color;
    r.style.color = textOn(l.color);
    list.appendChild(r);
  }
  m.body.appendChild(el('div', '', `Trophies: <b>${s.trophies}</b> (best ${s.bestTrophies}). Win raids to climb; lose them and slide back toward "Prospective Student."`));
  m.body.appendChild(list);
  const exp = expectedDmc(s.trophies);
  const dl = dmcLevel(s);
  const lean = exp - dl > 0.5 ? 'so expect rivals a step above your campus (and bigger payouts)' : exp - dl < -0.5 ? 'so expect softer rivals until your trophies catch up' : 'so expect rivals about your size';
  m.body.appendChild(el('p', 'flavor', `Matchmaking: the ladder expects a DMC ${Math.min(6, Math.floor(exp))} campus at ${s.trophies} trophies and yours is DMC ${dl}, ${lean}. Tougher rivals pay more trophies and loot.`));
}

export async function openLeaderboard(ui: UI): Promise<void> {
  const online = ui.game.online;
  if (!online) return;
  let rows;
  try {
    rows = await online.leaderboard();
  } catch (e) {
    ui.toast((e as Error).message, 'bad');
    return;
  }
  const m = ui.modal('Leaderboard', { narrow: true, headIcon: icon('trophy', 36) });
  const list = el('div', 'league-list');
  rows.forEach((r, i) => {
    const me = r.name === online.user.name;
    const row = el('div', `league-row ${me ? 'me' : ''}`, `<span>${i + 1}. ${esc(r.name)} <small>DMC ${r.dmc}</small></span><span class="lb-side">${icon('trophy', 18)} ${r.trophies}</span>`);
    if (!me) {
      const go = el('button', 'btn small blue', 'Visit');
      go.title = 'Look around this campus';
      go.onclick = () => {
        sfx('click');
        void ui.game.startVisit(r.name);
      };
      row.lastElementChild!.appendChild(go);
    }
    list.appendChild(row);
  });
  if (!rows.length) list.appendChild(el('div', 'flavor', 'Nobody here yet.'));
  m.body.appendChild(list);
}
