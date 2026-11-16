// Army training, spell brewing, Library research and hero upgrades.
import { BUILDINGS } from '../../config/buildings';
import { CHUCKS_LINE } from '../../config/humor';
import { SPELLS, SPELL_ORDER } from '../../config/spells';
import { HEROES, TROOPS, TROOP_ORDER } from '../../config/troops';
import type { HeroType } from '../../config/types';
import { sfx } from '../../core/audio';
import {
  armyCapacity,
  armyUsed,
  brew,
  brewCheck,
  cancelTrain,
  heroAvailable,
  heroUnlocked,
  heroUpgrade,
  heroUpgradeCheck,
  libraryLevel,
  queueUsed,
  researchCheck,
  spellCapacity,
  spellsUsed,
  startResearch,
  train,
  troopUnlocked,
} from '../../game/army';
import { canAfford, dmcLevel, hasEvent } from '../../game/economy';
import { costHtml, el, fmtTime } from '../dom';
import { icon } from '../icons';
import { spellThumb, unitThumb } from '../thumbs';
import type { UI } from '../ui';

export function openArmy(ui: UI): void {
  const m = ui.modal('Army Training', { headIcon: icon('army', 36) });
  const render = (): void => {
    const s = ui.state;
    const scroll = m.body.scrollTop;
    m.body.innerHTML = '';
    const cap = armyCapacity(s);
    const used = armyUsed(s);
    const q = queueUsed(s);
    const capRow = el('div', 'row');
    capRow.innerHTML = `<b style="color:#1c3d7a">Residence Halls</b><div class="capbar"><div style="width:${Math.min(100, ((used + q) / Math.max(1, cap)) * 100)}%"></div><span class="stroke">${used} trained + ${q} in training / ${cap}</span></div>`;
    m.body.appendChild(capRow);
    if (hasEvent(s, 'finals')) m.body.appendChild(el('div', 'flavor', '📚 Finals Week: training is 50% slower. Everyone is "studying."'));

    // queue
    m.body.appendChild(el('div', 'section-title', 'Training queue'));
    const qd = el('div', 'queue');
    if (!s.trainQueue.length) qd.appendChild(el('span', 'flavor', 'Nobody in training. Click a troop below to recruit!'));
    s.trainQueue.forEach((it, i) => {
      const qi = el('div', 'qitem');
      qi.appendChild(unitThumb(it.type, 62, 62));
      qi.appendChild(el('div', 'x', '✖'));
      if (i === 0) {
        const pr = el('div', 'prog');
        pr.style.width = `${(1 - it.left / it.total) * 100}%`;
        qi.appendChild(pr);
        qi.appendChild(el('div', 't', it.chucks && it.chucks > 0 ? '🍽️ line' : fmtTime(it.left)));
      }
      qi.title = 'Click to cancel (refund)';
      qi.onclick = () => {
        cancelTrain(s, i);
        sfx('click');
        render();
      };
      qd.appendChild(qi);
    });
    if (s.trainQueue[0]?.chucks && s.trainQueue[0].chucks > 0) qd.appendChild(el('div', 'chucks', `${TROOPS[s.trainQueue[0].type].name} is ${CHUCKS_LINE}`));
    m.body.appendChild(qd);

    // troop cards
    m.body.appendChild(el('div', 'section-title', 'Recruit'));
    const grid = el('div', 'cards');
    for (const t of TROOP_ORDER) {
      const d = TROOPS[t];
      const lvl = s.troopLevels[t];
      const cost = d.levels[lvl - 1].cost;
      const unlocked = troopUnlocked(s, t);
      const card = el('div', `card ${unlocked ? '' : 'locked'}`);
      card.appendChild(unitThumb(t, 100, 90));
      card.appendChild(el('div', 'name', d.name));
      card.appendChild(el('div', 'badge', `Lv${lvl}`));
      card.appendChild(el('div', 'count', `×${s.army[t] ?? 0}`));
      if (unlocked) {
        card.appendChild(el('div', 'meta', `🏠 ${d.housing} · ⏱ ${d.trainTime}s`));
        card.appendChild(el('div', '', costHtml(d.res, cost, canAfford(s, d.res, cost))));
      } else {
        card.appendChild(el('div', 'meta', `🔒 ${BUILDINGS[d.barracks].name} Lv${d.barracksLevel}`));
      }
      card.title = `${d.desc}\n\n"${d.flavor}"`;
      card.onclick = () => {
        const err = train(s, t);
        if (err) {
          ui.toast(err, 'bad');
          sfx('error');
        } else sfx('deploy');
        render();
      };
      grid.appendChild(card);
    }
    m.body.appendChild(grid);

    // spells
    const sc = spellCapacity(s);
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
        qi.appendChild(spellThumb(it.type, 62, 62));
        if (i === 0) qi.appendChild(el('div', 't', fmtTime(it.left)));
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
        const card = el('div', `card ${locked ? 'locked' : ''}`);
        card.appendChild(spellThumb(t, 90, 80));
        card.appendChild(el('div', 'name', d.name));
        card.appendChild(el('div', 'meta', locked ? `🔒 Brew Lab Lv${d.sscLevel}` : `⏱ ${d.brewTime}s`));
        if (!locked) card.appendChild(el('div', '', costHtml(d.res, d.cost, canAfford(s, d.res, d.cost))));
        card.title = `${d.desc}\n\n"${d.flavor}"`;
        card.onclick = () => {
          const e2 = brew(s, t);
          if (e2) {
            ui.toast(e2, 'bad');
            sfx('error');
          } else sfx('spell');
          render();
        };
        sg.appendChild(card);
      }
      m.body.appendChild(sg);
    }

    // heroes
    const hs = (['prof', 'president'] as HeroType[]).filter((h) => heroUnlocked(s, h));
    if (hs.length) {
      m.body.appendChild(el('div', 'section-title', 'Heroes'));
      const hg = el('div', 'cards');
      for (const h of hs) {
        const st = s.heroes[h];
        const card = el('div', 'card');
        card.appendChild(unitThumb(h, 100, 90));
        card.appendChild(el('div', 'name', HEROES[h].name));
        card.appendChild(el('div', 'badge', `Lv${st.level}`));
        card.appendChild(
          el('div', 'meta', st.upgrade ? '⬆ Upgrading' : heroAvailable(s, h) ? '✅ Ready for battle' : `😴 Recovering ${Math.round(st.hpFrac * 100)}%`),
        );
        card.onclick = () => ui.openHero(h);
        hg.appendChild(card);
      }
      m.body.appendChild(hg);
    }
    m.body.scrollTop = scroll;
  };
  render();
  ui.refreshModal = render;
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
      card.appendChild(unitThumb(t, 100, 90));
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
        const e2 = startResearch(s, t);
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
    row.appendChild(unitThumb(h, 140, 140));
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
        const e2 = heroUpgrade(s, h, dmcLevel(s));
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
