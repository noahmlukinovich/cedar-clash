// Achievements list and the league ladder.
import { ACHIEVEMENTS, LEAGUES, leagueFor } from '../../config/humor';
import { dmcLevel } from '../../game/economy';
import { expectedDmc } from '../../raid/matchmaking';
import { el } from '../dom';
import { icon } from '../icons';
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
    const r = el('div', `league-row stroke ${l === cur ? 'me' : ''}`, `<span>${l.name}</span><span>${icon('trophy', 18)} ${l.min}+</span>`);
    r.style.background = l.color;
    list.appendChild(r);
  }
  m.body.appendChild(el('div', '', `Trophies: <b>${s.trophies}</b> (best ${s.bestTrophies}). Win raids to climb; lose them and slide back toward "Prospective Student."`));
  m.body.appendChild(list);
  const exp = expectedDmc(s.trophies);
  const dl = dmcLevel(s);
  const lean = exp - dl > 0.5 ? 'so expect rivals a step above your campus (and bigger payouts)' : exp - dl < -0.5 ? 'so expect softer rivals until your trophies catch up' : 'so expect rivals about your size';
  m.body.appendChild(
    el('p', 'flavor', `Matchmaking: the ladder expects a DMC ${Math.min(6, Math.floor(exp))} campus at ${s.trophies} trophies and yours is DMC ${dl}, ${lean}. Tougher rivals pay more trophies and loot.`),
  );
}
