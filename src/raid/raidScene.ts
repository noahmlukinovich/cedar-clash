import { STINGER_TIP_Z } from '../render/buildingSprites';
import { BUILDINGS } from '../config/buildings';
import { GRID } from '../config/balance';
import { EVENT_INFO, LAYOUT_INFO, LOSE_LINES, WIND_LINES, WIN_LINES } from '../config/humor';
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
import { RaidEngine, type RaidInput, type RaidSetup, TICK, q } from './engine';
import { type RaidOutcome, challengeOf } from './outcome';
import { OBJECTIVES } from '../game/daily';
import { type Beam, type Grave, drawRaid } from './raidDraw';
import { LETTER_FLIGHT, playSimEvents } from './raidEffects';
import { RaidHud } from './raidHud';
import { finishReplay, showResults } from './raidResults';
import { type RU, type RaidSim, beamStage } from './sim';

export type { RaidKind } from './engine';


type Card = { kind: 'troop'; type: TroopType } | { kind: 'hero'; type: HeroType } | { kind: 'spell'; type: SpellType };



/** A finished raid to play back: the scene replays `inputs` instead of taking them from the player. */
export interface ReplayData {
  setup: RaidSetup;
  inputs: RaidInput[];
  attacker: string;
  /** The official result, to compare with what the playback shows. */
  stars: number;
  destruction: number;
}

export const REPLAY_SPEEDS = [1, 2, 4];
/** Playback starts this many ticks before the first move, skipping the quiet scouting time. */
const REPLAY_LEAD = 45;

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
  acc = 0;
  trees: TreeSpot[] = borderTrees(0);
  beams: Beam[] = [];
  graves: Grave[] = [];
  /** Hebrew letters in flight from the Bible Prof's crossbow (visual only). */
  letters: { fx: number; fy: number; tx: number; ty: number; ch: string; big: boolean; t: number }[] = [];
  forbidFlash = 0;
  forbidPath: Path2D | null = null;
  hud = new RaidHud(this);
  private down: { x: number; y: number; button: number; deploying: boolean; dragged: boolean } | null = null;
  private last = { x: 0, y: 0 };
  private deployTimer = 0;
  private keys = new Set<string>();
  private windT = 0;
  /** Replay playback state. */
  private ri = 0;
  paused = false;
  speed = 1;
  again = false;
  playBtn: HTMLElement | null = null;

  constructor(
    public game: Game,
    public setup: RaidSetup,
    /** Settles the raid (locally offline, or on the server online) and returns the official outcome. */
    private settle: (engine: RaidEngine) => Promise<RaidOutcome>,
    /** Set when this scene plays back a finished raid; nothing is deployed or settled. */
    public replay: ReplayData | null = null,
  ) {
    this.base = setup.base;
    this.engine = new RaidEngine(setup);
    if (replay) {
      const first = replay.inputs[0]?.t ?? 0;
      while (this.engine.tick < first - REPLAY_LEAD && !this.engine.ended) this.engine.step();
      this.sim.events.length = 0;
    }
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

  count(c: Card): number {
    return c.kind === 'troop' ? (this.engine.troops[c.type] ?? 0) : c.kind === 'spell' ? (this.engine.spells[c.type] ?? 0) : 0;
  }

  deployed(c: Card): RU | null {
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
    this.game.ui.root.appendChild(this.hud.root);
    this.hud.build();
    this.game.ui.banner(this.replay ? `🎬 Replay: ${esc(this.base.name)}` : esc(this.base.name), '#ffe066');
    const c = challengeOf(this.setup);
    if (this.kind === 'elephant') setTimeout(() => this.game.ui.toast(`🐘 ${EVENT_INFO.elephantrun.desc}`, 'event'), 600);
    else if (c && !this.replay) {
      const o = OBJECTIVES[c.objectiveId];
      setTimeout(() => this.game.ui.toast(`🎯 ${o.name}: ${o.desc} This army is lent; yours is not used.`, 'event'), 600);
    } else if (this.base.archetype && !this.setup.defender && !this.replay) {
      const info = LAYOUT_INFO[this.base.archetype];
      setTimeout(() => this.game.ui.toast(`🗺️ ${info.name}: ${info.hint}`, 'info', 4500), 600);
    }
    if (this.sim.opts.ringBySpring) setTimeout(() => this.game.ui.toast('💍 Ring by Spring: troops that pair up get +20% damage & speed!', 'event'), 1200);
    sfx('whistle');
  }

  exit(): void {
    this.hud.root.remove();
  }

  // ---------- HUD ----------


  togglePause(): void {
    if (this.ended) return;
    this.paused = !this.paused;
    if (this.playBtn) this.playBtn.textContent = this.paused ? '▶ Play' : '❚❚ Pause';
  }


  clickCard(i: number): void {
    const c = this.cards[i];
    if (!c) return;
    sfx('click');
    const u = this.deployed(c);
    if (c.kind === 'hero' && u && !u.abilityUsed && !u.dead) {
      this.useAbility(c);
      return;
    }
    this.sel = i;
    this.hud.renderCards();
  }

  useAbility(c: Card & { kind: 'hero' }): void {
    if (this.ended) return;
    this.engine.apply({ t: 0, k: 'ability', type: c.type });
    this.hud.renderCards();
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
      this.hud.renderCards();
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
      this.hud.renderCardCounts();
      return true;
    }
    if (c.kind === 'hero') {
      if (this.deployed(c)) return false;
      if (!this.engine.apply({ t: 0, k: 'hero', type: c.type, x, y })) return false;
      const p = toWorld(x, y);
      this.particles.burst(p.x, p.y, 2, 16, { kind: 'spark', color: C.gold, size: 5, speed: 90, max: 0.7, vz: 120, gravity: 200 });
      this.game.ui.toast(`${HEROES[c.type].name} has entered the raid! Click the card again for ${HEROES[c.type].ability.name}.`, 'good');
      sfx('chime');
      this.hud.renderCards();
      return true;
    }
    return false;
  }


  private nextCard(): void {
    for (let k = 1; k <= this.cards.length; k++) {
      const i = (this.sel + k) % this.cards.length;
      const c = this.cards[i];
      if ((c.kind === 'troop' && this.count(c) > 0) || (c.kind === 'hero' && !this.deployed(c))) {
        this.sel = i;
        this.hud.renderCards();
        return;
      }
    }
  }

  // ---------- Input ----------
  onMouseDown(x: number, y: number, button: number): void {
    this.last = { x, y };
    if (this.ended) return;
    let deploying = false;
    if (button === 0 && !this.replay) {
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
    if (this.replay) {
      if (key === ' ') this.togglePause();
      return;
    }
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
      if (this.replay) {
        if (!this.paused) {
          this.acc = Math.min(this.acc + dt * this.speed, TICK * 10 * this.speed);
          while (this.acc >= TICK && !this.engine.ended) {
            this.acc -= TICK;
            this.replayTick(this.replay.inputs);
          }
        }
      } else {
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
      }
      playSimEvents(this);
      if (this.engine.ended) {
        if (this.replay) finishReplay(this, this.replay);
        else this.finish();
      }
      this.hud.update();
      // hero hp on cards
      if (Math.floor(this.time * 4) !== Math.floor((this.time - dt) * 4)) {
        if (this.cards.some((c) => this.deployed(c))) this.hud.renderCards();
      }
    }
    this.particles.update(dt);
    for (let i = this.beams.length - 1; i >= 0; i--) {
      this.beams[i].t -= dt;
      if (this.beams[i].t <= 0) this.beams.splice(i, 1);
    }
    // stinger statue beams: hum + sparks at the point of impact
    for (const b of this.sim.buildings) {
      if (b.dead || b.type !== 'stinger' || !b.target || b.target.dead || !b.def) continue;
      const stage = beamStage(b.def, b.beamT);
      sfx('zap');
      if (Math.random() < dt * (6 + stage * 8)) {
        const to = toWorld(b.target.x, b.target.y);
        this.particles.burst(to.x, to.y, 12, 1 + stage, { kind: 'spark', color: '#bfe4ff', size: 3 + stage, speed: 70 + stage * 40, max: 0.35, gravity: 250, vz: 90 });
      }
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

  /** One tick of playback: applies the recorded moves for this tick, then steps (same order as `replayRaid`). */
  private replayTick(inputs: RaidInput[]): void {
    const eng = this.engine;
    while (this.ri < inputs.length && inputs[this.ri].t <= eng.tick) {
      const inp = inputs[this.ri++];
      if (inp.t !== eng.tick) continue;
      const r = eng.apply(inp);
      if (!r) continue;
      if (inp.k === 'troop' && r !== true) {
        const p = toWorld(r.x, r.y);
        this.particles.burst(p.x, p.y, 2, 5, { kind: 'puff', color: '#fff', size: 5, speed: 40, max: 0.4, grow: 8 });
        sfx('deploy');
        this.hud.renderCardCounts();
      } else if (inp.k === 'hero') {
        const p = toWorld(inp.x, inp.y);
        this.particles.burst(p.x, p.y, 2, 16, { kind: 'spark', color: C.gold, size: 5, speed: 90, max: 0.7, vz: 120, gravity: 200 });
        sfx('chime');
        this.hud.renderCards();
      } else this.hud.renderCards();
    }
    if (!eng.ended) eng.step();
  }




  // ---------- Results ----------
  finish(): void {
    if (this.ended) return;
    this.ended = true;
    this.hud.els.end.setAttribute('disabled', '');
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
        showResults(this, r);
      },
      (err: unknown) => {
        this.game.ui.popup('Raid not recorded', `The server couldn't settle this raid: ${esc(String((err as Error)?.message ?? err))}. Your army is safe; try again in a moment.`);
        this.game.endRaid();
      },
    );
  }


  // ---------- Draw ----------

  draw(ctx: CanvasRenderingContext2D, dpr: number): void {
    drawRaid(ctx, dpr, this);
  }
}
