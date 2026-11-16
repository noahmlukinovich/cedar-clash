// The raid scene: owns the simulation, turns input into deployments, and hands
// off to raidHud (DOM overlay), raidDraw (canvas), raidEffects (particles and
// sound) and raidResults (what the outcome does to the save).
import { ELEPHANT_RUN_TIME, GRID, RAID_TIME } from '../config/balance';
import { EVENT_INFO, LAYOUT_INFO } from '../config/humor';
import { HEROES, TROOP_ORDER } from '../config/troops';
import { SPELL_ORDER } from '../config/spells';
import type { HeroType, SpellType, TroopType } from '../config/types';
import { sfx } from '../core/audio';
import { Camera } from '../core/camera';
import { toGrid, toWorld } from '../core/iso';
import { Particles } from '../core/particles';
import { Rng } from '../core/rng';
import { bump } from '../game/achievements';
import { heroAvailable } from '../game/army';
import { type DailyChallenge, type DailyResult, dailyBase, dailyFor, dailyProgress, dayKey } from '../game/daily';
import { dmcLevel, hasEvent } from '../game/economy';
import type { GameState } from '../game/state';
import type { Game, Scene } from '../main';
import { C } from '../render/draw';
import { type TreeSpot, borderTrees } from '../render/world';
import { type Archetype, type BaseLayout, generateBase, rivalStateU } from './basegen';
import { baseForMatchup, findRival } from './matchmaking';
import { type Beam, type Grave, drawRaid } from './raidDraw';
import { playSimEvents } from './raidEffects';
import { RaidHud } from './raidHud';
import { type RaidKind, dailyResultOf, settleRaid, showResults } from './raidResults';
import { type RU, RaidSim } from './sim';

export type { RaidKind };

export type Card =
  | { kind: 'troop'; type: TroopType; count: number }
  | { kind: 'hero'; type: HeroType; deployed: RU | null; avail: boolean }
  | { kind: 'spell'; type: SpellType; count: number };

const ELEPHANT_FRESHMEN = 30;
/** Layout of the last matched rival, so "Find a Rival" doesn't serve the same shape twice running. */
let lastArchetype: Archetype | undefined;

export class RaidScene implements Scene {
  cam = new Camera();
  particles = new Particles();
  hud = new RaidHud(this);
  sim: RaidSim;
  base: BaseLayout;
  /** Set for the Daily Challenge only. */
  daily: DailyChallenge | null = null;
  /** True if today's challenge was already cleared before this attempt. */
  dailyDone = false;
  /** Elephant Run and the Daily Challenge lend you an army; your own troops and spells are not spent. */
  lent: boolean;
  cards: Card[] = [];
  sel = 0;
  time = 0;
  timeLeft: number;
  started = false;
  scoutLeft = 30;
  ended = false;
  endDelay = -1;
  deployedAny = false;
  trees: TreeSpot[] = borderTrees(0);
  beams: Beam[] = [];
  graves: Grave[] = [];
  forbidFlash = 0;
  forbidPath: Path2D | null = null;
  private down: { x: number; y: number; button: number; deploying: boolean; dragged: boolean } | null = null;
  private last = { x: 0, y: 0 };
  private deployTimer = 0;
  private keys = new Set<string>();
  private windT = 0;
  private lastElephant: RU | null = null;

  constructor(public game: Game, public kind: RaidKind) {
    const s = game.state;
    const dl = dmcLevel(s);
    // The only place real randomness enters a raid: everything after this is derived from the seed.
    const rng = new Rng(((Math.random() * 0x7fffffff) | 0) + 1);
    this.lent = kind === 'elephant' || kind === 'daily';
    let simSeed = rng.int(1, 0x7fffffff);
    let troopLevels = s.troopLevels;

    if (kind === 'campaign') this.base = rivalStateU();
    else if (kind === 'daily') {
      const day = dayKey();
      const c = dailyFor(day, dl);
      this.daily = c;
      this.dailyDone = dailyProgress(s, day).done;
      this.base = dailyBase(c);
      simSeed = c.seed; // same campus, same dice, every attempt
      troopLevels = { freshman: c.troopLevel, engineer: c.troopLevel, nurse: c.troopLevel, theology: c.troopLevel, athlete: c.troopLevel };
    } else if (kind === 'elephant') {
      this.base = generateBase({ dmc: dl, seed: rng.int(1, 0x7fffffff), strength: 0.4 });
      this.base.name = `Elephant Run vs ${this.base.name}`;
      this.base.loot.tuition = Math.round(this.base.loot.tuition * 1.5);
      this.base.loot.coffee = Math.round(this.base.loot.coffee * 1.5);
    } else {
      const m = findRival(s.trophies, dl, rng, lastArchetype);
      lastArchetype = m.archetype;
      this.base = baseForMatchup(m);
    }

    this.sim = new RaidSim(this.base, {
      troopLevels,
      heroLevels: { prof: s.heroes.prof.level, president: s.heroes.president.level },
      ringBySpring: kind !== 'daily' && hasEvent(s, 'ringbyspring'),
      wind: kind !== 'daily' && rng.next() < 0.35,
      elephant: kind === 'elephant',
      seed: simSeed,
    });
    this.timeLeft = kind === 'elephant' ? ELEPHANT_RUN_TIME : RAID_TIME;
    const c = toWorld(20, 20);
    this.cam.x = c.x;
    this.cam.y = c.y - 40;
    this.cam.zoom = 0.82;
    this.buildCards();
  }

  get state(): GameState {
    return this.game.state;
  }

  private buildCards(): void {
    const s = this.state;
    this.cards = [];
    if (this.kind === 'elephant') {
      this.cards.push({ kind: 'troop', type: 'freshman', count: ELEPHANT_FRESHMEN });
      return;
    }
    const army = this.daily ? this.daily.army : s.army;
    const spells = this.daily ? this.daily.spells : s.spells;
    for (const t of TROOP_ORDER) if ((army[t] ?? 0) > 0) this.cards.push({ kind: 'troop', type: t, count: army[t]! });
    if (!this.daily) for (const h of ['prof', 'president'] as HeroType[]) if (heroAvailable(s, h)) this.cards.push({ kind: 'hero', type: h, deployed: null, avail: true });
    for (const sp of SPELL_ORDER) if ((spells[sp] ?? 0) > 0) this.cards.push({ kind: 'spell', type: sp, count: spells[sp]! });
  }

  /** Live standing against the daily objective. */
  dailyResult(): DailyResult {
    return dailyResultOf(this.sim);
  }

  // ---------- Scene lifecycle ----------
  enter(): void {
    const ui = this.game.ui;
    ui.root.appendChild(this.hud.root);
    this.hud.build();
    ui.banner(this.base.name, '#ffe066');
    if (this.kind === 'elephant') setTimeout(() => ui.toast(`🐘 ${EVENT_INFO.elephantrun.desc}`, 'event'), 600);
    else if (this.daily) setTimeout(() => ui.toast(`🎯 ${this.daily!.objective.name}: ${this.daily!.objective.desc} Your own army is not used.`, 'event'), 600);
    else if (this.base.archetype) {
      const info = LAYOUT_INFO[this.base.archetype];
      setTimeout(() => ui.toast(`🗺️ ${info.name}: ${info.hint}`, 'info', 4500), 600);
    }
    if (this.sim.opts.ringBySpring) setTimeout(() => ui.toast('💍 Ring by Spring: troops that pair up get +20% damage & speed!', 'event'), 1200);
    sfx('whistle');
  }

  exit(): void {
    this.hud.root.remove();
  }

  // ---------- Cards ----------
  clickCard(i: number): void {
    const c = this.cards[i];
    if (!c) return;
    sfx('click');
    if (c.kind === 'hero' && c.deployed && !c.deployed.abilityUsed && !c.deployed.dead) {
      this.useAbility(c);
      return;
    }
    this.sel = i;
    this.hud.renderCards();
  }

  private useAbility(c: Card & { kind: 'hero' }): void {
    if (!c.deployed || c.deployed.abilityUsed || c.deployed.dead) return;
    this.sim.useAbility(c.deployed);
    if (c.type === 'prof') bump(this.state, 'popQuizzes');
    this.hud.renderCards();
  }

  private nextCard(): void {
    for (let k = 1; k <= this.cards.length; k++) {
      const i = (this.sel + k) % this.cards.length;
      const c = this.cards[i];
      if ((c.kind === 'troop' && c.count > 0) || (c.kind === 'hero' && !c.deployed)) {
        this.sel = i;
        this.hud.renderCards();
        return;
      }
    }
  }

  // ---------- Deployment ----------
  private deployAt(sx: number, sy: number): boolean {
    const c = this.cards[this.sel];
    if (!c) return false;
    const w = this.cam.screenToWorld(sx, sy);
    const g = toGrid(w.x, w.y);
    if (g.gx < 0 || g.gy < 0 || g.gx >= GRID || g.gy >= GRID) return false;
    const s = this.state;
    if (c.kind === 'spell') {
      if (c.count <= 0) return false;
      this.sim.castSpell(c.type, g.gx, g.gy);
      c.count--;
      if (!this.lent) s.spells[c.type] = Math.max(0, (s.spells[c.type] ?? 0) - 1);
      bump(s, `cast_${c.type}`);
      this.markDeployed();
      this.hud.renderCards();
      return true;
    }
    if (!this.sim.canDeploy(g.gx, g.gy)) {
      this.forbidFlash = 1;
      return false;
    }
    if (c.kind === 'troop') {
      if (c.count <= 0) {
        this.nextCard();
        return false;
      }
      const u = this.sim.spawnTroop(c.type, g.gx + (Math.random() - 0.5) * 0.3, g.gy + (Math.random() - 0.5) * 0.3);
      c.count--;
      if (this.kind === 'elephant') {
        u.elephant = true;
        u.leader = this.lastElephant;
        this.lastElephant = u;
      }
      if (!this.lent) s.army[c.type] = Math.max(0, (s.army[c.type] ?? 0) - 1);
      const p = toWorld(u.x, u.y);
      this.particles.burst(p.x, p.y, 2, 5, { kind: 'puff', color: '#fff', size: 5, speed: 40, max: 0.4, grow: 8 });
      sfx('deploy');
      this.markDeployed();
      if (c.count <= 0) this.nextCard();
      this.hud.renderCardCounts();
      return true;
    }
    if (c.deployed) return false;
    c.deployed = this.sim.spawnHero(c.type, g.gx, g.gy, s.heroes[c.type].hpFrac);
    const p = toWorld(g.gx, g.gy);
    this.particles.burst(p.x, p.y, 2, 16, { kind: 'spark', color: C.gold, size: 5, speed: 90, max: 0.7, vz: 120, gravity: 200 });
    this.game.ui.toast(`${HEROES[c.type].name} has entered the raid! Click the card again for ${HEROES[c.type].ability.name}.`, 'good');
    sfx('chime');
    this.markDeployed();
    this.hud.renderCards();
    return true;
  }

  private markDeployed(): void {
    this.deployedAny = true;
    this.started = true;
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
      const h = this.cards.find((c) => c.kind === 'hero' && c.deployed && !c.deployed.abilityUsed && !c.deployed.dead) as (Card & { kind: 'hero' }) | undefined;
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
      if (this.started) this.timeLeft -= dt;
      else {
        this.scoutLeft -= dt;
        if (this.scoutLeft <= 0) this.started = true;
      }
      // hold-to-deploy
      if (this.down && this.down.deploying && this.down.button === 0) {
        this.deployTimer -= dt;
        if (this.deployTimer <= 0) {
          this.deployTimer = 0.09;
          const c = this.cards[this.sel];
          if (c && c.kind === 'troop') this.deployAt(this.last.x, this.last.y);
        }
      }
      if (this.started) this.sim.advance(dt);
      this.elephantConga(dt);
      playSimEvents(this);
      // end conditions
      const nothingLeft =
        this.cards.every((c) => (c.kind === 'troop' ? c.count <= 0 : c.kind === 'hero' ? !!c.deployed : true)) && this.sim.aliveAttackers() === 0 && this.deployedAny;
      if (this.endDelay < 0 && (this.timeLeft <= 0 || this.sim.fullStar || nothingLeft)) this.endDelay = this.sim.fullStar ? 1.5 : 1.0;
      if (this.endDelay > 0) {
        this.endDelay -= dt;
        if (this.endDelay <= 0) this.finish();
      }
      this.hud.update();
      // hero hp on cards
      if (Math.floor(this.time * 4) !== Math.floor((this.time - dt) * 4)) {
        if (this.cards.some((c) => c.kind === 'hero' && c.deployed)) this.hud.renderCards();
      }
    }
    this.particles.update(dt);
    for (let i = this.beams.length - 1; i >= 0; i--) {
      this.beams[i].t -= dt;
      if (this.beams[i].t <= 0) this.beams.splice(i, 1);
    }
    for (const g of this.graves) g.t += dt;
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

  /** Elephant Run: each freshman follows the one deployed before it, holding hands. */
  private elephantConga(dt: number): void {
    if (this.kind !== 'elephant') return;
    for (const u of this.sim.units) {
      if (!u.elephant || u.dead || !u.leader) continue;
      if (u.leader.dead) {
        u.leader = u.leader.leader ?? null;
        continue;
      }
      const d = Math.hypot(u.leader.x - u.x, u.leader.y - u.y);
      if (d > 1.4 && d < 6) {
        u.x += ((u.leader.x - u.x) / d) * dt * 1.2;
        u.y += ((u.leader.y - u.y) / d) * dt * 1.2;
      }
    }
  }

  // ---------- Ending ----------
  /** The End Raid button: free if nothing was deployed, otherwise the raid is scored as it stands. */
  endEarly(): void {
    if (this.ended) return;
    if (!this.deployedAny) {
      this.ended = true;
      this.game.endRaid();
      return;
    }
    this.finish();
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    const heroes: { type: HeroType; unit: RU }[] = [];
    for (const c of this.cards) if (c.kind === 'hero' && c.deployed) heroes.push({ type: c.type, unit: c.deployed });
    const r = settleRaid(this.state, this.sim, this.base, this.kind, { heroes, daily: this.daily ?? undefined });
    const good = r.daily ? r.daily.passed : r.win;
    sfx(good ? 'win' : 'lose');
    if (good) {
      const p = this.cam.screenToWorld(this.cam.width / 2, this.cam.height / 2);
      for (const col of [C.gold, C.roofBlue, '#fff']) this.particles.burst(p.x, p.y, 80, 30, { kind: 'confetti', color: col, size: 8, speed: 300, max: 2, gravity: 120, vz: 200 });
    }
    showResults(this, r);
  }

  draw(ctx: CanvasRenderingContext2D, dpr: number): void {
    drawRaid(ctx, dpr, this);
  }
}
