// Chapel: daily attendance and the Daily Challenge, the two daily sources of Chapel Credits.
import { CHAPEL_ATTEND_LINES } from '../../config/humor';
import { sfx } from '../../core/audio';
import { pick } from '../../core/rng';
import { SPELLS, SPELL_ORDER } from '../../config/spells';
import { TROOPS, TROOP_ORDER } from '../../config/troops';
import { OBJECTIVES, dailyFor, dailyProgress, dayKey, msUntilNextDaily } from '../../game/daily';
import { dmcLevel } from '../../game/economy';
import { canAttendChapel, chapelReward } from '../../game/events';
import type { GameState } from '../../game/state';
import { icon } from '../icons';
import { el, fmtTime } from '../dom';
import type { UI } from '../ui';

/** The Daily Challenge card, shared by the Chapel and Attack menus. */
export function dailyCard(ui: UI, s: GameState): HTMLElement {
  const day = dayKey();
  const c = dailyFor(day, dmcLevel(s));
  const o = OBJECTIVES[c.objectiveId];
  const p = dailyProgress(s, day);
  const troops = TROOP_ORDER.filter((t) => c.army[t]).map((t) => `${c.army[t]} ${TROOPS[t].name}`);
  const spells = SPELL_ORDER.filter((t) => c.spells[t]).map((t) => `${c.spells[t]} ${SPELLS[t].name}`);
  const box = el('div', `daily-card ${p.done ? 'done' : ''}`);
  box.appendChild(el('div', 'daily-title', `🎯 Daily Challenge: ${c.title}`));
  box.appendChild(el('div', '', `<b>${o.name}.</b> ${o.desc}`));
  box.appendChild(el('div', 'flavor', `Lent army (Lv${c.troopLevel}): ${troops.join(', ')}${spells.length ? ` + ${spells.join(', ')}` : ''}. Your own troops are not used, and you can retry as often as you like.`));
  const b = el('button', `btn big ${p.done ? 'gray' : 'purple'}`, p.done ? '✅ Cleared today · Play again for fun' : `Start (+${c.reward} ${icon('chapel', 26)})`);
  b.onclick = () => {
    sfx('click');
    ui.closeModal();
    void ui.game.startRaid({ kind: 'daily' });
  };
  box.appendChild(b);
  const meta: string[] = [];
  if (p.attempts > 0 && !p.done) meta.push(`Attempts today: ${p.attempts}, best ${p.bestStars} star${p.bestStars === 1 ? '' : 's'}`);
  meta.push(`New challenge in ${fmtTime(msUntilNextDaily() / 1000)}`);
  box.appendChild(el('div', 'flavor', meta.join(' · ')));
  return box;
}

export function openChapel(ui: UI): void {
  const m = ui.modal('Chapel', { narrow: true, headIcon: icon('chapel', 36) });
  const render = (): void => {
    const s = ui.state;
    m.body.innerHTML = '';
    m.body.appendChild(el('div', '', `Daily Chapel attendance earns <b>Chapel Credits</b> (rare resource). Keep a streak for bonus credits!`));
    m.body.appendChild(el('div', 'section-title', `Current streak: ${s.chapel.streak} day${s.chapel.streak === 1 ? '' : 's'} 🔥`));
    if (canAttendChapel(s)) {
      const r = chapelReward(s);
      const b = el('button', 'btn purple big', `Attend Chapel (+${r} ${icon('chapel', 26)})`);
      b.onclick = () => {
        const got = ui.game.act({ k: 'chapel' }).got ?? 0;
        sfx('pray');
        ui.toast(`${pick(CHAPEL_ATTEND_LINES)} +${got} Chapel Credits`, 'good');
        ui.game.village.particles.text(0, 400, 50, `+${got} Chapel Credits`, '#d6b4ff', 24);
        render();
      };
      m.body.appendChild(b);
    } else {
      m.body.appendChild(el('div', 'flavor', "You've already attended today. The worship team thanks you for clapping on 2 and 4."));
    }
    m.body.appendChild(dailyCard(ui, s));
    m.body.appendChild(el('p', 'flavor', 'Also earn Chapel Credits from 3-star raids and achievements. Spend them on heroes, the Chapel Announcement spell, and finishing construction instantly.'));
  };
  render();
}
