// The results popup at the end of a raid, and the end-of-replay popup.
import { DAILY_DONE_LINES, LOSE_LINES, WIN_LINES } from '../config/humor';
import { sfx } from '../core/audio';
import { pick } from '../core/rng';
import { ICONS, icon } from '../ui/icons';
import { el, esc, fmt } from '../ui/ui';
import type { RaidOutcome } from './outcome';
import { OBJECTIVES } from '../game/daily';
import type { RaidScene, ReplayData } from './raidScene';

export function showResults(sc: RaidScene, r: RaidOutcome): void {
  const ui = sc.game.ui;
  const d = r.daily;
  const m = ui.modal(d ? (d.passed ? 'Challenge Complete!' : 'Challenge Failed') : r.win ? 'Victory!' : 'Defeat', { narrow: true });
  const starsRow = el('div', 'result-stars');
  for (let i = 0; i < 3; i++) {
    const sp = el('span', `ic ${i < r.stars ? 'on' : ''}`, i < r.stars ? ICONS.star : ICONS.starEmpty);
    sp.style.animationDelay = `${0.2 + i * 0.35}s`;
    starsRow.appendChild(sp);
    if (i < r.stars) setTimeout(() => sfx('star'), 200 + i * 350);
  }
  m.body.appendChild(starsRow);
  m.body.appendChild(el('div', 'result-big', `${Math.floor(r.destruction * 100)}% <span style="font-size:18px">destruction</span>`));
  if (r.stars !== sc.sim.stars) m.body.appendChild(el('div', 'flavor', 'The official replay on the server scored this raid a little differently from your screen. The server result counts.'));
  if (d) {
    const o = OBJECTIVES[d.objectiveId];
    m.body.appendChild(el('div', 'result-line', `${d.passed ? '✅' : '❌'} <b>${o.name}:</b> ${o.desc}`));
    if (d.reward > 0) {
      m.body.appendChild(el('div', 'loot-row', `<div>${icon('chapel', 34)} +${d.reward}</div>`));
      m.body.appendChild(el('div', 'result-line flavor', pick(DAILY_DONE_LINES)));
    } else if (d.passed) m.body.appendChild(el('div', 'result-line flavor', "You already collected today's Chapel Credits. That one was for the love of the game."));
    else m.body.appendChild(el('div', 'result-line flavor', 'No penalty, and your own army was not touched. Try a different opening: the campus is the same every attempt.'));
  } else {
    m.body.appendChild(el('div', 'result-line flavor', r.win ? pick(WIN_LINES) : pick(LOSE_LINES)));
    const loot = el('div', 'loot-row');
    loot.innerHTML = `<div>${icon('tuition', 34)} +${fmt(r.gotT)}</div><div>${icon('coffee', 34)} +${fmt(r.gotC)}</div><div>${icon('trophy', 34)} ${r.trophyDelta >= 0 ? '+' : ''}${r.trophyDelta}</div>${r.chapel ? `<div>${icon('chapel', 34)} +${r.chapel}</div>` : ''}`;
    m.body.appendChild(loot);
    if (r.gotT < r.tuition || r.gotC < r.coffee) m.body.appendChild(el('div', 'flavor', 'Some loot was left behind: your storages are full! Upgrade the Registrar / Rinnova.'));
    if (sc.kind === 'campaign' && r.win) m.body.appendChild(el('div', 'result-line', '🎉 Random rivals unlocked! Use <b>Find a Rival</b> from the Attack menu.'));
  }
  addReplayButtons(
    sc,
    m.body,
    { setup: sc.setup, inputs: sc.engine.inputs.slice(), attacker: sc.game.online?.user.name ?? (sc.game.state.playerName || 'You'), stars: r.stars, destruction: r.destruction },
    'Watch replay',
  );
  if (d && !d.passed) {
    const again = el('button', 'btn big purple', '🔁 Try again');
    again.onclick = () => {
      sfx('click');
      ui.closeModal(); // also leaves this raid
      void sc.game.startRaid({ kind: 'daily' });
    };
    m.body.querySelector('.result-btns')?.prepend(again);
  }
}

export function finishReplay(sc: RaidScene, rp: ReplayData): void {
  if (sc.ended) return;
  sc.ended = true;
  const ui = sc.game.ui;
  const stars = sc.sim.stars;
  const m = ui.modal('Replay over', { narrow: true });
  const starsRow = el('div', 'result-stars');
  for (let i = 0; i < 3; i++) {
    const sp = el('span', `ic ${i < stars ? 'on' : ''}`, i < stars ? ICONS.star : ICONS.starEmpty);
    sp.style.animationDelay = `${0.2 + i * 0.35}s`;
    starsRow.appendChild(sp);
  }
  m.body.appendChild(starsRow);
  m.body.appendChild(el('div', 'result-big', `${Math.floor(sc.sim.destruction * 100)}% <span style="font-size:18px">destruction</span>`));
  m.body.appendChild(el('div', 'result-line flavor', `${esc(rp.attacker)} vs ${esc(sc.base.name)}`));
  if (stars !== rp.stars || Math.floor(sc.sim.destruction * 100) !== Math.floor(rp.destruction * 100)) {
    m.body.appendChild(
      el(
        'div',
        'flavor',
        `This playback came out differently from the real raid, which scored ${'★'.repeat(rp.stars)}${'☆'.repeat(3 - rp.stars)} ${Math.floor(rp.destruction * 100)}%. The game has probably been updated since it was recorded.`,
      ),
    );
  }
  addReplayButtons(sc, m.body, rp, 'Watch again');
}

/** Bottom buttons of a results window: watch the replay, or go home. Closing the window any other way also goes home. */
export function addReplayButtons(sc: RaidScene, body: HTMLElement, rp: ReplayData, watchLabel: string): void {
  const ui = sc.game.ui;
  const row = el('div', 'result-btns');
  const watch = el('button', 'btn big blue', `🎬 ${watchLabel}`);
  watch.onclick = () => {
    sfx('click');
    sc.again = true;
    ui.closeModal();
    sc.game.playReplay(rp);
  };
  const b = el('button', 'btn big', 'Return to Campus');
  b.onclick = () => ui.closeModal();
  row.append(watch, b);
  body.appendChild(row);
  const orig = ui.closeModal.bind(ui);
  ui.closeModal = () => {
    ui.closeModal = orig;
    orig();
    if (sc.game.scene === sc && !sc.again) sc.game.endRaid();
  };
}
