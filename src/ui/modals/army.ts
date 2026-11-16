// Army training (active and reserve armies), spell brewing, Library research and hero upgrades.
import { BUILDINGS } from '../../config/buildings';
import { CHUCKS_LINE } from '../../config/humor';
import { HEROES, TROOPS, TROOP_ORDER } from '../../config/troops';
import { SPELLS, SPELL_ORDER } from '../../config/spells';
import type { HeroType, TroopType } from '../../config/types';
import { sfx } from '../../core/audio';
import { ARMIES, armyCapacity, armyUsed, brewCheck, heroAvailable, heroUnlocked, heroUpgradeCheck, libraryLevel, isReady, queueRuns, queueUsed, reserveReady, researchCheck, spellCapacity, spellsUsed, trainCheck, trainItemLeft, trainQueueLeft, troopUnlocked } from '../../game/army';
import { canAfford, dmcLevel, hasEvent } from '../../game/economy';
import { icon } from '../icons';
import { spellThumb, unitThumb } from '../thumbs';
import { el, costHtml } from '../dom';
import { fmtTime } from '../dom';
import type { UI } from '../ui';

export function openArmy(ui: UI): void {
  const m = ui.modal('Army Training', { headIcon: icon('army', 36) });
  const heroTypes = ['prof', 'president'] as HeroType[];
  let sig = '';
  let ticks: (() => void)[] = [];
  const fail = (err: string): void => {
    ui.toast(err, 'bad');
    sfx('error');
  };
  // Everything here acts on press, not on click: the screen is rebuilt whenever a troop
  // finishes, and a click whose press and release straddle a rebuild would be lost.
  const press =
    (fn: () => void) =>
    (e: PointerEvent): void => {
      if (e.button === 0) fn();
    };
  const tryTrain = (t: TroopType): boolean => {
    const err = ui.game.act({ k: 'train', type: t }).err;
    if (err) fail(err);
    else sfx('deploy');
    render();
    return !err;
  };
  // Press and hold a troop to keep recruiting. The cards are rebuilt as the queue changes,
  // so the hold lives here and is ended by window-level events, not by the card's own.
  let hold: { type: TroopType; timer: number } | null = null;
  const stopHold = (): void => {
    if (hold) clearTimeout(hold.timer);
    hold = null;
    window.removeEventListener('pointerup', stopHold);
    window.removeEventListener('pointercancel', stopHold);
    window.removeEventListener('blur', stopHold);
    window.removeEventListener('pointermove', holdMove);
  };
  const holdMove = (e: PointerEvent): void => {
    const over = (e.target as Element | null)?.closest?.('[data-troop]') as HTMLElement | null;
    if (!hold || over?.dataset.troop !== hold.type) stopHold();
  };
  const startHold = (t: TroopType): void => {
    stopHold();
    if (!tryTrain(t)) return;
    const again = (): void => {
      if (!hold || !m.body.isConnected || !tryTrain(t)) return stopHold();
      hold.timer = window.setTimeout(again, 110);
    };
    hold = { type: t, timer: window.setTimeout(again, 400) };
    window.addEventListener('pointerup', stopHold);
    window.addEventListener('pointercancel', stopHold);
    window.addEventListener('blur', stopHold);
    window.addEventListener('pointermove', holdMove);
  };
  /** Cancels the last troop of a run. The run is looked up again at click time, counted from the end. */
  const cancelOne = (runFromEnd: number, type: TroopType): void => {
    const s = ui.state;
    const runs = queueRuns(s);
    const r = runs[runs.length - 1 - runFromEnd];
    if (r && r.type === type) {
      const idx = r.start + r.count - 1;
      const err = ui.game.act({ k: 'cancelTrain', idx, back: s.trainQueue.length - 1 - idx, type }).err;
      if (err) fail(err);
      else sfx('click');
    }
    render(true);
  };

  const render = (force = false): void => {
    const s = ui.state;
    const cap = armyCapacity(s);
    const used = armyUsed(s);
    const q = queueUsed(s);
    const finals = hasEvent(s, 'finals');
    const runs = queueRuns(s);
    const ready = reserveReady(s);
    // the troop being trained right now: the first one that isn't already trained and waiting
    const head = s.trainQueue.find((x) => !isReady(x));
    const inLine = !!head && (head.chucks ?? 0) > 0;
    const sc = spellCapacity(s);
    const hs = heroTypes.filter((h) => heroUnlocked(s, h));
    // Everything shown except the countdowns. Unchanged: only the countdowns are updated, so
    // the cards under the pointer are not replaced several times a second.
    const nsig = JSON.stringify([
      cap,
      used,
      q,
      finals,
      runs.map((r) => [r.type, r.count, r.ready]),
      inLine,
      TROOP_ORDER.map((t) => [s.troopLevels[t], s.army[t] ?? 0, trainCheck(s, t)]),
      sc,
      SPELL_ORDER.map((t) => [s.spells[t] ?? 0, brewCheck(s, t)]),
      s.spellQueue.map((x) => x.type),
      hs.map((h) => [s.heroes[h].level, !!s.heroes[h].upgrade, heroAvailable(s, h)]),
    ]);
    if (!force && nsig === sig) {
      for (const t of ticks) t();
      return;
    }
    sig = nsig;
    ticks = [];
    const scroll = m.body.scrollTop;
    m.body.innerHTML = '';
    const capRow = el('div', 'row');
    capRow.innerHTML = `<b class="cap-label">Residence Halls</b><div class="capbar"><div style="width:${Math.min(100, (used / Math.max(1, cap)) * 100)}%"></div><span class="stroke">${used} / ${cap} ready to raid</span></div>`;
    m.body.appendChild(capRow);
    // The second army: trained troops waiting for room, plus whatever is still training.
    const resRow = el('div', 'row');
    resRow.style.marginTop = '6px';
    const over = Math.max(0, used + q - cap); // how much of the queue will not fit in the halls yet
    resRow.innerHTML = `<b class="cap-label">Reserve army</b><div class="capbar reserve"><div style="width:${Math.min(100, (over / Math.max(1, cap)) * 100)}%"></div><span class="stroke">${q ? `${ready} ready + ${q - ready} training` : 'empty'} · room for ${Math.max(0, cap * 2 - used - q)} more</span></div>`;
    resRow.title = 'Train a second army ahead of time. Trained troops wait here and move into the halls as soon as there is room, such as after a raid.';
    m.body.appendChild(resRow);
    if (finals) m.body.appendChild(el('div', 'flavor', '📚 Finals Week: training is 50% slower. Everyone is "studying."'));

    // queue
    const qTitle = el('div', 'section-title', 'Training queue');
    m.body.appendChild(qTitle);
    if (s.trainQueue.length) {
      const total = el('small');
      qTitle.append(` `, total);
      const upd = (): void => {
        const st = ui.state;
        const rdy = st.trainQueue.filter(isReady).length;
        const training = st.trainQueue.length - rdy;
        total.textContent = `(${[training ? `${training} training · ⏱ ${fmtTime(trainQueueLeft(st))} left` : '', rdy ? `${rdy} ready, waiting for room` : ''].filter(Boolean).join(' · ')})`;
      };
      upd();
      ticks.push(upd);
    }
    const qd = el('div', 'queue');
    if (!runs.length) qd.appendChild(el('span', 'flavor', 'Nobody in training. Click a troop below to recruit, or hold to recruit several. You can train a second army ahead of time; it waits here until the halls have room.'));
    const firstTraining = runs.findIndex((r) => !r.ready);
    runs.forEach((r, i) => {
      const qi = el('div', `qitem ${r.ready ? 'ready' : ''}`);
      qi.appendChild(unitThumb(r.type, 62, 62, s.troopLevels[r.type]));
      if (r.count > 1) qi.appendChild(el('div', 'n', `×${r.count}`));
      qi.appendChild(el('div', 'x', '✖'));
      if (r.ready) qi.appendChild(el('div', 't', '✓ Ready'));
      if (i === firstTraining) {
        const pr = el('div', 'prog');
        const tm = el('div', 't');
        qi.append(pr, tm);
        const upd = (): void => {
          const it = ui.state.trainQueue.find((x) => !isReady(x));
          if (!it) return;
          pr.style.width = `${(1 - it.left / it.total) * 100}%`;
          tm.textContent = (it.chucks ?? 0) > 0 ? '🍽️ line' : fmtTime(trainItemLeft(ui.state, it));
        };
        upd();
        ticks.push(upd);
      }
      qi.title = `${TROOPS[r.type].name}${r.count > 1 ? ` ×${r.count}` : ''}${r.ready ? ': trained, waiting for room in the halls' : ''}: click to cancel one (full refund)`;
      qi.onpointerdown = press(() => cancelOne(runs.length - 1 - i, r.type));
      qd.appendChild(qi);
    });
    if (inLine) qd.appendChild(el('div', 'chucks', `${TROOPS[head.type].name} is ${CHUCKS_LINE}`));
    m.body.appendChild(qd);

    // troop cards
    m.body.appendChild(el('div', 'section-title', 'Recruit <small>(click, or hold to keep recruiting)</small>'));
    const grid = el('div', 'cards');
    for (const t of TROOP_ORDER) {
      const d = TROOPS[t];
      const lvl = s.troopLevels[t];
      const cost = d.levels[lvl - 1].cost;
      const unlocked = troopUnlocked(s, t);
      const err = trainCheck(s, t);
      const full = unlocked && armyUsed(s) + queueUsed(s) + d.housing > cap * ARMIES;
      const card = el('div', `card ${unlocked ? (err ? 'dim' : '') : 'locked'}`);
      card.dataset.troop = t;
      card.appendChild(unitThumb(t, 100, 90, lvl));
      card.appendChild(el('div', 'name', d.name));
      card.appendChild(el('div', 'badge', `Lv${lvl}`));
      card.appendChild(el('div', 'count', `×${s.army[t] ?? 0}`));
      if (unlocked) {
        card.appendChild(el('div', 'meta', full ? '<b class="bad">🏠 Both armies full</b>' : `🏠 ${d.housing} · ⏱ ${fmtTime(d.trainTime * (finals ? 2 : 1))}`));
        card.appendChild(el('div', '', costHtml(d.res, cost, canAfford(s, d.res, cost))));
      } else {
        card.appendChild(el('div', 'meta', `🔒 ${BUILDINGS[d.barracks].name} Lv${d.barracksLevel}`));
      }
      card.title = `${d.desc}\n\n"${d.flavor}"${err ? `\n\n${err}` : ''}`;
      card.onpointerdown = (e) => {
        if (e.button !== 0) return;
        // Touch pointers stay captured by the pressed card, which is about to be replaced;
        // let go so the release reaches the window and ends the hold.
        try {
          card.releasePointerCapture(e.pointerId);
        } catch {
          /* nothing was captured */
        }
        startHold(t);
      };
      grid.appendChild(card);
    }
    m.body.appendChild(grid);

    // spells
    if (sc > 0) {
      m.body.appendChild(el('div', 'section-title', `Spells (${spellsUsed(s)}/${sc})`));
      const sq = el('div', 'queue');
      for (const t of SPELL_ORDER) {
        for (let i = 0; i < (s.spells[t] ?? 0); i++) {
          const qi = el('div', 'qitem');
          qi.appendChild(spellThumb(t, 62, 62));
          qi.style.cursor = 'default';
          sq.appendChild(qi);
        }
      }
      s.spellQueue.forEach((it, i) => {
        const qi = el('div', 'qitem');
        qi.style.opacity = '0.7';
        qi.style.cursor = 'default';
        qi.appendChild(spellThumb(it.type, 62, 62));
        if (i === 0) {
          const tm = el('div', 't');
          qi.appendChild(tm);
          const upd = (): void => {
            const cur = ui.state.spellQueue[0];
            if (cur) tm.textContent = fmtTime(cur.left);
          };
          upd();
          ticks.push(upd);
        }
        sq.appendChild(qi);
      });
      if (!sq.children.length) sq.appendChild(el('span', 'flavor', 'No spells brewed yet.'));
      m.body.appendChild(sq);
      const sg = el('div', 'cards');
      sg.style.marginTop = '10px';
      for (const t of SPELL_ORDER) {
        const d = SPELLS[t];
        const err = brewCheck(s, t);
        const locked = err?.startsWith('Requires');
        const card = el('div', `card ${locked ? 'locked' : err ? 'dim' : ''}`);
        card.appendChild(spellThumb(t, 90, 80));
        card.appendChild(el('div', 'name', d.name));
        card.appendChild(el('div', 'meta', locked ? `🔒 Brew Lab Lv${d.sscLevel}` : `⏱ ${fmtTime(d.brewTime)}`));
        if (!locked) card.appendChild(el('div', '', costHtml(d.res, d.cost, canAfford(s, d.res, d.cost))));
        card.title = `${d.desc}\n\n"${d.flavor}"${err ? `\n\n${err}` : ''}`;
        card.onpointerdown = press(() => {
          const e2 = ui.game.act({ k: 'brew', type: t }).err;
          if (e2) fail(e2);
          else sfx('spell');
          render();
        });
        sg.appendChild(card);
      }
      m.body.appendChild(sg);
    }

    // heroes
    if (hs.length) {
      m.body.appendChild(el('div', 'section-title', 'Heroes'));
      const hg = el('div', 'cards');
      for (const h of hs) {
        const card = el('div', 'card');
        card.appendChild(unitThumb(h, 100, 90, s.heroes[h].level));
        card.appendChild(el('div', 'name', HEROES[h].name));
        card.appendChild(el('div', 'badge', `Lv${s.heroes[h].level}`));
        const meta = el('div', 'meta');
        const upd = (): void => {
          const st = ui.state.heroes[h];
          meta.textContent = st.upgrade ? `⬆ Upgrading · ${fmtTime(st.upgrade.end - ui.state.clock)}` : heroAvailable(ui.state, h) ? '✅ Ready for battle' : `😴 Recovering ${Math.round(st.hpFrac * 100)}%`;
        };
        upd();
        ticks.push(upd);
        card.appendChild(meta);
        card.onpointerdown = press(() => ui.openHero(h));
        hg.appendChild(card);
      }
      m.body.appendChild(hg);
    }
    m.body.scrollTop = scroll;
  };
  render(true);
  ui.refreshModal = () => render();
}

export function openLibrary(ui: UI): void {
  const m = ui.modal('Centennial Library — Research', { headIcon: '<span style="font-size:32px">📚</span>' });
  const render = (): void => {
    const s = ui.state;
    m.body.innerHTML = '';
    m.body.appendChild(el('div', 'flavor', `Library Lv${libraryLevel(s)}. Shhh. Research upgrades your troops permanently.`));
    if (s.research) {
      const r = s.research;
      const left = Math.max(0, r.end - s.clock);
      const row = el('div', 'row');
      row.style.margin = '10px 0';
      row.innerHTML = `<b style="color:#1c3d7a">Researching ${TROOPS[r.troop].name} → Lv${s.troopLevels[r.troop] + 1}</b><div class="capbar"><div style="width:${(1 - left / r.total) * 100}%"></div><span class="stroke">${fmtTime(left)}</span></div>`;
      m.body.appendChild(row);
    }
    const grid = el('div', 'cards');
    for (const t of TROOP_ORDER) {
      const d = TROOPS[t];
      const lvl = s.troopLevels[t];
      const err = researchCheck(s, t);
      const maxed = lvl >= d.levels.length;
      const card = el('div', `card ${err && err !== 'Not enough Coffee' && err !== 'The Library is already researching' ? 'locked' : ''}`);
      card.appendChild(unitThumb(t, 100, 90, lvl));
      card.appendChild(el('div', 'name', d.name));
      card.appendChild(el('div', 'badge', `Lv${lvl}`));
      if (maxed) card.appendChild(el('div', 'meta', '⭐ Max level'));
      else {
        const n = d.levels[lvl];
        const c = d.levels[lvl - 1];
        card.appendChild(el('div', 'meta', `HP ${c.hp}→<b class="next">${n.hp}</b> · DPS ${c.dps}→<b class="next">${n.dps}</b>`));
        card.appendChild(el('div', 'meta', err && err.startsWith('Requires') ? `🔒 ${err}` : `⏱ ${fmtTime(n.researchTime)}`));
        card.appendChild(el('div', '', costHtml('coffee', n.researchCost, canAfford(s, 'coffee', n.researchCost))));
      }
      card.onclick = () => {
        const e2 = ui.game.act({ k: 'research', type: t }).err;
        if (e2) {
          ui.toast(e2, 'bad');
          sfx('error');
        } else {
          sfx('build');
          ui.toast(`Researching ${d.name}. Someone check the third floor in a bit.`, 'good');
        }
        render();
      };
      grid.appendChild(card);
    }
    m.body.appendChild(grid);
  };
  render();
  ui.refreshModal = render;
}

export function openHero(ui: UI, h: HeroType): void {
  const d = HEROES[h];
  const m = ui.modal(d.name, { narrow: true, headIcon: '<span style="font-size:30px">🎓</span>' });
  const render = (): void => {
    const s = ui.state;
    const st = s.heroes[h];
    const L = d.levels[st.level - 1];
    const N = d.levels[st.level];
    m.body.innerHTML = '';
    const row = el('div', 'row');
    row.appendChild(unitThumb(h, 140, 140, st.level));
    const col = el('div', 'col');
    col.appendChild(el('div', '', d.desc));
    col.appendChild(el('div', 'flavor', `"${d.flavor}"`));
    col.appendChild(el('div', '', `<b>Ability — ${d.ability.name}:</b> ${d.ability.desc}`));
    row.appendChild(col);
    m.body.appendChild(row);
    const t = el('table', 'stats-table');
    t.innerHTML = `<tr><td>Level</td><td>${st.level}${N ? ` <span class="next">→ ${st.level + 1}</span>` : ' (max)'}</td></tr>
      <tr><td>Hitpoints</td><td>${L.hp}${N ? ` <span class="next">→ ${N.hp}</span>` : ''}</td></tr>
      <tr><td>Damage/sec</td><td>${L.dps}${N ? ` <span class="next">→ ${N.dps}</span>` : ''}</td></tr>
      <tr><td>Status</td><td>${st.upgrade ? `Upgrading (${fmtTime(st.upgrade.end - s.clock)})` : st.hpFrac < 1 ? `Recovering: ${Math.round(st.hpFrac * 100)}%` : 'Ready!'}</td></tr>`;
    m.body.appendChild(t);
    if (N && !st.upgrade) {
      const err = heroUpgradeCheck(s, h, dmcLevel(s));
      const b = el('button', `btn ${err ? 'gray' : 'purple'}`, `Upgrade ${costHtml('chapel', N.upgradeCost, canAfford(s, 'chapel', N.upgradeCost))}`);
      b.style.marginTop = '12px';
      b.onclick = () => {
        const e2 = ui.game.act({ k: 'heroUpgrade', type: h }).err;
        if (e2) {
          ui.toast(e2, 'bad');
          sfx('error');
        } else sfx('build');
        render();
      };
      m.body.appendChild(b);
    }
  };
  render();
  ui.refreshModal = render;
}
