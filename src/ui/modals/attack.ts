// The Attack menu: tutorial raid, matched rivals, the Daily Challenge and event raids.
import { SCOUT_COST_PER_DMC } from '../../config/balance';
import { EVENT_INFO, leagueFor } from '../../config/humor';
import type { HeroType } from '../../config/types';
import { sfx } from '../../core/audio';
import { heroAvailable } from '../../game/army';
import { canAfford, dmcLevel, hasEvent } from '../../game/economy';
import { icon } from '../icons';
import { el, costHtml } from '../dom';
import type { UI } from '../ui';
import { dailyCard } from './chapel';

export function openAttack(ui: UI): void {
  const s = ui.state;
  const m = ui.modal('Choose your rival', { narrow: true, headIcon: icon('sword', 36) });
  const troops = Object.values(s.army).reduce((a, n) => a + (n ?? 0), 0);
  const heroes = (['prof', 'president'] as HeroType[]).filter((h) => heroAvailable(s, h)).length;
  m.body.appendChild(el('div', '', `Your army: <b>${troops}</b> troops${heroes ? ` + ${heroes} hero${heroes > 1 ? 'es' : ''}` : ''}. Spells: ${Object.values(s.spells).reduce((a, n) => a + (n ?? 0), 0)}.`));
  if (troops === 0 && heroes === 0) m.body.appendChild(el('div', 'flavor', 'You have no troops! Train some in the Army menu first. (Your Freshmen are still at orientation.)'));
  const col = el('div', 'col');
  col.style.marginTop = '12px';
  if (!s.campaignDone) {
    const b = el('button', 'btn big', '🏈 Raid "Rival State U"');
    b.title = 'A hand-built rival campus. A great first raid!';
    b.onclick = () => {
      ui.closeModal();
      ui.game.startRaid({ kind: 'campaign' });
    };
    col.appendChild(b);
    col.appendChild(el('div', 'flavor', 'Tutorial raid: a hand-built rival campus. Beat it to unlock random rivals.'));
  }
  const cost = SCOUT_COST_PER_DMC * dmcLevel(s);
  const f = el('button', `btn big ${s.campaignDone ? '' : 'gray'}`, `🔍 Find a Rival ${costHtml('tuition', cost, canAfford(s, 'tuition', cost))}`);
  f.onclick = () => {
    if (!s.campaignDone) {
      ui.toast('Beat Rival State U first!', 'bad');
      sfx('error');
      return;
    }
    if (!canAfford(s, 'tuition', cost)) {
      ui.toast('Not enough Tuition to scout.', 'bad');
      sfx('error');
      return;
    }
    ui.closeModal();
    ui.game.startRaid({ kind: 'random' });
  };
  col.appendChild(f);
  const who = ui.game.online ? 'Real players near your trophy count first; otherwise a computer campus matched' : 'Rival campuses are matched';
  col.appendChild(el('div', 'flavor', `${who} to your <b>${s.trophies}</b> trophies (${leagueFor(s.trophies).name}). Win and the next one is tougher and pays more; lose and it eases off.`));
  if (hasEvent(s, 'elephantrun')) {
    const e = el('button', 'btn big purple', '🐘 Elephant Run (event!)');
    e.onclick = () => {
      ui.closeModal();
      ui.game.startRaid({ kind: 'elephant' });
    };
    col.appendChild(e);
    col.appendChild(el('div', 'flavor', EVENT_INFO.elephantrun.desc + ' Uses up to 30 free event Freshmen — your army is not consumed.'));
  }
  col.appendChild(dailyCard(ui, s));
  m.body.appendChild(col);
}
