import { BUILDINGS } from '../config/buildings';
import { GRID } from '../config/balance';
import { EVENT_INFO, LOSE_LINES, WIN_LINES, WIND_LINES } from '../config/humor';
import { HEROES, TROOPS, TROOP_ORDER } from '../config/troops';
import { SPELLS, SPELL_ORDER } from '../config/spells';
import type { HeroType, SpellType, TroopType } from '../config/types';
import { sfx } from '../core/audio';
import { Camera } from '../core/camera';
import { toGrid, toWorld } from '../core/iso';
import { Particles } from '../core/particles';
import { pick } from '../core/rng';
import type { Game, Scene } from '../main';
import { C, OUT, P, poly } from '../render/draw';
import { drawUnit } from '../render/unitSprites';
import { borderTrees, drawBar, drawBuildingAt, drawGround, drawLabel, drawTree, type TreeSpot } from '../render/world';
import { ICONS, icon } from '../ui/icons';
import { spellThumb, unitThumb } from '../ui/thumbs';
import { el, esc, fmt } from '../ui/ui';
import type { BaseLayout } from './basegen';
import { RaidEngine, type RaidSetup, TICK, q } from './engine';
import type { RaidOutcome } from './outcome';
import type { RU, RaidSim } from './sim';

export type { RaidKind } from './engine';

/** Aleph to tav: the Bible Prof's ammunition, fired in order. */
const HEBREW = 'אבגדהוזחטיכלמנסעפצקרשת';
/** Seconds a letter takes to reach its target. */
const LETTER_FLIGHT = 0.18;

type Card = { kind: 'troop'; type: TroopType } | { kind: 'hero'; type: HeroType } | { kind: 'spell'; type: SpellType };

interface Beam {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  t: number;
  color: string;
}

interface Grave {
  x: number;
  y: number;
  t: number;
}

export class RaidScene implements Scene {
  cam = new Camera();
  particles = new Particles();
  engine: RaidEngine;
  base: BaseLayout;
  cards: Card[] = [];
  sel = 0;
  time = 0;
  /** True once the raid is over (finishing or showing results). */
  ended = false;
  private acc = 0;
  trees: TreeSpot[] = borderTrees(0);
  beams: Beam[] = [];
  graves: Grave[] = [];
  /** Hebrew letters in flight from the Bible Prof's crossbow (visual only). */
  letters: { fx: number; fy: number; tx: number; ty: number; ch: string; big: boolean; t: number }[] = [];
  forbidFlash = 0;
  private forbidPath: Path2D | null = null;
  hud = el('div', 'hud');
  private down: { x: number; y: number; button: number; deploying: boolean; dragged: boolean } | null = null;
  private last = { x: 0, y: 0 };
  private deployTimer = 0;
  private keys = new Set<string>();
  private windT = 0;
  private hudEls: Record<string, HTMLElement> = {};
  private starsShown = 0;

  constructor(
    public game: Game,
    public setup: RaidSetup,
    /** Settles the raid (locally offline, or on the server online) and returns the official outcome. */
    private settle: (engine: RaidEngine) => Promise<RaidOutcome>,
  ) {
    this.base = setup.base;
    this.engine = new RaidEngine(setup);
    const c = toWorld(20, 20);
    this.cam.x = c.x;
    this.cam.y = c.y - 40;
    this.cam.zoom = 0.82;
    this.buildCards();
  }

  get sim(): RaidSim {
    return this.engine.sim;
  }

  get kind() {
    return this.setup.kind;
  }

  private count(c: Card): number {
    return c.kind === 'troop' ? (this.engine.troops[c.type] ?? 0) : c.kind === 'spell' ? (this.engine.spells[c.type] ?? 0) : 0;
  }

  private deployed(c: Card): RU | null {
    return c.kind === 'hero' ? (this.engine.heroUnits[c.type] ?? null) : null;
  }

  private buildCards(): void {
    const e = this.engine;
    this.cards = [];
    for (const t of TROOP_ORDER) if ((e.troops[t] ?? 0) > 0) this.cards.push({ kind: 'troop', type: t });
    for (const h of e.availableHeroes()) this.cards.push({ kind: 'hero', type: h });
    for (const sp of SPELL_ORDER) if ((e.spells[sp] ?? 0) > 0) this.cards.push({ kind: 'spell', type: sp });
  }

  // ---------- Scene lifecycle ----------
  enter(): void {
    this.game.ui.root.appendChild(this.hud);
    this.buildHud();
    this.game.ui.banner(esc(this.base.name), '#ffe066');
    if (this.kind === 'elephant') setTimeout(() => this.game.ui.toast(`🐘 ${EVENT_INFO.elephantrun.desc}`, 'event'), 600);
    if (this.sim.opts.ringBySpring) setTimeout(() => this.game.ui.toast('💍 Ring by Spring: troops that pair up get +20% damage & speed!', 'event'), 1200);
    sfx('whistle');
  }

  exit(): void {
    this.hud.remove();
  }

  // ---------- HUD ----------
  private buildHud(): void {
    const h = this.hud;
    h.innerHTML = '';
    const top = el('div', 'raid-top stroke');
    const who = this.setup.defender ? `🏆 ${this.setup.defender.trophies} · a real campus!` : esc(this.base.tagline);
    top.innerHTML = `<div class="enemy">${esc(this.base.name)}</div><div class="tag">DMC ${this.base.dmc} · ${who}</div><div class="loot"><span>Available:</span><span class="lt">${icon('tuition', 22)} <b></b></span><span class="lc">${icon('coffee', 22)} <b></b></span></div><div class="loot"><span>Looted:</span><span class="gt">${icon('tuition', 22)} <b>0</b></span><span class="gc">${icon('coffee', 22)} <b>0</b></span></div>`;
    h.appendChild(top);
    const timer = el('div', 'raid-timer stroke', `<div class="lbl">Scouting…</div><div class="t">3:00</div>`);
    h.appendChild(timer);
    const stars = el('div', 'raid-stars stroke', `<div class="stars">${icon('starEmpty', 34).repeat(3)}</div><div class="pct">0%</div><div style="font-size:12px">destruction</div>`);
    h.appendChild(stars);
    const end = el('button', 'btn red raid-end', 'End Raid');
    end.onclick = () => {
      sfx('click');
      if (this.ended) return;
      this.engine.apply({ t: 0, k: 'end' });
      this.finish();
    };
    h.appendChild(end);
    const hint = el('div', 'hint stroke raid-hint', 'Pick a card, then click (or hold) on open grass outside the white zone to deploy.');
    h.appendChild(hint);
    setTimeout(() => hint.remove(), 6000);
    const bar = el('div', 'deploy-bar');
    h.appendChild(bar);
    this.hudEls = {
      timer,
      timerT: timer.querySelector('.t') as HTMLElement,
      timerL: timer.querySelector('.lbl') as HTMLElement,
      stars: stars.querySelector('.stars') as HTMLElement,
      pct: stars.querySelector('.pct') as HTMLElement,
      lt: top.querySelector('.lt b') as HTMLElement,
      lc: top.querySelector('.lc b') as HTMLElement,
      gt: top.querySelector('.gt b') as HTMLElement,
      gc: top.querySelector('.gc b') as HTMLElement,
      bar,
      end,
    };
    this.renderCards();
  }

  private renderCards(): void {
    const bar = this.hudEls.bar;
    bar.innerHTML = '';
    this.cards.forEach((c, i) => {
      const d = el('div', `dcard ${i === this.sel ? 'sel' : ''}`);
      const n = this.count(c);
      if (c.kind === 'troop') {
        d.appendChild(unitThumb(c.type, 72, 66, this.engine.setup.troopLevels[c.type] ?? 1));
        d.appendChild(el('div', 'n', `×${n}`));
        d.appendChild(el('div', 'nm', TROOPS[c.type].short ?? TROOPS[c.type].name.split(' ')[0]));
        if (n <= 0) d.classList.add('empty');
      } else if (c.kind === 'hero') {
        d.classList.add('hero');
        d.appendChild(unitThumb(c.type, 72, 66, this.engine.setup.heroLevels[c.type] ?? 1));
        d.appendChild(el('div', 'nm', HEROES[c.type].name.replace('The ', '')));
        const u = this.deployed(c);
        if (u) {
          const hp = el('div', 'hpbar', `<div style="width:${Math.max(0, (u.hp / u.maxHp) * 100)}%"></div>`);
          d.appendChild(hp);
          if (!u.abilityUsed && !u.dead) d.appendChild(el('div', 'ability', HEROES[c.type].ability.name));
          else d.classList.add('empty');
        }
      } else {
        d.classList.add('spell');
        d.appendChild(spellThumb(c.type, 72, 66));
        d.appendChild(el('div', 'n', `×${n}`));
        d.appendChild(el('div', 'nm', SPELLS[c.type].name));
        if (n <= 0) d.classList.add('empty');
      }
      d.title = c.kind === 'troop' ? TROOPS[c.type].desc : c.kind === 'hero' ? `${HEROES[c.type].desc}` : SPELLS[c.type].desc;
      d.onclick = () => this.clickCard(i);
      bar.appendChild(d);
    });
    if (!this.cards.length) bar.appendChild(el('div', 'hint stroke', 'No troops! (End the raid and train some.)'));
  }

  private clickCard(i: number): void {
    const c = this.cards[i];
    if (!c) return;
    sfx('click');
    const u = this.deployed(c);
    if (c.kind === 'hero' && u && !u.abilityUsed && !u.dead) {
      this.useAbility(c);
      return;
    }
    this.sel = i;
    this.renderCards();
  }

  private useAbility(c: Card & { kind: 'hero' }): void {
    if (this.ended) return;
    this.engine.apply({ t: 0, k: 'ability', type: c.type });
    this.renderCards();
  }

  private updateHud(): void {
    const e = this.hudEls;
    const eng = this.engine;
    const t = Math.max(0, eng.started ? eng.timeLeft : eng.scoutLeft);
    e.timerT.textContent = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    e.timerL.textContent = eng.started ? 'Raid ends in' : 'Scouting… (deploy to start)';
    e.pct.textContent = `${Math.floor(this.sim.destruction * 100)}%`;
    e.lt.textContent = fmt(this.sim.lootAvail.tuition - this.sim.loot.tuition);
    e.lc.textContent = fmt(this.sim.lootAvail.coffee - this.sim.loot.coffee);
    e.gt.textContent = fmt(this.sim.loot.tuition);
    e.gc.textContent = fmt(this.sim.loot.coffee);
    if (this.sim.stars !== this.starsShown) {
      this.starsShown = this.sim.stars;
      e.stars.innerHTML = '';
      for (let i = 0; i < 3; i++) {
        const s = el('span', `ic ${i === this.sim.stars - 1 ? 'pop' : ''}`, i < this.sim.stars ? ICONS.star : ICONS.starEmpty);
        s.style.width = s.style.height = '34px';
        e.stars.appendChild(s);
      }
    }
  }

  // ---------- Deployment ----------
  private deployAt(sx: number, sy: number): boolean {
    const c = this.cards[this.sel];
    if (!c || this.ended) return false;
    const w = this.cam.screenToWorld(sx, sy);
    const g = toGrid(w.x, w.y);
    const x = q(g.gx);
    const y = q(g.gy);
    if (x < 0 || y < 0 || x >= GRID || y >= GRID) return false;
    if (c.kind === 'spell') {
      if (!this.engine.apply({ t: 0, k: 'spell', type: c.type, x, y })) return false;
      this.renderCards();
      return true;
    }
    if (!this.sim.canDeploy(x, y)) {
      this.forbidFlash = 1;
      return false;
    }
    if (c.kind === 'troop') {
      if (this.count(c) <= 0) {
        this.nextCard();
        return false;
      }
      const u = this.engine.apply({ t: 0, k: 'troop', type: c.type, x, y });
      if (!u || u === true) return false;
      const p = toWorld(u.x, u.y);
      this.particles.burst(p.x, p.y, 2, 5, { kind: 'puff', color: '#fff', size: 5, speed: 40, max: 0.4, grow: 8 });
      sfx('deploy');
      if (this.count(c) <= 0) this.nextCard();
      this.renderCardCounts();
      return true;
    }
    if (c.kind === 'hero') {
      if (this.deployed(c)) return false;
      if (!this.engine.apply({ t: 0, k: 'hero', type: c.type, x, y })) return false;
      const p = toWorld(x, y);
      this.particles.burst(p.x, p.y, 2, 16, { kind: 'spark', color: C.gold, size: 5, speed: 90, max: 0.7, vz: 120, gravity: 200 });
      this.game.ui.toast(`${HEROES[c.type].name} has entered the raid! Click the card again for ${HEROES[c.type].ability.name}.`, 'good');
      sfx('chime');
      this.renderCards();
      return true;
    }
    return false;
  }

  private renderCardCounts(): void {
    const bar = this.hudEls.bar;
    this.cards.forEach((c, i) => {
      const d = bar.children[i] as HTMLElement | undefined;
      if (!d) return;
      if (c.kind === 'troop' || c.kind === 'spell') {
        const n = d.querySelector('.n');
        const k = this.count(c);
        if (n) n.textContent = `×${k}`;
        d.classList.toggle('empty', k <= 0);
      }
      d.classList.toggle('sel', i === this.sel);
    });
  }

  private nextCard(): void {
    for (let k = 1; k <= this.cards.length; k++) {
      const i = (this.sel + k) % this.cards.length;
      const c = this.cards[i];
      if ((c.kind === 'troop' && this.count(c) > 0) || (c.kind === 'hero' && !this.deployed(c))) {
        this.sel = i;
        this.renderCards();
        return;
      }
    }
  }

  // ---------- Input ----------
  onMouseDown(x: number, y: number, button: number): void {
    this.last = { x, y };
    if (this.ended) return;
    let deploying = false;
    if (button === 0) {
      deploying = this.deployAt(x, y);
      this.deployTimer = 0.25;
    }
    this.down = { x, y, button, deploying, dragged: false };
  }

  onMouseMove(x: number, y: number): void {
    const dx = x - this.last.x;
    const dy = y - this.last.y;
    this.last = { x, y };
    if (!this.down) return;
    if (Math.hypot(x - this.down.x, y - this.down.y) > 8) this.down.dragged = true;
    if (!this.down.deploying && this.down.dragged) {
      this.cam.x -= dx / this.cam.zoom;
      this.cam.y -= dy / this.cam.zoom;
      this.cam.clampPos();
    }
  }

  onMouseUp(): void {
    this.down = null;
  }

  onWheel(x: number, y: number, d: number): void {
    this.cam.zoomAt(x, y, d > 0 ? 0.9 : 1.1);
  }

  onKey(key: string, down: boolean): void {
    if (down) this.keys.add(key.toLowerCase());
    else this.keys.delete(key.toLowerCase());
    if (!down || this.ended) return;
    const n = parseInt(key, 10);
    if (n >= 1 && n <= 9) this.clickCard(n - 1);
    if (key === ' ') {
      const h = this.cards.find((c) => {
        const u = this.deployed(c);
        return c.kind === 'hero' && u && !u.abilityUsed && !u.dead;
      }) as (Card & { kind: 'hero' }) | undefined;
      if (h) this.useAbility(h);
    }
  }

  // ---------- Update ----------
  update(_dt: number, realDt: number): void {
    const dt = realDt;
    this.time += dt;
    this.cam.update(dt);
    const pan = (600 * dt) / this.cam.zoom;
    if (this.keys.has('w') || this.keys.has('arrowup')) this.cam.y -= pan;
    if (this.keys.has('s') || this.keys.has('arrowdown')) this.cam.y += pan;
    if (this.keys.has('a') || this.keys.has('arrowleft')) this.cam.x -= pan;
    if (this.keys.has('d') || this.keys.has('arrowright')) this.cam.x += pan;
    this.cam.clampPos();
    this.forbidFlash = Math.max(0, this.forbidFlash - dt * 1.5);

    if (!this.ended) {
      // hold-to-deploy
      if (this.down && this.down.deploying && this.down.button === 0) {
        this.deployTimer -= dt;
        if (this.deployTimer <= 0) {
          this.deployTimer = 0.09;
          const c = this.cards[this.sel];
          if (c && c.kind === 'troop') this.deployAt(this.last.x, this.last.y);
        }
      }
      // fixed-step simulation (deterministic, so the server can replay it)
      this.acc = Math.min(this.acc + dt, TICK * 10);
      while (this.acc >= TICK && !this.engine.ended) {
        this.acc -= TICK;
        this.engine.step();
      }
      this.consumeEvents();
      if (this.engine.ended) this.finish();
      this.updateHud();
      // hero hp on cards
      if (Math.floor(this.time * 4) !== Math.floor((this.time - dt) * 4)) {
        if (this.cards.some((c) => this.deployed(c))) this.renderCards();
      }
    }
    this.particles.update(dt);
    for (let i = this.beams.length - 1; i >= 0; i--) {
      this.beams[i].t -= dt;
      if (this.beams[i].t <= 0) this.beams.splice(i, 1);
    }
    for (const g of this.graves) g.t += dt;
    for (let i = this.letters.length - 1; i >= 0; i--) {
      const l = this.letters[i];
      l.t += dt / LETTER_FLIGHT;
      if (l.t < 1) continue;
      this.letters.splice(i, 1);
      const p = toWorld(l.tx, l.ty);
      this.particles.burst(p.x, p.y, 20, l.big ? 12 : 4, { kind: 'spark', color: l.big ? C.gold : '#fff6d6', size: l.big ? 6 : 4, speed: l.big ? 130 : 80, max: l.big ? 0.5 : 0.3 });
      if (l.big) this.particles.add({ kind: 'ring', x: p.x, y: p.y, z: 0, max: 0.35, size: 6, grow: 70, color: 'rgba(245,195,44,0.9)' });
    }
    if (this.graves.length > 80) this.graves.shift();
    // wind streaks
    if (this.sim.windOn) {
      this.windT -= dt;
      if (this.windT <= 0) {
        this.windT = 0.03;
        const w = this.cam.screenToWorld(Math.random() * this.cam.width, Math.random() * this.cam.height);
        this.particles.add({ kind: 'leaf', x: w.x, y: w.y, z: 20, vx: this.sim.windDir * 520, vy: 0, max: 0.8, size: 7, color: Math.random() < 0.5 ? '#e8f4ff' : '#c9a04a', vr: 8 });
      }
    }
  }

  private consumeEvents(): void {
    const P2 = this.particles;
    for (const ev of this.sim.events) {
      switch (ev.e) {
        case 'hit': {
          const p = toWorld(ev.x, ev.y);
          if (ev.kind === 'melee') {
            P2.burst(p.x, p.y, 14, 3, { kind: 'spark', color: '#fff3b0', size: 3, speed: 70, max: 0.25 });
            sfx('hit');
          } else if (ev.kind === 'pen') {
            P2.burst(p.x, p.y, 20, 4, { kind: 'spark', color: C.red, size: 4, speed: 80, max: 0.3 });
            sfx('hit');
          } else if (ev.kind === 'writeup') {
            P2.burst(p.x, p.y, 16, 3, { kind: 'confetti', color: '#fff', size: 6, speed: 60, max: 0.5, gravity: 100 });
          } else if (ev.kind === 'ticket') {
            P2.burst(p.x, p.y, 16, 5, { kind: 'confetti', color: '#ff8fb8', size: 7, speed: 90, max: 0.6, gravity: 150 });
          }
          break;
        }
        case 'death': {
          const p = toWorld(ev.u.x, ev.u.y);
          P2.poof(p.x, p.y, ev.u.hero ? 2 : 1);
          // GO Team members whose trip is over just head home: no gravestone
          if (ev.u.side === 'atk' && !(ev.u.expireAt > 0 && this.sim.time >= ev.u.expireAt)) this.graves.push({ x: ev.u.x, y: ev.u.y, t: 0 });
          if (ev.u.hero) {
            this.game.ui.toast(`${HEROES[ev.u.hero].name} has been knocked out! (They'll recover back home.)`, 'bad');
            this.renderCards();
          }
          sfx('pop');
          break;
        }
        case 'destroyed': {
          const b = ev.b;
          const p = toWorld(b.cx, b.cy);
          if (b.isWall) {
            P2.burst(p.x, p.y, 8, 8, { kind: 'shard', color: '#b5523b', size: 6, speed: 90, max: 0.8, gravity: 400, vz: 150 });
            P2.poof(p.x, p.y, 0.8);
            sfx('hit');
          } else {
            P2.explosion(p.x, p.y, b.size / 2.5);
            this.cam.shake(b.type === 'dmc' ? 14 : 6, b.type === 'dmc' ? 0.6 : 0.3);
            sfx('boom');
            if (b.type === 'dmc') P2.text(p.x, p.y - 60, 40, 'DMC DOWN!', '#ffe066', 28);
            if (b.type === 'safetycart') P2.text(p.x, p.y - 40, 30, 'Ticket voided!', '#ff8fb8', 16);
            if (b.type === 'ratower') P2.text(p.x, p.y - 40, 30, 'Quiet hours over!', '#fff', 16);
          }
          break;
        }
        case 'shoot':
          sfx(ev.kind === 'ticket' ? 'cannon' : 'shoot');
          break;
        case 'freeze': {
          const b = ev.b;
          const p = toWorld(b.cx, b.cy);
          const r = b.def?.range ?? 5;
          P2.add({ kind: 'ring', x: p.x, y: p.y, z: 0, max: 0.6, size: 10, grow: r * 45 * 1.6, color: 'rgba(170,230,255,0.9)' });
          P2.burst(p.x, p.y, 30, 30, { kind: 'shard', color: '#d8f3ff', size: 6, speed: r * 30, max: 1, gravity: 200, vz: 100 });
          P2.text(p.x, p.y - 60, 40, 'FREEZE!', '#bfeaff', 22);
          sfx('freeze');
          break;
        }
        case 'pray': {
          const b = ev.b;
          const from = toWorld(b.cx, b.cy);
          const to = toWorld(ev.x, ev.y);
          const top = 48 + b.level * 6 + 30;
          this.beams.push({ x1: from.x, y1: from.y - top, x2: to.x, y2: to.y, t: 0.35, color: 'rgba(255,236,150,0.9)' });
          P2.add({ kind: 'ring', x: to.x, y: to.y, z: 0, max: 0.5, size: 8, grow: ev.r * 45 * 2, color: 'rgba(255,225,120,0.95)' });
          P2.burst(to.x, to.y, 10, 18, { kind: 'glow', color: 'rgba(255,240,170,0.9)', size: 5, speed: ev.r * 50, max: 0.6, vz: 60 });
          sfx('pray');
          break;
        }
        case 'swarm': {
          const p = toWorld(ev.x, ev.y);
          for (let i = 0; i < 16; i++) {
            P2.add({ kind: 'bee', x: p.x, y: p.y, ox: p.x + (Math.random() - 0.5) * ev.r * 50, oy: p.y + (Math.random() - 0.5) * ev.r * 25, size: 3 + Math.random() * ev.r * 4, max: 5, vr: Math.random() * 3 });
          }
          P2.text(p.x, p.y - 40, 30, 'BZZZT! Yellow Jackets!', C.gold, 18);
          sfx('buzz');
          setTimeout(() => sfx('buzz'), 900);
          break;
        }
        case 'heal': {
          const p = toWorld(ev.u.x, ev.u.y);
          P2.add({ kind: 'text', x: p.x + (Math.random() - 0.5) * 10, y: p.y, z: 30, vz: 30, max: 0.7, text: '+', color: '#5ef08a', size: 14 });
          sfx('heal');
          break;
        }
        case 'loot': {
          const p = toWorld(ev.x, ev.y);
          P2.text(p.x + (Math.random() - 0.5) * 30, p.y, 40, `+${Math.round(ev.amt)}`, ev.res === 'tuition' ? '#ffe066' : '#e0b08a', 14);
          P2.burst(p.x, p.y, 30, 3, { kind: 'spark', color: ev.res === 'tuition' ? C.gold : '#7a4520', size: 5, speed: 60, max: 0.6, gravity: 300, vz: 150 });
          if (Math.random() < 0.5) sfx('coin');
          break;
        }
        case 'star':
          this.game.ui.banner(`★ ${ev.why}`, '#ffe066');
          sfx('star');
          break;
        case 'fans': {
          const p = toWorld(ev.b.cx, ev.b.cy);
          P2.text(p.x, p.y - 70, 40, 'DE-FENSE! DE-FENSE!', C.gold, 18);
          sfx('whistle');
          break;
        }
        case 'bless': {
          const p = toWorld(ev.b.cx, ev.b.cy);
          P2.add({ kind: 'glow', x: p.x + (Math.random() - 0.5) * 16, y: p.y, z: 14, vz: 25, max: 0.8, size: 3, color: 'rgba(255,230,120,0.9)' });
          break;
        }
        case 'wind':
          if (ev.on) {
            this.game.ui.banner(`🌬️ ${pick(WIND_LINES)}`, '#cfe9ff');
            sfx('wind');
            this.cam.shake(4, 0.5);
          }
          break;
        case 'unload': {
          const p = toWorld(ev.x, ev.y);
          P2.burst(p.x, p.y, 10, 14, { kind: 'puff', color: '#fff', size: 7, speed: 80, max: 0.5, grow: 10 });
          P2.text(p.x, p.y - 40, 40, pick(['Everybody out!', 'GO Team, go!', 'We brought snacks!']), '#ffe58a', 16);
          sfx('deploy');
          break;
        }
        case 'bolt':
          this.letters.push({ fx: ev.fx, fy: ev.fy, tx: ev.tx, ty: ev.ty, ch: HEBREW[ev.n % HEBREW.length], big: ev.big, t: 0 });
          sfx(ev.big ? 'cannon' : 'shoot');
          break;
        case 'chorus': {
          const p = toWorld(ev.x, ev.y);
          P2.add({ kind: 'text', x: p.x + (Math.random() - 0.5) * 20, y: p.y, z: 40, vz: 35, max: 0.9, text: '♪♫', color: '#ff9fd0', size: 18 });
          break;
        }
        case 'roomcheck': {
          const p = toWorld(ev.u.x, ev.u.y);
          P2.text(p.x, p.y - 50, 40, 'Room check!', '#cfe9ff', 16);
          break;
        }
        case 'wander': {
          const p = toWorld(ev.u.x, ev.u.y);
          P2.add({ kind: 'text', x: p.x, y: p.y, z: 40, vz: 20, max: 1.2, text: pick(['?', 'where is ENS??', 'is this the DMC?', '?!']), color: '#fff', size: 12 });
          break;
        }
        case 'spell': {
          const p = toWorld(ev.x, ev.y);
          const col = SPELLS[ev.kind].color;
          P2.add({ kind: 'ring', x: p.x, y: p.y, z: 0, max: 0.5, size: 10, grow: ev.r * 45 * 2, color: col });
          P2.burst(p.x, p.y, 40, 20, { kind: 'spark', color: col, size: 5, speed: 100, max: 0.8, gravity: 200, vz: 60 });
          if (ev.kind === 'snowday') {
            for (let i = 0; i < 40; i++)
              P2.add({ kind: 'snow', x: p.x + (Math.random() - 0.5) * ev.r * 90, y: p.y + (Math.random() - 0.5) * ev.r * 45, z: 80 + Math.random() * 60, vz: -40, max: 2.5, size: 2.5, color: '#fff' });
            this.game.ui.banner('❄️ SNOW DAY! Classes (and defenses) cancelled!', '#cfefff');
          }
          if (ev.kind === 'allnighter') this.game.ui.banner('⚡ ALL-NIGHTER!', '#ff9fd0');
          if (ev.kind === 'announcement') this.game.ui.banner('📣 "Just a few quick announcements…"', '#ffe58a');
          sfx('spell');
          break;
        }
        case 'ability': {
          const p = toWorld(ev.u.x, ev.u.y);
          if (ev.kind === 'quiz') {
            this.game.ui.banner('📝 POP QUIZ! Pencils down, defenses!', '#ffffff');
            P2.burst(p.x, p.y, 30, 30, { kind: 'confetti', color: '#fff', size: 8, speed: 220, max: 1.2, gravity: 150, vz: 120 });
            sfx('stun');
          } else {
            this.game.ui.banner('🎓 CONVOCATION! Everybody rise!', C.gold);
            P2.burst(p.x, p.y, 30, 40, { kind: 'confetti', color: C.gold, size: 8, speed: 260, max: 1.4, gravity: 150, vz: 160 });
            P2.burst(p.x, p.y, 30, 30, { kind: 'confetti', color: C.roofBlue, size: 8, speed: 260, max: 1.4, gravity: 150, vz: 160 });
            sfx('win');
          }
          this.cam.shake(6, 0.4);
          break;
        }
      }
    }
    this.sim.events.length = 0;
  }

  // ---------- Results ----------
  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    this.hudEls.end.setAttribute('disabled', '');
    this.settle(this.engine).then(
      (r) => {
        if (r.cancelled) {
          this.game.endRaid();
          return;
        }
        sfx(r.win ? 'win' : 'lose');
        if (r.win) {
          const p = this.cam.screenToWorld(this.cam.width / 2, this.cam.height / 2);
          for (const col of [C.gold, C.roofBlue, '#fff']) this.particles.burst(p.x, p.y, 80, 30, { kind: 'confetti', color: col, size: 8, speed: 300, max: 2, gravity: 120, vz: 200 });
        }
        this.showResults(r);
      },
      (err: unknown) => {
        this.game.ui.popup('Raid not recorded', `The server couldn't settle this raid: ${esc(String((err as Error)?.message ?? err))}. Your army is safe; try again in a moment.`);
        this.game.endRaid();
      },
    );
  }

  private showResults(r: RaidOutcome): void {
    const ui = this.game.ui;
    const m = ui.modal(r.win ? 'Victory!' : 'Defeat', { narrow: true });
    const starsRow = el('div', 'result-stars');
    for (let i = 0; i < 3; i++) {
      const sp = el('span', `ic ${i < r.stars ? 'on' : ''}`, i < r.stars ? ICONS.star : ICONS.starEmpty);
      sp.style.animationDelay = `${0.2 + i * 0.35}s`;
      starsRow.appendChild(sp);
      if (i < r.stars) setTimeout(() => sfx('star'), 200 + i * 350);
    }
    m.body.appendChild(starsRow);
    m.body.appendChild(el('div', 'result-big', `${Math.floor(r.destruction * 100)}% <span style="font-size:18px">destruction</span>`));
    if (r.stars !== this.sim.stars) m.body.appendChild(el('div', 'flavor', 'The official replay on the server scored this raid a little differently from your screen. The server result counts.'));
    m.body.appendChild(el('div', 'result-line flavor', r.win ? pick(WIN_LINES) : pick(LOSE_LINES)));
    const loot = el('div', 'loot-row');
    loot.innerHTML = `<div>${icon('tuition', 34)} +${fmt(r.gotT)}</div><div>${icon('coffee', 34)} +${fmt(r.gotC)}</div><div>${icon('trophy', 34)} ${r.trophyDelta >= 0 ? '+' : ''}${r.trophyDelta}</div>${r.chapel ? `<div>${icon('chapel', 34)} +${r.chapel}</div>` : ''}`;
    m.body.appendChild(loot);
    if (r.gotT < r.tuition || r.gotC < r.coffee) m.body.appendChild(el('div', 'flavor', 'Some loot was left behind: your storages are full! Upgrade the Registrar / Rinnova.'));
    if (this.kind === 'campaign' && r.win) m.body.appendChild(el('div', 'result-line', '🎉 Random rivals unlocked! Use <b>Find a Rival</b> from the Attack menu.'));
    const b = el('button', 'btn big', 'Return to Campus');
    b.style.marginTop = '14px';
    b.style.width = '100%';
    const back = (): void => {
      ui.closeModal();
      this.game.endRaid();
    };
    b.onclick = back;
    m.body.appendChild(b);
    // closing the modal any other way also returns home
    const orig = ui.closeModal.bind(ui);
    ui.closeModal = () => {
      ui.closeModal = orig;
      orig();
      if (this.game.scene === this) this.game.endRaid();
    };
  }

  // ---------- Draw ----------
  draw(ctx: CanvasRenderingContext2D, dpr: number): void {
    const sim = this.sim;
    const t = this.time;
    this.cam.apply(ctx, dpr);
    drawGround(ctx, { border: 0, grid: false, tint: this.kind === 'elephant' ? 'rgba(255,200,120,0.08)' : undefined });

    // deploy zone overlay
    const c = this.cards[this.sel];
    if (!this.ended && c && c.kind !== 'spell') {
      const a = 0.12 + this.forbidFlash * 0.35;
      ctx.save();
      ctx.transform(32, 16, -32, 16, 0, 0);
      ctx.fillStyle = this.forbidFlash > 0 ? `rgba(255,70,70,${a})` : `rgba(255,255,255,${a})`;
      if (!this.forbidPath) {
        this.forbidPath = new Path2D();
        for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) if (sim.forbid[y * GRID + x]) this.forbidPath.rect(x, y, 1, 1);
      }
      ctx.fill(this.forbidPath);
      ctx.restore();
    }

    // zones on ground
    for (const z of sim.zones) {
      const p = toWorld(z.x, z.y);
      const life = (sim.time - z.start) / Math.max(0.01, z.until - z.start);
      let col = 'rgba(255,255,255,0.2)';
      if (z.kind === 'allnighter') col = `rgba(255,79,163,${0.22 + Math.sin(t * 10) * 0.06})`;
      else if (z.kind === 'snowday') col = 'rgba(160,220,255,0.28)';
      else if (z.kind === 'announcement') col = `rgba(255,216,74,${0.2 + Math.sin(t * 6) * 0.05})`;
      else if (z.kind === 'swarm') col = 'rgba(255,200,0,0.12)';
      else if (z.kind === 'quiz') col = `rgba(255,255,255,${0.5 * (1 - life)})`;
      else if (z.kind === 'convo') col = `rgba(245,195,44,${0.4 * (1 - life)})`;
      const rr = z.kind === 'quiz' || z.kind === 'convo' ? z.r * Math.min(1, life * 3) : z.r;
      ctx.fillStyle = col;
      ctx.strokeStyle = col.replace(/[\d.]+\)$/, '0.9)');
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, rr * 45.25, rr * 22.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    const vis = (gx: number, gy: number, m = 150): boolean => {
      const w = toWorld(gx, gy);
      return this.cam.visible(w.x, w.y, m);
    };
    type D = { depth: number; fn: () => void };
    const list: D[] = [];
    const walls = new Set<number>();
    for (const b of sim.buildings) if (b.isWall && !b.dead) walls.add(b.y * GRID + b.x);
    for (const b of sim.buildings) {
      if (b.hidden || !vis(b.cx, b.cy, 220)) continue;
      if (b.dead) {
        if (b.isTrap) continue;
        list.push({ depth: b.x + b.y + b.size - 0.5, fn: () => drawRubble(ctx, b.x, b.y, b.size, b.isWall) });
        continue;
      }
      let variant = 0;
      if (b.isWall) {
        if (walls.has(b.y * GRID + b.x + 1)) variant |= 1;
        if (walls.has((b.y + 1) * GRID + b.x)) variant |= 2;
      }
      const fill = b.type === 'registrar' ? 1 - b.lootTaken.tuition / Math.max(1, b.loot.tuition) : b.type === 'rinnova' ? 1 - b.lootTaken.coffee / Math.max(1, b.loot.coffee) : b.type === 'admissions' || b.type === 'coffeecart' ? 0.5 : undefined;
      list.push({
        depth: b.x + b.y + b.size,
        fn: () => {
          drawBuildingAt(ctx, {
            type: b.type,
            level: b.level,
            x: b.x,
            y: b.y,
            variant,
            t,
            fill,
            aim: b.aim,
            firing: b.firing,
            charge: b.charge,
            praying: b.prayT > 0 ? 1 : 0,
            squash: b.hitT > 0 ? 0.25 : 0,
            frozen: b.frozenUntil > sim.time,
            stunned: b.stunUntil > sim.time,
          });
        },
      });
    }
    for (const tr of this.trees) if (vis(tr.x, tr.y)) list.push({ depth: tr.x + tr.y, fn: () => drawTree(ctx, tr) });
    for (const g of this.graves) {
      list.push({ depth: g.x + g.y - 0.1, fn: () => drawGrave(ctx, g) });
    }
    // elephant run hand-holding lines
    if (this.kind === 'elephant') {
      list.push({
        depth: -1000,
        fn: () => {
          ctx.strokeStyle = C.skin;
          ctx.lineWidth = 3;
          for (const u of sim.units) {
            if (!u.elephant || u.dead || !u.leader || u.leader.dead) continue;
            const a = toWorld(u.x, u.y);
            const b = toWorld(u.leader.x, u.leader.y);
            if (Math.hypot(a.x - b.x, a.y - b.y) > 120) continue;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y - 12);
            ctx.lineTo(b.x, b.y - 12);
            ctx.stroke();
          }
        },
      });
    }
    for (const u of sim.units) {
      if (u.dead || !vis(u.x, u.y, 80)) continue;
      list.push({
        depth: u.x + u.y,
        fn: () => {
          const p = toWorld(u.x, u.y);
          const scale = (u.hero ? 1.35 : u.type === 'fan' ? 0.9 : u.type === 'gomember' ? 0.95 : TROOPS[u.type as TroopType]?.size ?? 1) * 0.9;
          // glow rings for buffs
          if (u.rageUntil > sim.time || u.convoUntil > sim.time) {
            ctx.strokeStyle = u.convoUntil > sim.time ? 'rgba(245,195,44,0.9)' : 'rgba(255,79,163,0.9)';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.ellipse(p.x, p.y, 11 * scale, 5.5 * scale, 0, 0, Math.PI * 2);
            ctx.stroke();
          }
          if (u.type === 'theology') {
            ctx.fillStyle = `rgba(180,120,255,${0.08 + Math.sin(t * 3) * 0.03})`;
            ctx.beginPath();
            ctx.ellipse(p.x, p.y, 3 * 45, 3 * 22.6, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          drawUnit(ctx, p.x, p.y, u.type, {
            t: u.t,
            facing: u.face,
            moving: u.moving,
            attacking: u.attackT,
            scale,
            frozen: u.frozenUntil > sim.time,
            flash: u.flash,
            stunned: u.stunUntil > sim.time,
            level: u.level,
          }, u.side === 'def');
          // level pips under the feet, so a troop's level reads in a crowd (heroes show a label instead)
          if (!u.hero && u.level >= 2) {
            const n = Math.min(5, u.level);
            const gap = 4.2 * scale;
            ctx.lineWidth = 1;
            ctx.strokeStyle = OUT;
            ctx.fillStyle = u.side === 'atk' ? C.gold : '#ff8a7a';
            for (let i = 0; i < n; i++) {
              const px = p.x + (i - (n - 1) / 2) * gap;
              const py = p.y + 6 * scale;
              ctx.beginPath();
              ctx.moveTo(px, py - 2.2 * scale);
              ctx.lineTo(px + 1.9 * scale, py);
              ctx.lineTo(px, py + 2.2 * scale);
              ctx.lineTo(px - 1.9 * scale, py);
              ctx.closePath();
              ctx.fill();
              ctx.stroke();
            }
          }
          if (u.pairedUntil > sim.time && Math.sin(t * 3 + u.uid) > 0.95) {
            this.particles.add({ kind: 'heart', x: p.x, y: p.y, z: 34, vz: 30, max: 0.8, size: 12, color: '#ff6fa8' });
          }
          if (u.hp < u.maxHp) drawBar(ctx, p.x, p.y - 44 * scale, u.hero ? 34 : 22, u.hp / u.maxHp, u.side === 'atk' ? '#5ad05a' : '#ff5a4a');
          if (u.hero) drawLabel(ctx, p.x, p.y - 52 * scale, `Lv${u.level}`, C.gold, 10);
        },
      });
    }
    list.sort((a, b) => a.depth - b.depth);
    for (const d of list) d.fn();

    // projectiles
    for (const pr of sim.projectiles) {
      const p = toWorld(pr.x, pr.y);
      const y = p.y - pr.z;
      ctx.save();
      ctx.translate(p.x, y);
      ctx.rotate(pr.t * 12);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = OUT;
      if (pr.kind === 'writeup') {
        ctx.fillStyle = '#fff';
        ctx.fillRect(-4, -5, 8, 10);
        ctx.strokeRect(-4, -5, 8, 10);
        ctx.fillStyle = '#9aa';
        ctx.fillRect(-2, -2, 4, 1);
        ctx.fillRect(-2, 1, 4, 1);
      } else {
        ctx.fillStyle = '#ffd1e0';
        ctx.fillRect(-6, -3.5, 12, 7);
        ctx.strokeRect(-6, -3.5, 12, 7);
        ctx.fillStyle = C.red;
        ctx.fillRect(-4, -1, 5, 2);
      }
      ctx.restore();
    }
    // Hebrew letters from the Bible Prof's crossbow
    for (const l of this.letters) {
      const k = Math.min(1, l.t);
      const a = toWorld(l.fx, l.fy);
      const b = toWorld(l.tx, l.ty);
      const x = a.x + (b.x - a.x) * k;
      const y = a.y - 26 + (b.y - 14 - (a.y - 26)) * k - Math.sin(k * Math.PI) * 10;
      const size = l.big ? 30 : 18;
      ctx.save();
      ctx.font = `900 ${size}px "Arial Hebrew", "Noto Sans Hebrew", "Segoe UI", Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = l.big ? 5 : 3.5;
      ctx.strokeStyle = OUT;
      ctx.strokeText(l.ch, x, y);
      ctx.fillStyle = l.big ? C.gold : '#fff6d6';
      ctx.fillText(l.ch, x, y);
      ctx.restore();
    }
    // beams
    for (const bm of this.beams) {
      ctx.strokeStyle = bm.color;
      ctx.globalAlpha = Math.min(1, bm.t * 4);
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(bm.x1, bm.y1);
      ctx.lineTo(bm.x2, bm.y2);
      ctx.stroke();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // building hp bars
    for (const b of sim.buildings) {
      if (b.dead || b.hidden || b.hp >= b.maxHp || b.type === 'lake') continue;
      const p = toWorld(b.cx, b.cy);
      drawBar(ctx, p.x, p.y - 30 - b.size * 20, b.isWall ? 24 : 50, b.hp / b.maxHp, '#ff9f2e');
    }
    // sprayer charge rings
    for (const b of sim.buildings) {
      if (b.dead || b.type !== 'sprayer') continue;
      const p = toWorld(b.cx, b.cy);
      if (b.charge > 0.7) {
        ctx.strokeStyle = `rgba(190,240,255,${(b.charge - 0.7) * 2})`;
        ctx.lineWidth = 2;
        const r = (b.def?.range ?? 5) * b.charge;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, r * 45, r * 22.6, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    this.particles.draw(ctx);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.sim.windOn) {
      ctx.fillStyle = 'rgba(220,235,255,0.08)';
      ctx.fillRect(0, 0, this.cam.width, this.cam.height);
    }
    this.particles.drawFlyers(ctx);
  }
}

function drawRubble(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, wall: boolean): void {
  const c = toWorld(x + size / 2, y + size / 2);
  ctx.save();
  ctx.translate(c.x, c.y);
  const s = wall ? 0.35 : size / 2 - 0.3;
  poly(ctx, [P(-s, -s), P(s, -s), P(s, s), P(-s, s)], 'rgba(90,70,55,0.55)', false);
  if (!wall) {
    const n = size * 3;
    for (let i = 0; i < n; i++) {
      const u = (((i * 37) % 17) / 17 - 0.5) * s * 1.6;
      const v = (((i * 53) % 13) / 13 - 0.5) * s * 1.6;
      const [px, py] = P(u, v, 2);
      ctx.fillStyle = i % 3 === 0 ? '#8f897e' : i % 3 === 1 ? '#a34a3a' : '#6e665c';
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(px, py, 5 + (i % 4), 3 + (i % 3), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // smoke wisp
    ctx.fillStyle = 'rgba(80,80,80,0.18)';
    ctx.beginPath();
    ctx.arc(0, -12, 10, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawGrave(ctx: CanvasRenderingContext2D, g: Grave): void {
  const p = toWorld(g.x, g.y);
  const a = Math.max(0, 1 - g.t / 20);
  if (a <= 0) return;
  ctx.globalAlpha = a;
  ctx.fillStyle = '#b8b2a7';
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(p.x - 5, p.y);
  ctx.lineTo(p.x - 5, p.y - 9);
  ctx.arc(p.x, p.y - 9, 5, Math.PI, 0);
  ctx.lineTo(p.x + 5, p.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = OUT;
  ctx.font = 'bold 5px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('RIP', p.x, p.y - 6);
  ctx.globalAlpha = 1;
}
