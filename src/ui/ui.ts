import { BUILDINGS, SHOP_TABS, maxCount, maxLevelForDmc } from '../config/buildings';
import { DEBUG_SPEEDS, SCOUT_COST_PER_DMC } from '../config/balance';
import { CHANGELOG, LATEST_CHANGE } from '../config/changelog';
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
  brewCheck,
  heroAvailable,
  heroUnlocked,
  heroUpgradeCheck,
  libraryLevel,
  queueRuns,
  queueUsed,
  researchCheck,
  spellCapacity,
  spellsUsed,
  trainCheck,
  trainItemLeft,
  trainQueueLeft,
  troopUnlocked,
} from '../game/army';
import {
  buildCheck,
  builders,
  canAfford,
  caps,
  countOf,
  dmcLevel,
  finishNowCost,
  hasEvent,
  nextLevelInfo,
  resName,
  upgradeCheck,
} from '../game/economy';
import { canAttendChapel, chapelReward, startEvent } from '../game/events';
import { exportSave, resetSave, saveGame, staleSave } from '../game/save';
import { setPrefersOffline } from '../net/login';
import type { BuildingInst } from '../game/state';
import { type ExtraRow, type UpgradeRow, listUpgrades } from '../game/upgrades';
import { toWorld } from '../core/iso';
import type { Game } from '../main';
import type { VisitBuilding, VisitResponse } from '../net/protocol';
import { fmtTime } from '../village/villageScene';
import { ICONS, icon } from './icons';
import { buildingThumb, spellThumb, unitThumb } from './thumbs';

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

/** Escapes text for safe use inside innerHTML (player-chosen names come from other people). */
export function esc(t: string): string {
  return t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
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

const SEEN_KEY = 'cedarville-clash-whatsnew';

/** Newest What's New entry this browser has shown (0 if none, or if storage is unavailable). */
function seenChange(): number {
  try {
    return Number(localStorage.getItem(SEEN_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function markChangeSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, String(LATEST_CHANGE));
  } catch {
    /* private mode: the popup may show again next time, which is harmless */
  }
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
  private visitHud: HTMLElement | null = null;
  private visitSel: HTMLElement | null = null;
  modalBack: HTMLElement | null = null;
  refreshModal: (() => void) | null = null;
  private lastSelId = -2;
  private chipSig = '';
  private lastSelSig = '';
  private tick = 0;
  private buildersSig = '';
  /** Set at start-up when this browser hasn't seen the newest What's New entry yet. */
  whatsNewPending = false;

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
    this.buildersEl.title = 'Facilities Crew (builders). Click to list every upgrade you can do.';
    this.buildersEl.setAttribute('role', 'button');
    this.buildersEl.tabIndex = 0;
    const openList = (): void => {
      sfx('click');
      this.openUpgrades();
    };
    this.buildersEl.onclick = openList;
    this.buildersEl.onkeydown = (e) => {
      if (e.key === 'Enter') openList();
    };
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
    // The leaderboard lives on the server, so it only exists when playing online.
    if (this.game.online) mk('trophy', 'Leaderboard', () => void this.openLeaderboard(), 'blue');
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
    // Rewritten only when it changes, so a click on it is never lost to a re-render.
    const ups = listUpgrades(s).count;
    const bsig = `${bl.total - bl.busy}/${bl.total}:${ups}`;
    if (bsig !== this.buildersSig) {
      this.buildersSig = bsig;
      this.buildersEl.innerHTML = `${icon('builder', 30)}<div>${bl.total - bl.busy}/${bl.total}<small>Facilities Crew</small></div>${ups > 0 ? `<span class="up-badge" title="${ups} upgrade${ups === 1 ? '' : 's'} available">${ups}</span>` : ''}`;
    }
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
    // Wait for any other start-up popup (welcome back, raided, chapel) to be closed first.
    if (this.whatsNewPending && !this.isModalOpen()) {
      this.whatsNewPending = false;
      this.openWhatsNew(seenChange());
    }
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
        const err = this.game.act({ k: 'finish', id: b.id }).err;
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
            const e2 = this.game.act({ k: 'upgrade', id: b.id }).err;
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
    if (['reshall', 'biblical', 'callan', 'ens', 'health', 'business', 'music'].includes(b.type)) btn('Train', icon('army', 34), 'blue', () => this.openArmy());
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
    const heroTypes = ['prof', 'president'] as HeroType[];
    let sig = '';
    let ticks: (() => void)[] = [];
    const fail = (err: string): void => {
      this.toast(err, 'bad');
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
      const err = this.game.act({ k: 'train', type: t }).err;
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
      const s = this.state;
      const runs = queueRuns(s);
      const r = runs[runs.length - 1 - runFromEnd];
      if (r && r.type === type) {
        const idx = r.start + r.count - 1;
        const err = this.game.act({ k: 'cancelTrain', idx, back: s.trainQueue.length - 1 - idx, type }).err;
        if (err) fail(err);
        else sfx('click');
      }
      render(true);
    };

    const render = (force = false): void => {
      const s = this.state;
      const cap = armyCapacity(s);
      const used = armyUsed(s);
      const q = queueUsed(s);
      const finals = hasEvent(s, 'finals');
      const runs = queueRuns(s);
      const head = s.trainQueue[0];
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
        runs.map((r) => [r.type, r.count]),
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
      capRow.innerHTML = `<b style="color:#1c3d7a">Residence Halls</b><div class="capbar"><div style="width:${Math.min(100, ((used + q) / Math.max(1, cap)) * 100)}%"></div><span class="stroke">${used} trained + ${q} in training / ${cap}</span></div>`;
      m.body.appendChild(capRow);
      if (finals) m.body.appendChild(el('div', 'flavor', '📚 Finals Week: training is 50% slower. Everyone is "studying."'));

      // queue
      const qTitle = el('div', 'section-title', 'Training queue');
      m.body.appendChild(qTitle);
      if (s.trainQueue.length) {
        const total = el('small');
        qTitle.append(` `, total);
        const upd = (): void => {
          total.textContent = `(${this.state.trainQueue.length} in line · ⏱ ${fmtTime(trainQueueLeft(this.state))} left)`;
        };
        upd();
        ticks.push(upd);
      }
      const qd = el('div', 'queue');
      if (!runs.length) qd.appendChild(el('span', 'flavor', 'Nobody in training. Click a troop below to recruit, or hold to recruit several.'));
      runs.forEach((r, i) => {
        const qi = el('div', 'qitem');
        qi.appendChild(unitThumb(r.type, 62, 62, s.troopLevels[r.type]));
        if (r.count > 1) qi.appendChild(el('div', 'n', `×${r.count}`));
        qi.appendChild(el('div', 'x', '✖'));
        if (i === 0) {
          const pr = el('div', 'prog');
          const tm = el('div', 't');
          qi.append(pr, tm);
          const upd = (): void => {
            const it = this.state.trainQueue[0];
            if (!it) return;
            pr.style.width = `${(1 - it.left / it.total) * 100}%`;
            tm.textContent = (it.chucks ?? 0) > 0 ? '🍽️ line' : fmtTime(trainItemLeft(this.state, it));
          };
          upd();
          ticks.push(upd);
        }
        qi.title = `${TROOPS[r.type].name}${r.count > 1 ? ` ×${r.count}` : ''}: click to cancel one (full refund)`;
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
        const full = unlocked && armyUsed(s) + queueUsed(s) + d.housing > cap;
        const card = el('div', `card ${unlocked ? (err ? 'dim' : '') : 'locked'}`);
        card.dataset.troop = t;
        card.appendChild(unitThumb(t, 100, 90, lvl));
        card.appendChild(el('div', 'name', d.name));
        card.appendChild(el('div', 'badge', `Lv${lvl}`));
        card.appendChild(el('div', 'count', `×${s.army[t] ?? 0}`));
        if (unlocked) {
          card.appendChild(el('div', 'meta', full ? '<b class="bad">🏠 Halls full</b>' : `🏠 ${d.housing} · ⏱ ${fmtTime(d.trainTime * (finals ? 2 : 1))}`));
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
              const cur = this.state.spellQueue[0];
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
            const e2 = this.game.act({ k: 'brew', type: t }).err;
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
            const st = this.state.heroes[h];
            meta.textContent = st.upgrade ? `⬆ Upgrading · ${fmtTime(st.upgrade.end - this.state.clock)}` : heroAvailable(this.state, h) ? '✅ Ready for battle' : `😴 Recovering ${Math.round(st.hpFrac * 100)}%`;
          };
          upd();
          ticks.push(upd);
          card.appendChild(meta);
          card.onpointerdown = press(() => this.openHero(h));
          hg.appendChild(card);
        }
        m.body.appendChild(hg);
      }
      m.body.scrollTop = scroll;
    };
    render(true);
    this.refreshModal = () => render();
  }

  // ---------- Upgrades list ----------
  /** Every upgrade the player can do (or is waiting on), in one place. */
  openUpgrades(): void {
    const m = this.modal('Upgrades', { headIcon: icon('builder', 36) });
    let sig = '';
    let timers: { el: HTMLElement; left: () => number }[] = [];
    const fail = (err: string): void => {
      this.toast(err, 'bad');
      sfx('error');
    };
    const goTo = (id: number): void => {
      const b = this.state.buildings.find((x) => x.id === id);
      if (!b) return;
      this.closeModal();
      const vs = this.game.village;
      vs.select(id);
      const sz = BUILDINGS[b.type].size;
      const w = toWorld(b.x + sz / 2, b.y + sz / 2);
      vs.cam.x = w.x;
      vs.cam.y = w.y;
      vs.cam.clampPos();
    };
    /** A row: [picture + text (optionally clickable)] [right-hand side]. */
    const mkRow = (cls: string, thumb: HTMLElement, title: string, sub: string, go?: () => void): { row: HTMLElement; side: HTMLElement; sub: HTMLElement } => {
      const row = el('div', `up-row ${cls}`);
      const main = el(go ? 'button' : 'div', 'up-main');
      const subEl = el('div', 'up-sub', sub);
      const txt = el('div', 'up-txt');
      txt.append(el('div', 'up-name', title), subEl);
      main.append(thumb, txt);
      if (go) {
        main.title = 'Show on campus';
        main.onclick = go;
      }
      const side = el('div', 'up-side');
      row.append(main, side);
      return { row, side, sub: subEl };
    };
    const time = (t: number): string => (t > 0 ? `⏱ ${fmtTime(t)}` : '⚡ Instant');
    const render = (force = false): void => {
      const s = this.state;
      const l = listUpgrades(s);
      // Rebuild only when something other than a countdown changed; otherwise just tick the timers.
      const nsig = JSON.stringify([l.progress.map((p) => [p.id, p.to, p.finishCost, s.resources.chapel >= p.finishCost]), l.ready, l.waiting, l.extras.map((e) => ({ ...e, left: e.left !== undefined }))]);
      if (!force && nsig === sig) {
        for (const t of timers) t.el.textContent = fmtTime(t.left());
        return;
      }
      sig = nsig;
      timers = [];
      const scroll = m.body.scrollTop;
      m.body.innerHTML = '';
      const bl = builders(s);
      m.body.appendChild(el('div', 'flavor', `Facilities Crew free: ${bl.total - bl.busy}/${bl.total}. Click a name or picture to find it on campus.`));
      const section = (title: string, n: number): HTMLElement => {
        m.body.appendChild(el('div', 'section-title', `${title} <small>(${n})</small>`));
        const list = el('div', 'up-list');
        m.body.appendChild(list);
        return list;
      };

      if (l.progress.length) {
        const list = section('In progress', l.progress.length);
        for (const p of l.progress) {
          const r = mkRow('', buildingThumb(p.type, p.to, 60, 50), esc(p.name), `${p.to <= 1 ? 'Building' : `Lv ${p.to - 1} → ${p.to}`} · ⏱ <span class="up-left"></span>`, () => goTo(p.id));
          const left = r.sub.querySelector('.up-left') as HTMLElement;
          left.textContent = fmtTime(p.left);
          timers.push({ el: left, left: () => Math.max(0, (this.state.buildings.find((b) => b.id === p.id)?.upgrade?.end ?? 0) - this.state.clock) });
          const fin = el('button', 'btn small purple', `Finish ${costHtml('chapel', p.finishCost, canAfford(s, 'chapel', p.finishCost))}`);
          fin.onclick = () => {
            const err = this.game.act({ k: 'finish', id: p.id }).err;
            if (err) fail(err);
            else sfx('click');
            render(true);
          };
          r.side.appendChild(fin);
          list.appendChild(r.row);
        }
      }

      const buildingRow = (u: UpgradeRow, ready: boolean): HTMLElement => {
        const title = u.type === 'wall' ? `Walls ×${u.count}` : esc(u.name);
        const r = mkRow(ready ? '' : 'waiting', buildingThumb(u.type, u.level, 60, 50), title, `Lv ${u.level} → ${u.level + 1} · ${time(u.time)}`, () => goTo(u.id));
        r.side.appendChild(el('div', '', costHtml(u.res, u.cost, canAfford(s, u.res, u.cost))));
        if (ready) {
          const up = el('button', 'btn small gold', 'Upgrade');
          up.onclick = () => {
            const err = this.game.act({ k: 'upgrade', id: u.id }).err;
            if (err) fail(err);
            else {
              sfx('build');
              this.game.village.pop(u.id);
            }
            render(true);
          };
          r.side.appendChild(up);
        } else if (u.reason && canAfford(s, u.res, u.cost)) {
          r.side.appendChild(el('div', 'up-why', u.reason));
        }
        return r.row;
      };
      if (l.ready.length) {
        const list = section('Ready to upgrade', l.ready.length);
        for (const u of l.ready) list.appendChild(buildingRow(u, true));
      }
      if (l.waiting.length) {
        const list = section('Need more resources', l.waiting.length);
        for (const u of l.waiting) list.appendChild(buildingRow(u, false));
      }

      if (l.extras.length) {
        const list = section('Library & heroes', l.extras.length);
        for (const e of l.extras) list.appendChild(extraRow(e));
      }
      if (!l.progress.length && !l.ready.length && !l.waiting.length && !l.extras.length) {
        m.body.appendChild(el('p', 'flavor', 'Nothing left to upgrade at this DMC level. Facilities is, for once, caught up.'));
      }
      m.body.scrollTop = scroll;
    };
    const extraRow = (e: ExtraRow): HTMLElement => {
      const s = this.state;
      const running = e.left !== undefined;
      const what = e.kind === 'research' ? 'Research' : 'Hero';
      const sub = running ? `${what} · Lv ${e.level} → ${e.level + 1} · ⏱ <span class="up-left"></span>` : `${what} · Lv ${e.level} → ${e.level + 1} · ${time(e.time)}`;
      const r = mkRow(running || e.ok ? '' : 'waiting', unitThumb(e.type, 60, 50, e.level), e.name, sub);
      if (running) {
        const left = r.sub.querySelector('.up-left') as HTMLElement;
        left.textContent = fmtTime(e.left!);
        timers.push({
          el: left,
          left: () => {
            const st = this.state;
            const end = e.kind === 'research' ? st.research?.end : st.heroes[e.type as HeroType].upgrade?.end;
            return Math.max(0, (end ?? 0) - st.clock);
          },
        });
        r.side.appendChild(el('div', 'up-why', e.kind === 'research' ? 'Researching…' : 'Upgrading…'));
        return r.row;
      }
      r.side.appendChild(el('div', '', costHtml(e.res, e.cost, canAfford(s, e.res, e.cost))));
      if (e.ok) {
        const b = el('button', `btn small ${e.kind === 'research' ? 'blue' : 'purple'}`, e.kind === 'research' ? 'Research' : 'Upgrade');
        b.onclick = () => {
          const err = e.kind === 'research' ? this.game.act({ k: 'research', type: e.type as TroopType }).err : this.game.act({ k: 'heroUpgrade', type: e.type as HeroType }).err;
          if (err) fail(err);
          else sfx('build');
          render(true);
        };
        r.side.appendChild(b);
      } else if (e.reason && canAfford(s, e.res, e.cost)) {
        r.side.appendChild(el('div', 'up-why', e.reason));
      }
      return r.row;
    };
    render(true);
    this.refreshModal = () => render();
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
          const e2 = this.game.act({ k: 'research', type: t }).err;
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
          const e2 = this.game.act({ k: 'heroUpgrade', type: h }).err;
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
          const got = this.game.act({ k: 'chapel' }).got ?? 0;
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
      const online = this.game.online;
      const news = el('button', 'btn gold', "🎉 What's new");
      news.onclick = () => {
        sfx('click');
        this.openWhatsNew();
      };
      const save = el('button', 'btn', online ? '🔄 Sync now' : '💾 Save now');
      save.onclick = () => {
        this.game.save();
        if (online) this.toast('Synced with the server.', 'good');
        else if (!staleSave) this.toast('Saved!', 'good');
      };
      row1.append(mute, save, news);
      row1.style.flexWrap = 'wrap';
      m.body.appendChild(row1);

      if (online) {
        m.body.appendChild(el('div', 'section-title', 'Account'));
        const shield = online.shieldUntil > Date.now() ? ` · 🛡️ Shield for ${fmtTime((online.shieldUntil - Date.now()) / 1000)}` : '';
        m.body.appendChild(el('div', '', `Playing online as <b>${esc(online.user.name)}</b>${shield}`));
        const r2 = el('div', 'row');
        const out = el('button', 'btn small red', 'Log out');
        out.onclick = async () => {
          await online.flush();
          await online.logout().catch(() => undefined);
          this.game.resetting = true;
          location.reload();
        };
        r2.append(out);
        m.body.appendChild(r2);
        m.body.appendChild(el('p', 'flavor', 'Your campus is saved on the server. Other players can raid it while you are away; a shield protects you for a while after a big raid.'));
        appendControls();
        return;
      }

      if (this.game.serverAvailable) {
        m.body.appendChild(el('div', 'section-title', 'Online play'));
        const go = el('button', 'btn small blue', '🌐 Log in / sign up to play online');
        go.onclick = () => {
          saveGame(s);
          setPrefersOffline(false);
          this.game.resetting = true;
          location.reload();
        };
        m.body.appendChild(go);
        m.body.appendChild(el('p', 'flavor', 'Online campuses are separate from this offline save, and real players can raid them.'));
      }

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
      appendControls();
    };
    const appendControls = (): void => {
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

  async openLeaderboard(): Promise<void> {
    const online = this.game.online;
    if (!online) return;
    let rows;
    try {
      rows = await online.leaderboard();
    } catch (e) {
      this.toast((e as Error).message, 'bad');
      return;
    }
    const m = this.modal('Leaderboard', { narrow: true, headIcon: icon('trophy', 36) });
    const list = el('div', 'league-list');
    rows.forEach((r, i) => {
      const me = r.name === online.user.name;
      const row = el('div', `league-row stroke ${me ? 'me' : ''}`, `<span>${i + 1}. ${esc(r.name)} <small>DMC ${r.dmc}</small></span><span class="lb-side">${icon('trophy', 18)} ${r.trophies}</span>`);
      if (!me) {
        const go = el('button', 'btn small blue', 'Visit');
        go.title = 'Look around this campus';
        go.onclick = () => {
          sfx('click');
          void this.game.startVisit(r.name);
        };
        row.lastElementChild!.appendChild(go);
      }
      list.appendChild(row);
    });
    if (!rows.length) list.appendChild(el('div', 'flavor', 'Nobody here yet.'));
    m.body.appendChild(list);
  }

  // ---------- Visiting another campus ----------
  showVisit(v: VisitResponse): void {
    this.hideVisit();
    const hud = el('div', 'hud');
    const bar = el('div', 'visit-bar');
    bar.appendChild(el('span', 'stroke', `👀 Visiting <b>${esc(v.name)}</b> <small>DMC ${v.dmc} · ${icon('trophy', 16)} ${v.trophies}</small>`));
    const home = el('button', 'btn small gold', '🏠 Go home');
    home.onclick = () => {
      sfx('click');
      this.game.endVisit();
    };
    bar.appendChild(home);
    this.visitSel = el('div', 'sel-panel hidden');
    hud.append(bar, this.visitSel);
    this.root.appendChild(hud);
    this.visitHud = hud;
  }

  /** Name, level and description of the building clicked while visiting (look, don't touch). */
  visitSelect(b: VisitBuilding | null): void {
    const p = this.visitSel;
    if (!p) return;
    p.classList.toggle('hidden', !b);
    if (!b) return;
    const def = BUILDINGS[b.type];
    p.innerHTML = '';
    p.style.animation = 'none';
    void p.offsetWidth;
    p.style.animation = '';
    p.appendChild(el('div', 'sel-title stroke', `${esc(b.name ?? def.name)} <small>${b.level === 0 ? '(under construction)' : 'Level ' + b.level}${b.upgrading && b.level > 0 ? ' · upgrading' : ''}</small>`));
    p.appendChild(el('div', 'visit-desc stroke', def.desc));
  }

  hideVisit(): void {
    this.visitHud?.remove();
    this.visitHud = null;
    this.visitSel = null;
  }

  // ---------- What's new ----------
  /** Called once at start-up: queue the popup if there is something this browser hasn't seen. */
  checkWhatsNew(freshPlayer: boolean): void {
    if (freshPlayer) markChangeSeen(); // a brand-new player has nothing to catch up on
    else if (seenChange() < LATEST_CHANGE) this.whatsNewPending = true;
  }

  /** The update notes. Entries newer than `seen` get a NEW tag; from Settings nothing is tagged. */
  openWhatsNew(seen = LATEST_CHANGE): void {
    const m = this.modal("What's New", { narrow: true, headIcon: '<span style="font-size:30px">🎉</span>' });
    markChangeSeen();
    for (const e of CHANGELOG) {
      const isNew = e.v > seen;
      const box = el('div', `news ${isNew ? 'new' : ''}`);
      box.appendChild(el('div', 'news-head', `<b>${esc(e.title)}</b>${isNew ? '<span class="news-tag">NEW</span>' : ''}<small>${esc(e.date)}</small>`));
      const ul = el('ul');
      for (const it of e.items) ul.appendChild(el('li', '', esc(it)));
      box.appendChild(ul);
      m.body.appendChild(box);
    }
    const ok = el('button', 'btn big', 'Got it');
    ok.style.marginTop = '4px';
    ok.onclick = () => {
      sfx('click');
      m.close();
    };
    m.body.appendChild(ok);
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
    reload.onclick = async () => {
      // Save first if we're allowed to (an 'update' tab still owns the save).
      if (this.game.online) await this.game.online.flush();
      else if (kind === 'update') saveGame(this.state);
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
