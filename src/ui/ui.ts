import { BUILDINGS, SHOP_TABS, maxCount, maxLevelForDmc } from '../config/buildings';
import { DEBUG_SPEEDS, SCOUT_COST_PER_DMC } from '../config/balance';
import { ACHIEVEMENTS, EVENT_INFO, LEAGUES, LOADING_TIPS, leagueFor, CHAPEL_ATTEND_LINES, CHUCKS_LINE } from '../config/humor';
import { HEROES, TROOPS, TROOP_ORDER } from '../config/troops';
import { SPELLS, SPELL_ORDER } from '../config/spells';
import type { BuildingType, HeroType, ResourceId, TroopType } from '../config/types';
import { isMuted, setMuted, sfx } from '../core/audio';
import { bus } from '../core/bus';
import { pick } from '../core/rng';
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
  trainCheck,
  troopUnlocked,
} from '../game/army';
import {
  buildCheck,
  builders,
  canAfford,
  caps,
  countOf,
  dmcLevel,
  finishNow,
  finishNowCost,
  hasEvent,
  nextLevelInfo,
  resName,
  startUpgrade,
  upgradeCheck,
} from '../game/economy';
import { attendChapel, canAttendChapel, chapelReward, startEvent } from '../game/events';
import { exportSave, resetSave, saveGame } from '../game/save';
import { MAX_NAME_LEN, cleanName, renamePlayer } from '../game/state';
import type { BuildingInst } from '../game/state';
import type { Game } from '../main';
import { fmtTime } from '../village/villageScene';
import { ICONS, icon } from './icons';
import { buildingThumb, spellThumb, unitThumb } from './thumbs';

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export function fmt(n: number): string {
  n = Math.floor(n);
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 10_000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString();
}

const RES_COLORS: Record<ResourceId, string> = {
  tuition: 'linear-gradient(#ffe066,#e3a817)',
  coffee: 'linear-gradient(#b0703f,#6b3f22)',
  chapel: 'linear-gradient(#c49cf5,#7b3fa0)',
};

export function costHtml(res: ResourceId, amt: number, ok = true): string {
  return `<span class="price ${ok ? '' : 'bad'}">${icon(res, 18)} ${amt > 0 ? fmt(amt) : 'Free'}</span>`;
}

export class UI {
  root = document.getElementById('ui')!;
  village = el('div', 'hud');
  resEls: Record<ResourceId, { val: HTMLElement; fill: HTMLElement; cap: HTMLElement; ic: HTMLElement }> = {} as never;
  buildersEl!: HTMLElement;
  trophyEl!: HTMLElement;
  chipsEl!: HTMLElement;
  selPanel!: HTMLElement;
  placePanel!: HTMLElement;
  bottomLeft!: HTMLElement;
  bottomRight!: HTMLElement;
  sideRight!: HTMLElement;
  toasts = el('div');
  modalBack: HTMLElement | null = null;
  refreshModal: (() => void) | null = null;
  private lastSelId = -2;
  private chipSig = '';
  private lastSelSig = '';
  private tick = 0;

  constructor(public game: Game) {
    this.toasts.id = 'toasts';
    document.body.appendChild(this.toasts);
    this.root.appendChild(this.village);
    this.buildVillageHud();
    bus.on('toast', (d: { text: string; kind: 'info' | 'good' | 'bad' | 'event' }) => this.toast(d.text, d.kind));
    bus.on('selection', () => this.renderSelection(true));
    bus.on('mode', () => this.renderSelection(true));
    bus.on('changed', () => this.renderSelection(true));
    bus.on('buildingDone', () => this.renderSelection(true));
  }

  get state() {
    return this.game.state;
  }

  // ---------- Toasts & banners ----------
  toast(text: string, kind: 'info' | 'good' | 'bad' | 'event' = 'info', ms = 2600): void {
    const t = el('div', `toast ${kind} stroke`, text);
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 3) this.toasts.firstChild?.remove();
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 350);
    }, ms + (kind === 'event' ? 2500 : 0));
  }

  banner(text: string, color = '#fff'): void {
    const b = el('div', 'banner stroke', text);
    b.style.color = color;
    document.body.appendChild(b);
    setTimeout(() => b.remove(), 2300);
  }

  // ---------- Village HUD ----------
  private buildVillageHud(): void {
    const v = this.village;
    // resources
    const stack = el('div', 'res-stack');
    for (const r of ['tuition', 'coffee', 'chapel'] as ResourceId[]) {
      const bar = el('div', 'resbar');
      bar.title = resName(r);
      const track = el('div', 'track');
      const fill = el('div', 'fill');
      fill.style.background = RES_COLORS[r];
      track.appendChild(fill);
      const ic = el('span', 'ic', ICONS[r]);
      ic.style.width = ic.style.height = '36px';
      const val = el('div', 'val stroke', '0');
      const cap = el('div', 'cap stroke', '');
      bar.append(track, ic, val, cap);
      stack.appendChild(bar);
      this.resEls[r] = { val, fill, cap, ic };
    }
    v.appendChild(stack);

    this.buildersEl = el('div', 'builders stroke');
    this.buildersEl.title = 'Facilities Crew (builders). Build more sheds to work on more things at once.';
    v.appendChild(this.buildersEl);

    const prof = el('div', 'profile');
    this.trophyEl = el('div', 'trophy-box stroke');
    this.trophyEl.onclick = () => this.openLeagues();
    this.chipsEl = el('div', 'event-chips');
    prof.append(this.trophyEl, this.chipsEl);
    v.appendChild(prof);

    this.bottomLeft = el('div', 'bottom-left');
    const atk = el('button', 'btn attack-btn', `${icon('sword', 56)}<span>Attack!</span>`);
    atk.onclick = () => {
      sfx('click');
      this.openAttack();
    };
    this.bottomLeft.appendChild(atk);
    v.appendChild(this.bottomLeft);

    this.bottomRight = el('div', 'bottom-right');
    const army = el('button', 'btn square blue', `${icon('army', 40)}<span>Army</span>`);
    army.onclick = () => {
      sfx('click');
      this.openArmy();
    };
    const shop = el('button', 'btn square gold', `${icon('shop', 40)}<span>Shop</span>`);
    shop.onclick = () => {
      sfx('click');
      this.openShop();
    };
    this.bottomRight.append(army, shop);
    v.appendChild(this.bottomRight);

    this.sideRight = el('div', 'side-right');
    const mk = (ic: string, title: string, fn: () => void, cls = 'blue'): HTMLButtonElement => {
      const b = el('button', `btn round ${cls}`, icon(ic, 32));
      b.title = title;
      b.onclick = () => {
        sfx('click');
        fn();
      };
      this.sideRight.appendChild(b);
      return b;
    };
    mk('gear', 'Settings & Debug', () => this.openSettings(), 'gray');
    mk('medal', 'Achievements', () => this.openAchievements(), 'gold');
    mk('chapel', 'Chapel', () => this.openChapel(), 'purple');
    const snd = mk(isMuted() ? 'mute' : 'sound', 'Toggle sound', () => {
      setMuted(!isMuted());
      this.state.settings.muted = isMuted();
      snd.innerHTML = icon(isMuted() ? 'mute' : 'sound', 32);
    }, 'gray');
    const collectAll = mk('tuition', 'Collect all', () => this.game.village.collectAll(), 'green');
    collectAll.classList.remove('green');
    v.appendChild(this.sideRight);

    this.selPanel = el('div', 'sel-panel hidden');
    v.appendChild(this.selPanel);
    this.placePanel = el('div', 'place-panel hidden');
    v.appendChild(this.placePanel);
  }

  showVillage(show: boolean): void {
    this.village.classList.toggle('hidden', !show);
  }

  resourceAnchor(r: ResourceId): { x: number; y: number } {
    const rect = this.resEls[r].ic.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  bumpResource(r: ResourceId): void {
    const ic = this.resEls[r].ic;
    ic.classList.add('bump');
    setTimeout(() => ic.classList.remove('bump'), 150);
  }

  update(): void {
    this.tick++;
    if (this.tick % 6 !== 0) return; // ~10 Hz
    const s = this.state;
    const cp = caps(s);
    for (const r of ['tuition', 'coffee', 'chapel'] as ResourceId[]) {
      const e = this.resEls[r];
      e.val.textContent = fmt(s.resources[r]);
      e.cap.textContent = `Max: ${fmt(cp[r])}`;
      e.fill.style.width = `${Math.min(100, (s.resources[r] / Math.max(1, cp[r])) * 100)}%`;
    }
    const bl = builders(s);
    this.buildersEl.innerHTML = `${icon('builder', 30)}<div>${bl.total - bl.busy}/${bl.total}<small>Facilities Crew</small></div>`;
    const lg = leagueFor(s.trophies);
    this.trophyEl.innerHTML = `${icon('trophy', 34)}<div><div class="num">${s.trophies}</div><div class="league" style="color:${lg.color}">${lg.name}</div></div>`;
    // event chips (rebuild only when the set of events changes; otherwise just update timers)
    const active = s.events.filter((e) => e.end > s.clock);
    const sig = active.map((e) => e.type).join(',');
    if (sig !== this.chipSig) {
      this.chipSig = sig;
      this.chipsEl.innerHTML = '';
      for (const e of active) {
        const info = EVENT_INFO[e.type];
        const ic = e.type === 'ringbyspring' ? icon('ring', 20) : info.icon;
        const chip = el('div', `chip stroke ${e.type === 'ringbyspring' ? 'ring' : ''}`, `${ic} ${info.name}<span class="tl"></span>`);
        chip.title = info.desc;
        this.chipsEl.appendChild(chip);
      }
    }
    active.forEach((e, i) => {
      const tl = this.chipsEl.children[i]?.querySelector('.tl');
      const left = e.end - s.clock;
      if (tl) tl.textContent = left < 3000 ? ` · ${fmtTime(left)}` : '';
    });
    this.renderSelection(false);
    if (this.refreshModal && this.tick % 12 === 0) this.refreshModal();
  }

  // ---------- Selection panel ----------
  renderSelection(force: boolean): void {
    const vs = this.game.village;
    const mode = vs.mode.kind;
    if (mode === 'placing') {
      this.selPanel.classList.add('hidden');
      const sig = 'placing:' + (vs.mode.kind === 'placing' ? vs.mode.type : '');
      if (!force && this.lastSelSig === sig) return;
      this.lastSelSig = sig;
      this.placePanel.classList.remove('hidden');
      this.placePanel.innerHTML = '';
      const type = vs.mode.kind === 'placing' ? vs.mode.type : 'wall';
      const hint = el('div', 'hint stroke', `Placing ${BUILDINGS[type].name}: move the mouse, click to place. <kbd>Esc</kbd> cancels.`);
      const ok = el('button', 'btn', '✔ Place');
      ok.onclick = () => vs.confirmPlace();
      const no = el('button', 'btn red', '✖ Cancel');
      no.onclick = () => vs.cancelMode();
      this.placePanel.append(hint, ok, no);
      return;
    }
    this.placePanel.classList.add('hidden');
    const b = vs.selected();
    if (!b || mode === 'moving') {
      this.selPanel.classList.add('hidden');
      this.lastSelId = -1;
      this.lastSelSig = '';
      return;
    }
    const s = this.state;
    const sig = `${b.id}:${b.level}:${!!b.upgrade}:${b.upgrade ? finishNowCost(s, b) : 0}:${Math.floor(s.resources.tuition / 50)}:${Math.floor(s.resources.coffee / 50)}:${s.resources.chapel}:${builders(s).busy}:${Math.floor(b.stored ?? 0) > 0}`;
    if (!force && sig === this.lastSelSig) return;
    const animate = this.lastSelId !== b.id;
    this.lastSelId = b.id;
    this.lastSelSig = sig;
    const p = this.selPanel;
    p.innerHTML = '';
    p.classList.remove('hidden');
    if (animate) {
      p.style.animation = 'none';
      void p.offsetWidth;
      p.style.animation = '';
    }
    const def = BUILDINGS[b.type];
    p.appendChild(el('div', 'sel-title stroke', `${b.name ?? def.name} <small>${b.level === 0 ? '(under construction)' : 'Level ' + b.level}</small>`));
    const row = el('div', 'sel-buttons');
    const btn = (label: string, ic: string, cls: string, fn: () => void, extra = ''): void => {
      const e = el('button', `btn square ${cls}`, `${ic}<span>${label}</span>${extra}`);
      e.onclick = () => {
        sfx('click');
        fn();
      };
      row.appendChild(e);
    };
    btn('Info', `<span style="font-size:30px">ℹ️</span>`, 'blue', () => this.openInfo(b));
    if (b.upgrade) {
      const c = finishNowCost(s, b);
      btn('Finish', icon('clock', 30), 'purple', () => {
        const err = finishNow(s, b);
        if (err) {
          this.toast(err, 'bad');
          sfx('error');
        }
      }, `<span class="cost">${icon('chapel', 14)}${c}</span>`);
    } else {
      const n = nextLevelInfo(s, b);
      if (n) {
        const err = upgradeCheck(s, b);
        btn(
          'Upgrade',
          `<span style="font-size:28px">⬆️</span>`,
          err ? 'gray' : 'gold',
          () => {
            const e2 = startUpgrade(s, b);
            if (e2) {
              this.toast(e2, 'bad');
              sfx('error');
            } else {
              sfx('build');
              vs.pop(b.id);
              this.renderSelection(true);
            }
          },
          `<span class="cost">${icon(n.res, 14)}${fmt(n.cost)}</span>`,
        );
      }
    }
    if ((b.type === 'admissions' || b.type === 'coffeecart') && b.level >= 1) {
      btn('Collect', icon(b.type === 'admissions' ? 'tuition' : 'coffee', 34), 'green', () => vs.doCollect(b));
    }
    if (['reshall', 'biblical', 'callan', 'ens', 'health'].includes(b.type)) btn('Train', icon('army', 34), 'blue', () => this.openArmy());
    if (b.type === 'ssc' && b.level >= 1) btn('Brew', `<span style="font-size:28px">🧪</span>`, 'purple', () => this.openArmy());
    if (b.type === 'library' && b.level >= 1) btn('Research', `<span style="font-size:28px">📚</span>`, 'blue', () => this.openLibrary());
    if (b.type === 'faculty' && b.level >= 1) btn('Prof', `<span style="font-size:28px">🎓</span>`, 'gold', () => this.openHero('prof'));
    if (b.type === 'presidents' && b.level >= 1) btn('President', `<span style="font-size:28px">🏛️</span>`, 'gold', () => this.openHero('president'));
    if (b.type === 'dmc') btn('Chapel', icon('chapel', 34), 'purple', () => this.openChapel());
    if (def.removable) btn('Remove', `<span style="font-size:28px">🗑️</span>`, 'red', () => vs.removeSelected());
    p.appendChild(row);
  }

  // ---------- Modals ----------
  modal(title: string, opts: { narrow?: boolean; tabs?: { id: string; label: string }[]; activeTab?: string; onTab?: (id: string) => void; headIcon?: string } = {}): { body: HTMLElement; close: () => void; setTitle: (t: string) => void } {
    this.closeModal();
    const back = el('div', 'modal-back');
    const m = el('div', `modal ${opts.narrow ? 'narrow' : ''}`);
    const head = el('div', 'modal-head');
    const h2 = el('h2', 'stroke', title);
    if (opts.headIcon) head.appendChild(el('span', '', opts.headIcon));
    head.appendChild(h2);
    const x = el('button', 'btn red modal-close', '✖');
    head.appendChild(x);
    m.appendChild(head);
    if (opts.tabs) {
      const tabs = el('div', 'tabs');
      for (const t of opts.tabs) {
        const tb = el('button', `tab ${t.id === opts.activeTab ? 'active' : ''}`, t.label);
        tb.onclick = () => {
          sfx('click');
          tabs.querySelectorAll('.tab').forEach((q) => q.classList.remove('active'));
          tb.classList.add('active');
          opts.onTab?.(t.id);
        };
        tabs.appendChild(tb);
      }
      m.appendChild(tabs);
    }
    const body = el('div', 'modal-body');
    m.appendChild(body);
    back.appendChild(m);
    const close = (): void => this.closeModal();
    x.onclick = () => {
      sfx('click');
      close();
    };
    back.addEventListener('mousedown', (e) => {
      if (e.target === back) close();
    });
    document.body.appendChild(back);
    this.modalBack = back;
    return { body, close, setTitle: (t) => (h2.innerHTML = t) };
  }

  closeModal(): void {
    this.modalBack?.remove();
    this.modalBack = null;
    this.refreshModal = null;
  }

  isModalOpen(): boolean {
    return !!this.modalBack;
  }

  // ---------- Shop ----------
  openShop(tab = 'resource'): void {
    const m = this.modal('Campus Shop', {
      tabs: SHOP_TABS.map((t) => ({ id: t.id, label: t.label })),
      activeTab: tab,
      onTab: (id) => render(id),
      headIcon: icon('shop', 36),
    });
    const render = (id: string): void => {
      const s = this.state;
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
            this.toast(err, 'bad');
            sfx('error');
            return;
          }
          sfx('click');
          this.closeModal();
          this.game.village.startPlacing(type);
        };
        grid.appendChild(card);
      }
      m.body.appendChild(grid);
      m.body.appendChild(el('p', 'flavor', 'Hover a card for the official (and unofficial) description.'));
    };
    render(tab);
  }

  // ---------- Info ----------
  openInfo(b: BuildingInst): void {
    const def = BUILDINGS[b.type];
    const m = this.modal(`${b.name ?? def.name} <small>Lv ${b.level}</small>`, { narrow: true });
    const s = this.state;
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

  // ---------- Army ----------
  openArmy(): void {
    const m = this.modal('Army Training', { headIcon: icon('army', 36) });
    const render = (): void => {
      const s = this.state;
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
            this.toast(err, 'bad');
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
              this.toast(e2, 'bad');
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
          card.onclick = () => this.openHero(h);
          hg.appendChild(card);
        }
        m.body.appendChild(hg);
      }
      m.body.scrollTop = scroll;
    };
    render();
    this.refreshModal = render;
  }

  // ---------- Library ----------
  openLibrary(): void {
    const m = this.modal('Centennial Library — Research', { headIcon: '<span style="font-size:32px">📚</span>' });
    const render = (): void => {
      const s = this.state;
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
            this.toast(e2, 'bad');
            sfx('error');
          } else {
            sfx('build');
            this.toast(`Researching ${d.name}. Someone check the third floor in a bit.`, 'good');
          }
          render();
        };
        grid.appendChild(card);
      }
      m.body.appendChild(grid);
    };
    render();
    this.refreshModal = render;
  }

  // ---------- Heroes ----------
  openHero(h: HeroType): void {
    const d = HEROES[h];
    const m = this.modal(d.name, { narrow: true, headIcon: '<span style="font-size:30px">🎓</span>' });
    const render = (): void => {
      const s = this.state;
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
            this.toast(e2, 'bad');
            sfx('error');
          } else sfx('build');
          render();
        };
        m.body.appendChild(b);
      }
    };
    render();
    this.refreshModal = render;
  }

  // ---------- Chapel ----------
  openChapel(): void {
    const m = this.modal('Chapel', { narrow: true, headIcon: icon('chapel', 36) });
    const render = (): void => {
      const s = this.state;
      m.body.innerHTML = '';
      m.body.appendChild(el('div', '', `Daily Chapel attendance earns <b>Chapel Credits</b> (rare resource). Keep a streak for bonus credits!`));
      m.body.appendChild(el('div', 'section-title', `Current streak: ${s.chapel.streak} day${s.chapel.streak === 1 ? '' : 's'} 🔥`));
      if (canAttendChapel(s)) {
        const r = chapelReward(s);
        const b = el('button', 'btn purple big', `Attend Chapel (+${r} ${icon('chapel', 26)})`);
        b.onclick = () => {
          const got = attendChapel(s);
          sfx('pray');
          this.toast(`${pick(CHAPEL_ATTEND_LINES)} +${got} Chapel Credits`, 'good');
          this.game.village.particles.text(0, 400, 50, `+${got} Chapel Credits`, '#d6b4ff', 24);
          render();
        };
        m.body.appendChild(b);
      } else {
        m.body.appendChild(el('div', 'flavor', "You've already attended today. The worship team thanks you for clapping on 2 and 4."));
      }
      m.body.appendChild(el('p', 'flavor', 'Also earn Chapel Credits from 3-star raids and achievements. Spend them on heroes, the Chapel Announcement spell, and finishing construction instantly.'));
    };
    render();
  }

  // ---------- Achievements / leagues ----------
  openAchievements(): void {
    const m = this.modal('Achievements', { headIcon: icon('medal', 36) });
    const s = this.state;
    const list = el('div', 'ach-list');
    for (const a of ACHIEVEMENTS) {
      const got = !!s.achievements[a.id];
      list.appendChild(el('div', `ach ${got ? '' : 'locked'}`, `${icon('medal', 40)}<div><b>${a.name}</b><br><span style="font-size:13px">${a.desc}</span><br><span style="font-size:12px">Reward: ${a.reward} ${icon('chapel', 14)}</span></div>`));
    }
    m.body.appendChild(el('div', 'section-title', `${Object.keys(s.achievements).length}/${ACHIEVEMENTS.length} unlocked`));
    m.body.appendChild(list);
  }

  openLeagues(): void {
    const m = this.modal('League Ladder', { narrow: true, headIcon: icon('trophy', 36) });
    const s = this.state;
    const cur = leagueFor(s.trophies);
    const list = el('div', 'league-list');
    for (const l of [...LEAGUES].reverse()) {
      const r = el('div', `league-row stroke ${l === cur ? 'me' : ''}`, `<span>${l.name}</span><span>${icon('trophy', 18)} ${l.min}+</span>`);
      r.style.background = l.color;
      list.appendChild(r);
    }
    m.body.appendChild(el('div', '', `Trophies: <b>${s.trophies}</b> (best ${s.bestTrophies}). Win raids to climb; lose them and slide back toward "Prospective Student."`));
    m.body.appendChild(list);
  }

  // ---------- Attack ----------
  openAttack(): void {
    const s = this.state;
    const m = this.modal('Choose your rival', { narrow: true, headIcon: icon('sword', 36) });
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
        this.closeModal();
        this.game.startRaid({ kind: 'campaign' });
      };
      col.appendChild(b);
      col.appendChild(el('div', 'flavor', 'Tutorial raid: a hand-built rival campus. Beat it to unlock random rivals.'));
    }
    const cost = SCOUT_COST_PER_DMC * dmcLevel(s);
    const f = el('button', `btn big ${s.campaignDone ? '' : 'gray'}`, `🔍 Find a Rival ${costHtml('tuition', cost, canAfford(s, 'tuition', cost))}`);
    f.onclick = () => {
      if (!s.campaignDone) {
        this.toast('Beat Rival State U first!', 'bad');
        sfx('error');
        return;
      }
      if (!canAfford(s, 'tuition', cost)) {
        this.toast('Not enough Tuition to scout.', 'bad');
        sfx('error');
        return;
      }
      s.resources.tuition -= cost;
      this.closeModal();
      this.game.startRaid({ kind: 'random' });
    };
    col.appendChild(f);
    if (hasEvent(s, 'elephantrun')) {
      const e = el('button', 'btn big purple', '🐘 Elephant Run (event!)');
      e.onclick = () => {
        this.closeModal();
        this.game.startRaid({ kind: 'elephant' });
      };
      col.appendChild(e);
      col.appendChild(el('div', 'flavor', EVENT_INFO.elephantrun.desc + ' Uses up to 30 free event Freshmen — your army is not consumed.'));
    }
    m.body.appendChild(col);
  }

  // ---------- Settings / debug ----------
  openSettings(): void {
    const m = this.modal('Settings', { narrow: true, headIcon: icon('gear', 36) });
    const s = this.state;
    const render = (): void => {
      m.body.innerHTML = '';
      const row1 = el('div', 'row');
      const mute = el('button', 'btn blue', isMuted() ? '🔇 Sound: Off' : '🔊 Sound: On');
      mute.onclick = () => {
        setMuted(!isMuted());
        s.settings.muted = isMuted();
        render();
      };
      const save = el('button', 'btn', '💾 Save now');
      save.onclick = () => {
        if (saveGame(s)) this.toast('Saved!', 'good');
        else this.showUpdateBar('stale');
      };
      row1.append(mute, save);
      m.body.appendChild(row1);

      m.body.appendChild(el('div', 'section-title', 'Campus name'));
      const nameRow = el('div', 'row');
      const nameIn = el('input');
      nameIn.type = 'text';
      nameIn.maxLength = MAX_NAME_LEN;
      nameIn.value = s.playerName;
      nameIn.disabled = !!s.nameChanged;
      nameIn.style.flex = '1';
      const nameBtn = el('button', 'btn small', s.nameChanged ? '🔒 Name locked' : '✏️ Rename (once!)');
      nameBtn.disabled = !!s.nameChanged;
      nameBtn.onclick = () => {
        const name = cleanName(nameIn.value);
        if (!confirm(`Rename your campus to "${name}"? You can only do this once.`)) return;
        const err = renamePlayer(s, nameIn.value);
        if (err) this.toast(err, 'bad');
        else {
          saveGame(s);
          this.toast('Name updated!', 'good');
          render();
        }
      };
      nameRow.append(nameIn, nameBtn);
      m.body.appendChild(nameRow);
      if (!s.nameChanged) m.body.appendChild(el('div', 'flavor', 'You get one rename. Choose wisely.'));

      m.body.appendChild(el('div', 'section-title', 'Debug'));
      const dr = el('div', 'debug-row');
      const sp = el('button', 'btn gold', `⏩ Speed: ${DEBUG_SPEEDS[s.settings.speedIdx]}x`);
      sp.onclick = () => {
        s.settings.speedIdx = (s.settings.speedIdx + 1) % DEBUG_SPEEDS.length;
        render();
      };
      const res = el('button', 'btn small', '+ Resources');
      res.onclick = () => {
        const c = caps(s);
        s.resources.tuition = c.tuition;
        s.resources.coffee = c.coffee;
        s.resources.chapel = Math.min(c.chapel, s.resources.chapel + 100);
        this.toast('Financial aid has been approved.', 'good');
      };
      const fin = el('button', 'btn small', '⚡ Finish builds');
      fin.onclick = () => {
        for (const b of s.buildings) if (b.upgrade) b.upgrade.end = s.clock;
        if (s.research) s.research.end = s.clock;
        for (const q of s.trainQueue) {
          q.left = 0.01;
          q.chucks = 0;
        }
        for (const q of s.spellQueue) q.left = 0.01;
        for (const h of Object.values(s.heroes)) {
          if (h.upgrade) h.upgrade.end = s.clock;
          h.hpFrac = 1;
        }
      };
      dr.append(sp, res, fin);
      for (const ev of ['ringbyspring', 'finals', 'construction', 'elephantrun'] as const) {
        const b = el('button', 'btn small purple', `${EVENT_INFO[ev].icon} ${EVENT_INFO[ev].name}`);
        b.onclick = () => startEvent(s, ev);
        dr.appendChild(b);
      }
      const tk = el('button', 'btn small purple', '🚓 Ticket');
      tk.onclick = () => {
        s.nextTicketCheck = s.clock;
        s.lastRaidClock = -9999;
        this.toast('Campus Safety is on patrol (needs a mostly-full army)...');
      };
      dr.appendChild(tk);
      m.body.appendChild(dr);

      m.body.appendChild(el('div', 'section-title', 'Save data'));
      const r3 = el('div', 'row');
      const exp = el('button', 'btn small blue', '📋 Copy save to clipboard');
      exp.onclick = () => {
        void navigator.clipboard?.writeText(exportSave(s));
        this.toast('Save copied (base64).', 'good');
      };
      const reset = el('button', 'btn small red', '🗑️ Reset save');
      reset.onclick = () => {
        if (confirm('Really reset? Your whole campus will be expelled.')) {
          resetSave();
          this.game.resetting = true;
          location.reload();
        }
      };
      r3.append(exp, reset);
      m.body.appendChild(r3);
      m.body.appendChild(el('div', 'section-title', 'Controls'));
      m.body.appendChild(
        el(
          'div',
          '',
          `Drag or <kbd>WASD</kbd>/arrows to pan · Wheel or <kbd>+</kbd>/<kbd>-</kbd> to zoom · Click a building to select · Drag a selected building to move it · <kbd>Esc</kbd> cancel · <kbd>Del</kbd> remove decor · <kbd>\`</kbd> toggle speed. In raids: pick a card, click/hold on green grass to deploy; <kbd>1</kbd>-<kbd>9</kbd> pick cards; <kbd>Space</kbd> uses the hero ability.`,
        ),
      );
      m.body.appendChild(el('p', 'flavor', 'Cedarville Clash is an unofficial, affectionate fan parody. Not affiliated with or endorsed by any university or game studio. All art is procedurally drawn.'));
    };
    render();
  }

  // ---------- Loading ----------
  showLoading(): Promise<void> {
    const l = el('div');
    l.id = 'loading';
    l.innerHTML = `<h1 class="stroke">CEDARVILLE<span>CLASH</span></h1><div class="lbar"><div></div></div><div class="tip stroke"></div><div class="disclaimer">An unofficial, affectionate parody. Not affiliated with any university or game studio. All art is procedurally generated.</div>`;
    document.body.appendChild(l);
    const bar = l.querySelector('.lbar div') as HTMLElement;
    const tip = l.querySelector('.tip') as HTMLElement;
    tip.textContent = pick(LOADING_TIPS);
    return new Promise((res) => {
      let p = 0;
      const iv = setInterval(() => {
        p += 12 + Math.random() * 18;
        bar.style.width = `${Math.min(100, p)}%`;
        if (p >= 100) {
          clearInterval(iv);
          setTimeout(() => {
            l.style.opacity = '0';
            setTimeout(() => l.remove(), 500);
            res();
          }, 600);
        }
      }, 160);
    });
  }

  /**
   * Persistent bar asking the player to reload.
   * 'update': a new version was deployed. 'stale': a newer version is open in
   * another tab, so this tab has stopped saving to protect that progress.
   */
  showUpdateBar(kind: 'update' | 'stale'): void {
    const existing = document.getElementById('update-bar');
    if (existing) {
      if (existing.dataset.kind === 'stale' || kind === 'update') return; // stale wins
      existing.remove();
    }
    const bar = el('div', `update-bar ${kind}`);
    bar.id = 'update-bar';
    bar.dataset.kind = kind;
    const msg =
      kind === 'update'
        ? '🎉 A new version of Cedarville Clash is out! Reload to get it. Your progress is saved.'
        : '⚠️ A newer version of the game is open in another tab, so this tab has stopped saving to protect that progress. Reload to continue here.';
    bar.appendChild(el('span', 'stroke', msg));
    const reload = el('button', 'btn small gold', 'Reload');
    reload.onclick = () => {
      // Save first if we're allowed to (an 'update' tab still owns the save).
      if (kind === 'update') saveGame(this.state);
      this.game.resetting = true; // skip the beforeunload save; we just saved
      location.reload();
    };
    bar.appendChild(reload);
    if (kind === 'update') {
      const later = el('button', 'btn small gray', 'Later');
      later.onclick = () => bar.remove();
      bar.appendChild(later);
    }
    document.body.appendChild(bar);
  }

  /** Popup with a stern/cute message and an OK button. */
  popup(title: string, text: string, okLabel = 'OK'): void {
    const m = this.modal(title, { narrow: true });
    m.body.appendChild(el('div', '', `<p style="font-size:18px">${text}</p>`));
    const b = el('button', 'btn big', okLabel);
    b.onclick = () => m.close();
    m.body.appendChild(b);
  }
}

export type { BuildingType, TroopType };
