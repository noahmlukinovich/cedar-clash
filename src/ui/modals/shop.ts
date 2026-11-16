// Campus Shop and the building info card.
import { BUILDINGS, SHOP_TABS, maxCount, maxLevelForDmc } from '../../config/buildings';
import { TROOPS } from '../../config/troops';
import { sfx } from '../../core/audio';
import { buildCheck, canAfford, countOf, dmcLevel } from '../../game/economy';
import type { BuildingInst } from '../../game/state';
import { costHtml, el, fmt, fmtTime } from '../dom';
import { icon } from '../icons';
import { buildingThumb } from '../thumbs';
import type { UI } from '../ui';

export function openShop(ui: UI, tab = 'resource'): void {
  const m = ui.modal('Campus Shop', {
    tabs: SHOP_TABS.map((t) => ({ id: t.id, label: t.label })),
    activeTab: tab,
    onTab: (id) => render(id),
    headIcon: icon('shop', 36),
  });
  const render = (id: string): void => {
    const s = ui.state;
    const dl = dmcLevel(s);
    m.body.innerHTML = '';
    const grid = el('div', 'cards');
    const tabDef = SHOP_TABS.find((t) => t.id === id)!;
    for (const type of tabDef.types) {
      const def = BUILDINGS[type];
      const n = countOf(s, type);
      const max = maxCount(type, dl);
      const L = def.levels[0];
      const err = buildCheck(s, type);
      const locked = max === 0;
      const card = el('div', `card ${locked ? 'locked' : ''}`);
      card.appendChild(buildingThumb(type, 1));
      card.appendChild(el('div', 'name', def.name));
      card.appendChild(el('div', 'count', `${n}/${max}`));
      if (locked) {
        card.appendChild(el('div', 'meta', `🔒 Unlocks at DMC ${def.counts.findIndex((c) => c > 0)}`));
      } else {
        card.appendChild(el('div', 'meta', L.time > 0 ? `⏱ ${fmtTime(L.time)}` : 'Instant'));
        card.appendChild(el('div', '', costHtml(L.res, L.cost, canAfford(s, L.res, L.cost))));
      }
      card.title = `${def.desc}\n\n"${def.flavor}"`;
      card.onclick = () => {
        if (err) {
          ui.toast(err, 'bad');
          sfx('error');
          return;
        }
        sfx('click');
        ui.closeModal();
        ui.game.village.startPlacing(type);
      };
      grid.appendChild(card);
    }
    m.body.appendChild(grid);
    m.body.appendChild(el('p', 'flavor', 'Hover a card for the official (and unofficial) description.'));
  };
  render(tab);
}

export function openInfo(ui: UI, b: BuildingInst): void {
  const def = BUILDINGS[b.type];
  const m = ui.modal(`${b.name ?? def.name} <small>Lv ${b.level}</small>`, { narrow: true });
  const s = ui.state;
  const row = el('div', 'row');
  row.appendChild(buildingThumb(b.type, Math.max(1, b.level), 160, 140));
  const col = el('div', 'col');
  col.appendChild(el('div', '', def.desc));
  col.appendChild(el('div', 'flavor', `"${def.flavor}"`));
  row.appendChild(col);
  m.body.appendChild(row);
  const cur = def.levels[Math.max(0, b.level - 1)];
  const nxt = def.levels[b.level];
  const t = el('table', 'stats-table');
  const add = (k: string, v: string | number | undefined, n?: string | number | undefined): void => {
    if (v === undefined) return;
    const nv = n !== undefined && n !== v ? ` <span class="next">→ ${n}</span>` : '';
    t.innerHTML += `<tr><td>${k}</td><td>${v}${nv}</td></tr>`;
  };
  add('Hitpoints', cur.hp, nxt?.hp);
  if (cur.rate) add('Production', `${cur.rate}/min`, nxt?.rate ? `${nxt.rate}/min` : undefined);
  if (cur.capacity) add('Capacity', fmt(cur.capacity), nxt?.capacity ? fmt(nxt.capacity) : undefined);
  if (cur.housing) add('Troop housing', cur.housing, nxt?.housing);
  if (cur.defense) {
    const d = cur.defense;
    const nd = nxt?.defense;
    add('Damage/sec', d.dps, nd?.dps);
    add('Range', `${d.range} tiles`, nd ? `${nd.range} tiles` : undefined);
    if (d.splash) add('Splash radius', d.splash, nd?.splash);
    if (d.slow) add('Slow', `${Math.round(d.slow * 100)}%`);
    if (d.freezeCharge) add('Freeze every', `${d.freezeCharge}s`, nd?.freezeCharge ? `${nd.freezeCharge}s` : undefined);
    if (d.blessHeal !== undefined) add('Wall blessing', d.blessHeal ? `${(d.blessHeal * 100).toFixed(1)}%/s` : 'Lv3+', nd?.blessHeal ? `${(nd.blessHeal * 100).toFixed(1)}%/s` : undefined);
  }
  if (cur.fans) add('Reinforcement fans', cur.fans, nxt?.fans);
  if (cur.trapDps) add('Swarm dmg/sec', cur.trapDps, nxt?.trapDps);
  if (def.trains) add('Trains', def.trains.map((x) => TROOPS[x].name).join(', '));
  const maxL = maxLevelForDmc(b.type, dmcLevel(s));
  add('Max level (current DMC)', `${maxL} / ${def.levels.length}`);
  m.body.appendChild(t);
}
