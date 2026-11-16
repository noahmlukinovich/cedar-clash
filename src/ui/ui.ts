// The village HUD, toasts, and the modal shell. Each modal's contents live in ./modals.
import { BUILDINGS } from '../config/buildings';
import { EVENT_INFO, LOADING_TIPS, leagueFor } from '../config/humor';
import type { HeroType, ResourceId } from '../config/types';
import { isMuted, setMuted, sfx } from '../core/audio';
import { type ToastKind, bus } from '../core/bus';
import { pick } from '../core/rng';
import { builders, caps, finishNow, finishNowCost, nextLevelInfo, resName, startUpgrade, upgradeCheck } from '../game/economy';
import { saveGame } from '../game/save';
import type { BuildingInst } from '../game/state';
import type { Game } from '../main';
import { el, fmt, fmtTime } from './dom';
import { ICONS, icon } from './icons';
import { openArmy, openHero, openLibrary } from './modals/army';
import { openAttack } from './modals/attack';
import { openChapel } from './modals/chapel';
import { openAchievements, openLeagues } from './modals/progress';
import { openSettings } from './modals/settings';
import { openInfo, openShop } from './modals/shop';

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
  modalBack: HTMLElement | null = null;
  refreshModal: (() => void) | null = null;
  /** Runs once when the current modal is dismissed, however that happens. */
  onModalClose: (() => void) | null = null;
  private lastSelId = -2;
  private chipSig = '';
  private lastSelSig = '';
  private tick = 0;

  constructor(public game: Game) {
    this.toasts.id = 'toasts';
    document.body.appendChild(this.toasts);
    this.root.appendChild(this.village);
    this.buildVillageHud();
    bus.on('toast', (d) => this.toast(d.text, d.kind));
    bus.on('selection', () => this.renderSelection(true));
    bus.on('mode', () => this.renderSelection(true));
    bus.on('changed', () => this.renderSelection(true));
    bus.on('buildingDone', () => this.renderSelection(true));
  }

  get state() {
    return this.game.state;
  }

  // ---------- Toasts & banners ----------
  toast(text: string, kind: ToastKind = 'info', ms = 2600): void {
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
    if (!this.modalBack) return;
    this.modalBack.remove();
    this.modalBack = null;
    this.refreshModal = null;
    const cb = this.onModalClose;
    this.onModalClose = null;
    cb?.();
  }

  isModalOpen(): boolean {
    return !!this.modalBack;
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

  // ---------- Modals (one module each under ./modals) ----------
  openShop(tab = 'resource'): void {
    openShop(this, tab);
  }
  openInfo(b: BuildingInst): void {
    openInfo(this, b);
  }
  openArmy(): void {
    openArmy(this);
  }
  openLibrary(): void {
    openLibrary(this);
  }
  openHero(h: HeroType): void {
    openHero(this, h);
  }
  openChapel(): void {
    openChapel(this);
  }
  openAchievements(): void {
    openAchievements(this);
  }
  openLeagues(): void {
    openLeagues(this);
  }
  openAttack(): void {
    openAttack(this);
  }
  openSettings(): void {
    openSettings(this);
  }
}
