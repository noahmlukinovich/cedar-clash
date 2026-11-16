// What a finished raid does to the save (settleRaid: pure game logic) and the
// results popup that reports it (showResults).
import { THREE_STAR_CHAPEL } from '../config/balance';
import { DAILY_DONE_LINES, LOSE_LINES, WIN_LINES } from '../config/humor';
import type { HeroType } from '../config/types';
import { sfx } from '../core/audio';
import { pick } from '../core/rng';
import { bump } from '../game/achievements';
import { type DailyChallenge, type DailyResult, recordDaily } from '../game/daily';
import { addRes } from '../game/economy';
import type { GameState } from '../game/state';
import { el, fmt } from '../ui/dom';
import { ICONS, icon } from '../ui/icons';
import type { BaseLayout } from './basegen';
import type { RaidScene } from './raidScene';
import type { RU, RaidSim } from './sim';

export type RaidKind = 'campaign' | 'random' | 'elephant' | 'daily';

export interface RaidOutcome {
  win: boolean;
  stars: number;
  destruction: number;
  /** Loot actually banked (after storage caps) and loot taken from the rival. */
  gotT: number;
  gotC: number;
  tuition: number;
  coffee: number;
  trophyDelta: number;
  chapel: number;
  daily?: { passed: boolean; reward: number; challenge: DailyChallenge };
}

export function dailyResultOf(sim: RaidSim): DailyResult {
  const avail = sim.lootAvail.tuition + sim.lootAvail.coffee;
  return {
    stars: sim.stars,
    destruction: sim.destruction,
    dmcDeadAt: sim.dmcDeadAt,
    deployed: sim.deployed,
    lost: sim.lost,
    defensesLeft: sim.defensesLeft(),
    lootFrac: avail > 0 ? (sim.loot.tuition + sim.loot.coffee) / avail : 0,
  };
}

/** Trophies for a ranked result: a 1-star win pays half the rival's bounty, 3 stars all of it. */
export function trophyChange(base: BaseLayout, stars: number): number {
  return stars > 0 ? Math.round((base.trophiesWin * (1 + stars)) / 4) : -base.trophiesLose;
}

/** Apply a finished raid to the save: loot, trophies, stats, hero health, daily reward. */
export function settleRaid(
  s: GameState,
  sim: RaidSim,
  base: BaseLayout,
  kind: RaidKind,
  extra: { heroes?: { type: HeroType; unit: RU }[]; daily?: DailyChallenge } = {},
): RaidOutcome {
  const stars = sim.stars;
  const win = stars > 0;
  const out: RaidOutcome = { win, stars, destruction: sim.destruction, gotT: 0, gotC: 0, tuition: 0, coffee: 0, trophyDelta: 0, chapel: 0 };
  s.lastRaidClock = s.clock;

  if (kind === 'daily') {
    // A practice raid with a lent army: only the objective counts.
    if (extra.daily) out.daily = { ...recordDaily(s, extra.daily, dailyResultOf(sim)), challenge: extra.daily };
    return out;
  }

  out.tuition = Math.floor(sim.loot.tuition);
  out.coffee = Math.floor(sim.loot.coffee);
  out.gotT = addRes(s, 'tuition', out.tuition);
  out.gotC = addRes(s, 'coffee', out.coffee);
  out.trophyDelta = trophyChange(base, stars);
  if (kind === 'elephant') out.trophyDelta = Math.max(0, out.trophyDelta);
  s.trophies = Math.max(0, s.trophies + out.trophyDelta);
  s.bestTrophies = Math.max(s.bestTrophies, s.trophies);
  if (stars === 3) out.chapel = addRes(s, 'chapel', THREE_STAR_CHAPEL);
  if (kind === 'campaign' && win) s.campaignDone = true;
  if (kind === 'elephant') s.events = s.events.filter((e) => e.type !== 'elephantrun');
  // heroes come home with whatever health they had left (it recovers over time)
  for (const h of extra.heroes ?? []) s.heroes[h.type].hpFrac = h.unit.dead ? 0 : Math.max(0, h.unit.hp / h.unit.maxHp);

  bump(s, 'raids');
  bump(s, 'destroyed', sim.buildingsDestroyed);
  bump(s, 'wallsByEngineers', sim.wallsByEngineers);
  bump(s, win ? 'wins' : 'losses');
  if (stars === 3) bump(s, 'threeStars');
  if (win && sim.opts.ringBySpring) bump(s, 'ringWins');
  if (win && sim.windSurvived) bump(s, 'windWins');
  if (kind === 'elephant') bump(s, 'elephantRuns');
  return out;
}

export function showResults(sc: RaidScene, r: RaidOutcome): void {
  const ui = sc.game.ui;
  const d = r.daily;
  const good = d ? d.passed : r.win;
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
  if (d) {
    const o = d.challenge.objective;
    m.body.appendChild(el('div', 'result-line', `${d.passed ? '✅' : '❌'} <b>${o.name}:</b> ${o.desc}`));
    if (d.reward > 0) {
      m.body.appendChild(el('div', 'loot-row', `<div>${icon('chapel', 34)} +${d.reward}</div>`));
      m.body.appendChild(el('div', 'result-line flavor', pick(DAILY_DONE_LINES)));
    } else if (d.passed) m.body.appendChild(el('div', 'result-line flavor', "You already collected today's Chapel Credits. That one was for the love of the game."));
    else m.body.appendChild(el('div', 'result-line flavor', 'No penalty and no troops lost. Try a different opening: the campus is the same every attempt.'));
  } else {
    m.body.appendChild(el('div', 'result-line flavor', good ? pick(WIN_LINES) : pick(LOSE_LINES)));
    const loot = el('div', 'loot-row');
    loot.innerHTML = `<div>${icon('tuition', 34)} +${fmt(r.gotT)}</div><div>${icon('coffee', 34)} +${fmt(r.gotC)}</div><div>${icon('trophy', 34)} ${r.trophyDelta >= 0 ? '+' : ''}${r.trophyDelta}</div>${r.chapel ? `<div>${icon('chapel', 34)} +${r.chapel}</div>` : ''}`;
    m.body.appendChild(loot);
    if (r.gotT < r.tuition || r.gotC < r.coffee) m.body.appendChild(el('div', 'flavor', 'Some loot was left behind: your storages are full! Upgrade the Registrar / Rinnova.'));
    if (sc.kind === 'campaign' && r.win) m.body.appendChild(el('div', 'result-line', '🎉 Random rivals unlocked! Use <b>Find a Rival</b> from the Attack menu.'));
  }
  const row = el('div', 'row');
  row.style.marginTop = '14px';
  const home = el('button', 'btn big', 'Return to Campus');
  home.style.flex = '1';
  home.onclick = () => ui.closeModal();
  row.appendChild(home);
  if (d && !d.passed) {
    const again = el('button', 'btn big purple', '🔁 Try again');
    again.style.flex = '1';
    again.onclick = () => {
      ui.onModalClose = null;
      ui.closeModal();
      sc.game.endRaid();
      sc.game.startRaid({ kind: 'daily' });
    };
    row.appendChild(again);
  }
  m.body.appendChild(row);
  // however the popup is dismissed, the raid is over
  ui.onModalClose = () => {
    if (sc.game.scene === sc) sc.game.endRaid();
  };
}
