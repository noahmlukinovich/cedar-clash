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
  ARMIES,
  armyCapacity,
  armyUsed,
  brewCheck,
  heroAvailable,
  heroUnlocked,
  heroUpgradeCheck,
  libraryLevel,
  isReady,
  queueRuns,
  queueUsed,
  reserveReady,
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
import { defaultName, isComplete, snapshot } from '../game/layouts';
import { canAttendChapel, chapelReward, startEvent } from '../game/events';
import { exportSave, resetSave, saveGame, staleSave } from '../game/save';
import { MAX_NAME_LEN, cleanName, renamePlayer } from '../game/state';
import { setPrefersOffline } from '../net/login';
import type { BuildingInst } from '../game/state';
import { type ExtraRow, type UpgradeRow, listUpgrades } from '../game/upgrades';
import { toWorld } from '../core/iso';
import type { Game } from '../main';
import { NAME_RULES, type VisitBuilding, type VisitResponse, validCampusName } from '../net/protocol';
import { costHtml, el, esc, fmt, fmtTime, textOn } from './dom';
import { openArmy, openHero, openLibrary } from './modals/army';
import { openAttack } from './modals/attack';
import { openChapel } from './modals/chapel';
import { openLayouts } from './modals/layouts';
import { openReplays } from './modals/replays';
import { openAchievements, openLeaderboard, openLeagues } from './modals/progress';
import { openSettings } from './modals/settings';
import { openInfo, openShop } from './modals/shop';
import { openUpgrades } from './modals/upgrades';
import { markChangeSeen, openWhatsNew, seenChange } from './modals/whatsnew';

export { costHtml, el, esc, fmt, fmtTime, textOn };
import { namePlatesOn, setNamePlates } from '../render/world';
import { ICONS, icon } from './icons';
import { buildingThumb, spellThumb, unitThumb } from './thumbs';





const RES_COLORS: Record<ResourceId, string> = {
  tuition: 'linear-gradient(#ffe066,#e3a817)',
  coffee: 'linear-gradient(#b0703f,#6b3f22)',
  chapel: 'linear-gradient(#c49cf5,#7b3fa0)',
};



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
  editorHud = el('div', 'hud hidden');
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
    this.root.appendChild(this.editorHud);
    for (const ev of ['selection', 'mode', 'changed'] as const) bus.on(ev, () => this.renderEditor());
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
      // value and maximum sit together inside the bar, so neither can be clipped by the screen edge
      const nums = el('div', 'nums');
      const val = el('div', 'val stroke', '0');
      const cap = el('div', 'cap', '');
      nums.append(val, cap);
      bar.append(track, ic, nums);
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
    if (this.game.online) {
      const log = mk('', 'Raid log & replays', () => void this.openReplays(), 'blue');
      log.innerHTML = '<span style="font-size:26px">🎬</span>';
    }
    mk('chapel', 'Chapel', () => this.openChapel(), 'purple');
    const lay = mk('', 'Base layouts', () => this.openLayouts(), 'blue');
    lay.innerHTML = '<span style="font-size:26px">🗺️</span>';
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
      e.cap.textContent = `/ ${fmt(cp[r])}`;
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
    openShop(this, tab);
  }

  // ---------- Info ----------
  openInfo(b: BuildingInst): void {
    openInfo(this, b);
  }

  // ---------- Army ----------
  openArmy(): void {
    openArmy(this);
  }

  // ---------- Upgrades list ----------
  /** Every upgrade the player can do (or is waiting on), in one place. */
  openUpgrades(): void {
    openUpgrades(this);
  }

  // ---------- Library ----------
  openLibrary(): void {
    openLibrary(this);
  }

  // ---------- Heroes ----------
  openHero(h: HeroType): void {
    openHero(this, h);
  }

  // ---------- Chapel ----------
  openChapel(): void {
    openChapel(this);
  }

  // ---------- Achievements / leagues ----------
  openAchievements(): void {
    openAchievements(this);
  }

  openLeagues(): void {
    openLeagues(this);
  }

  // ---------- Attack ----------
  openAttack(): void {
    openAttack(this);
  }

  // ---------- Settings / debug ----------
  openSettings(): void {
    openSettings(this);
  }

  // ---------- Base layouts ----------
  openLayouts(): void {
    openLayouts(this);
  }

  showEditor(show: boolean): void {
    this.editorHud.classList.toggle('hidden', !show);
    if (show) this.renderEditor();
  }

  renderEditor(): void {
    const ed = this.game.editor;
    if (!ed || this.game.scene !== ed) return;
    const h = this.editorHud;
    h.innerHTML = '';
    const top = el('div', 'editor-top');
    const title = el('div', 'hint stroke');
    title.textContent = `✏️ Editing: ${ed.slotName}`;
    const mkBtn = (label: string, cls: string, fn: () => void): HTMLButtonElement => {
      const b = el('button', `btn ${cls}`, label);
      b.onclick = () => {
        sfx('click');
        fn();
      };
      return b;
    };
    const removeAll = mkBtn('Remove all', 'small blue', () => ed.removeAll());
    const cancel = mkBtn('✖ Cancel', 'small red', () => {
      if (ed.dirty && !confirm('Discard your changes to this layout?')) return;
      this.game.endEditor(false);
    });
    const save = mkBtn('✔ Save', 'small', () => {
      if (this.game.endEditor(true)) this.toast(`${ed.slotName} saved.`, 'good');
    });
    save.disabled = ed.tray.length > 0;
    if (save.disabled) save.title = 'Place every building from the tray first';
    top.append(title, removeAll, cancel, save);
    h.appendChild(top);

    const bottom = el('div', 'editor-bottom');
    const sel = ed.selected();
    const placing = ed.mode.kind === 'placing' ? ed.mode.type : null;
    let hint = 'Drag a selected building to move it. Wheel to zoom, drag the ground to pan.';
    if (placing) hint = `Placing ${BUILDINGS[placing].name}: click to place. <kbd>Esc</kbd> cancels.`;
    else if (ed.tray.length) hint = 'Pick a building from the tray to place it.';
    const hintRow = el('div', 'editor-hint');
    hintRow.appendChild(el('div', 'hint stroke', hint));
    if (sel && !placing) hintRow.appendChild(mkBtn(`To tray: ${sel.name ?? BUILDINGS[sel.type].name}`, 'small blue', () => ed.removeSelected()));
    if (placing) hintRow.appendChild(mkBtn('✖ Stop', 'small red', () => ed.cancelMode()));
    bottom.appendChild(hintRow);
    if (ed.tray.length) {
      const tray = el('div', 'editor-tray');
      const groups = new Map<BuildingType, BuildingInst[]>();
      for (const b of ed.tray) groups.set(b.type, [...(groups.get(b.type) ?? []), b]);
      for (const [type, list] of groups) {
        const card = el('div', `tray-card ${type === placing ? 'active' : ''}`);
        card.title = BUILDINGS[type].name;
        card.appendChild(buildingThumb(type, Math.max(1, list[0].level), 60, 50));
        card.appendChild(el('div', 'count', `×${list.length}`));
        card.onclick = () => {
          sfx('click');
          ed.startPlacing(type);
        };
        tray.appendChild(card);
      }
      bottom.appendChild(tray);
    }
    h.appendChild(bottom);
  }

  async openLeaderboard(): Promise<void> {
    return openLeaderboard(this);
  }

  /** The raid log: recent raids you made and raids on you, each with a replay. */
  async openReplays(): Promise<void> {
    return openReplays(this);
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
    openWhatsNew(this, seen);
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
