import './style.css';
import { DEBUG_SPEEDS, SCOUT_COST_PER_DMC } from './config/balance';
import { ACHIEVEMENTS, EVENT_INFO } from './config/humor';
import { setMuted, sfx, unlockAudio } from './core/audio';
import { bus } from './core/bus';
import { type Action, type ActionResult, applyAction } from './game/actions';
import { tickArmy } from './game/army';
import { dmcLevel, spend, tickEconomy } from './game/economy';
import { checkChapelSkip, tickEvents } from './game/events';
import { loadGame, saveGame } from './game/save';
import { type GameState, newGame } from './game/state';
import { type StartChoice, chooseStart } from './net/login';
import { OnlineSession, adoptState } from './net/online';
import type { DefenseEntry, Note, StateMsg } from './net/protocol';
import type { RaidKind, RaidSetup } from './raid/engine';
import { applyRaidOutcome, localSetup, type RaidOutcome } from './raid/outcome';
import { RaidScene } from './raid/raidScene';
import { UI, esc, fmt } from './ui/ui';
import { VillageScene, fmtTime } from './village/villageScene';

export interface Scene {
  update(dt: number, realDt: number): void;
  draw(ctx: CanvasRenderingContext2D, dpr: number): void;
  onMouseDown(x: number, y: number, button: number): void;
  onMouseMove(x: number, y: number): void;
  onMouseUp(x: number, y: number, button: number): void;
  onWheel(x: number, y: number, delta: number): void;
  onKey(key: string, down: boolean): void;
  enter(): void;
  exit(): void;
  cam: { width: number; height: number };
}

export class Game {
  canvas = document.getElementById('game') as HTMLCanvasElement;
  ctx = this.canvas.getContext('2d')!;
  dpr = Math.min(2, window.devicePixelRatio || 1);
  state: GameState;
  ui: UI;
  village: VillageScene;
  raid: RaidScene | null = null;
  scene: Scene;
  resetting = false;
  private last = performance.now();
  private saveTimer = 0;
  offlineSeconds = 0;
  fresh = false;
  /** Set when playing online; null for the offline, browser-saved game. */
  online: OnlineSession | null = null;
  private pendingNotes: Note[] = [];
  private pendingDefenses: DefenseEntry[] = [];
  private raidId: string | null = null;
  private pushT = 0;

  constructor(start: StartChoice) {
    if (start.mode === 'online') {
      const me = start.me;
      this.state = newGame();
      adoptState(this.state, me.state);
      this.fresh = !me.state.stats.built && !me.state.stats.raids && (me.state.clock ?? 0) < 120;
      this.online = new OnlineSession(
        me.user,
        me,
        (m, adopt) => this.onServerState(m, adopt),
        (msg) => this.ui.toast(msg, 'bad'),
        () => this.scene !== this.village,
      );
      this.pendingNotes = me.notes;
      this.pendingDefenses = me.defenses;
    } else {
      const loaded = loadGame();
      this.state = loaded.state;
      this.offlineSeconds = loaded.offlineSeconds;
      this.fresh = loaded.fresh;
    }
    setMuted(this.state.settings.muted);
    this.ui = new UI(this);
    this.village = new VillageScene(this);
    this.scene = this.village;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.bindInput();
    // Offline progress: run the simulation forward in one go. (Online, the server does this.)
    if (!this.online && this.offlineSeconds > 1) {
      const dt = this.offlineSeconds;
      tickEconomy(this.state, dt);
      tickArmy(this.state, dt);
    }
    bus.on('achievement', (id: string) => {
      const a = ACHIEVEMENTS.find((x) => x.id === id);
      if (!a) return;
      this.ui.toast(`🏅 Achievement: ${a.name}! +${a.reward} Chapel Credits`, 'good', 3500);
      sfx('star');
    });
    bus.on('ticket', (d: { text: string; fine: number }) => {
      this.ui.toast(`🚓 ${d.text} −${d.fine} Tuition`, 'bad', 4000);
      sfx('whistle');
    });
    bus.on('researchDone', (t: string) => {
      this.ui.toast(`📚 Research complete: ${t} upgraded!`, 'good');
      sfx('complete');
    });
    bus.on('heroDone', () => {
      this.ui.toast('🎓 Hero upgrade complete!', 'good');
      sfx('complete');
    });
    window.addEventListener('beforeunload', () => {
      if (!this.resetting && !this.online) saveGame(this.state);
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden || this.resetting) return;
      if (this.online) void this.online.flush();
      else saveGame(this.state);
    });
    this.village.enter();
    requestAnimationFrame((t) => this.frame(t));
  }

  speed(): number {
    if (this.online) return 1;
    return DEBUG_SPEEDS[this.state.settings.speedIdx] ?? 1;
  }

  /** Performs a player action locally and, online, sends it to the server. */
  act(a: Action): ActionResult {
    const r = applyAction(this.state, a);
    if (!r.err) this.online?.enqueue(a);
    return r;
  }

  /** Saves locally (offline) or pushes pending actions (online). */
  save(): void {
    if (this.online) void this.online.flush();
    else saveGame(this.state);
  }

  private onServerState(m: StateMsg, adopt: boolean): void {
    if (adopt) adoptState(this.state, m.state);
    this.pendingNotes.push(...m.notes);
    this.pendingDefenses.push(...m.defenses);
    if (this.scene === this.village) this.showServerNews();
  }

  /** Toasts and popups for things that happened on the server (events, tickets, raids on us). */
  showServerNews(): void {
    for (const n of this.pendingNotes.splice(0)) {
      if (n.ev === 'ticket') bus.emit('ticket', n.data);
      else if (n.ev === 'eventStart') {
        const info = EVENT_INFO[n.data.type as keyof typeof EVENT_INFO];
        if (info) this.ui.toast(`${info.icon} ${info.name}! ${info.desc}`, 'event', 4000);
      } else if (n.ev === 'chapelSkip') this.ui.popup('A note from the Chapel office', esc(n.data), 'I will do better');
    }
    const ds = this.pendingDefenses.splice(0);
    if (ds.length) {
      const rows = ds
        .map(
          (d) =>
            `<b>${esc(d.attacker)}</b> raided you: ${'★'.repeat(d.stars)}${'☆'.repeat(3 - d.stars)} ${Math.floor(d.destruction * 100)}%, took ${fmt(d.tuition)} Tuition and ${fmt(d.coffee)} Coffee (${d.trophies >= 0 ? '+' : ''}${d.trophies} trophies).`,
        )
        .join('<br>');
      this.ui.popup(ds.length === 1 ? 'Your campus was raided!' : `Your campus was raided ${ds.length} times!`, rows, 'Back to work');
    }
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    for (const s of [this.village, this.raid]) {
      if (!s) continue;
      s.cam.width = w;
      s.cam.height = h;
    }
  }

  private bindInput(): void {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('mousedown', (e) => {
      unlockAudio();
      c.classList.add('dragging');
      this.scene.onMouseDown(e.clientX, e.clientY, e.button);
    });
    window.addEventListener('mousemove', (e) => this.scene.onMouseMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', (e) => {
      c.classList.remove('dragging');
      if (e.target === c || this.scene === this.raid) this.scene.onMouseUp(e.clientX, e.clientY, e.button);
      else this.scene.onMouseUp(-9999, -9999, 99);
    });
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.scene.onWheel(e.clientX, e.clientY, e.deltaY);
      },
      { passive: false },
    );
    window.addEventListener('keydown', (e) => {
      unlockAudio();
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'Escape' && this.ui.isModalOpen()) {
        this.ui.closeModal();
        return;
      }
      if (e.key === '`') {
        this.state.settings.speedIdx = (this.state.settings.speedIdx + 1) % DEBUG_SPEEDS.length;
        this.ui.toast(`Debug speed: ${this.speed()}x`);
        return;
      }
      if (this.ui.isModalOpen()) return;
      this.scene.onKey(e.key, true);
    });
    window.addEventListener('keyup', (e) => this.scene.onKey(e.key, false));
    window.addEventListener('pointerdown', () => unlockAudio(), { once: true });
  }

  async startRaid(opts: { kind: Exclude<RaidKind, 'player'> }): Promise<void> {
    if (this.raid) return;
    let setup: RaidSetup;
    let settle: (engine: import('./raid/engine').RaidEngine) => Promise<RaidOutcome>;
    const online = this.online;
    if (online) {
      let r;
      try {
        this.ui.toast(opts.kind === 'random' ? 'Looking for a rival campus…' : 'Heading out…');
        r = await online.startRaid(opts.kind);
      } catch (e) {
        this.ui.toast((e as Error).message, 'bad');
        sfx('error');
        return;
      }
      setup = r.setup;
      const raidId = r.raidId;
      this.raidId = raidId;
      // the scouting cost is charged by the server; mirror it locally until the next sync
      if (opts.kind === 'random') spend(this.state, 'tuition', SCOUT_COST_PER_DMC * dmcLevel(this.state));
      settle = async (engine) => {
        const res = await online.finishRaid(raidId, engine.inputs);
        this.raidId = null;
        adoptState(this.state, res.state);
        this.pendingNotes.push(...res.notes);
        this.pendingDefenses.push(...res.defenses);
        return res.outcome;
      };
    } else {
      if (opts.kind === 'random' && !spend(this.state, 'tuition', SCOUT_COST_PER_DMC * dmcLevel(this.state))) return;
      setup = localSetup(this.state, opts.kind);
      settle = async (engine) => applyRaidOutcome(this.state, setup, engine.result());
    }
    this.scene.exit();
    this.ui.showVillage(false);
    this.raid = new RaidScene(this, setup, settle);
    this.raid.cam.width = window.innerWidth;
    this.raid.cam.height = window.innerHeight;
    this.scene = this.raid;
    this.raid.enter();
  }

  endRaid(): void {
    if (this.raid) this.raid.exit();
    this.raid = null;
    this.scene = this.village;
    this.ui.showVillage(true);
    this.village.enter();
    this.save();
    this.showServerNews();
  }

  private frame(now: number): void {
    const realDt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const dt = realDt * this.speed();
    const s = this.state;
    s.clock += dt;
    tickEconomy(s, dt);
    tickArmy(s, dt);
    // Online, random events (and tickets) are rolled by the server and arrive with the next sync.
    if (!this.online) tickEvents(s, dt);
    this.scene.update(dt, realDt);
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#3f8a2a';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.scene.draw(ctx, this.dpr);
    if (this.scene === this.village) this.ui.update();
    if (this.online) {
      this.online.tick(realDt);
      this.pushT += realDt;
      if (this.raid && this.raidId && !this.raid.ended && this.pushT > 3) {
        this.pushT = 0;
        this.online.pushInputs(this.raidId, this.raid.engine.inputs);
      }
    } else {
      this.saveTimer += realDt;
      if (this.saveTimer > 5) {
        this.saveTimer = 0;
        saveGame(s);
      }
    }
    requestAnimationFrame((t) => this.frame(t));
  }
}

async function boot(): Promise<void> {
  const start = await chooseStart();
  const game = new Game(start);
  (window as unknown as { game: Game }).game = game;
  await game.ui.showLoading();
  if (game.offlineSeconds > 60) {
    game.ui.toast(`Welcome back! ${fmtTime(game.offlineSeconds)} passed. Your Admissions Office kept recruiting.`, 'good', 4000);
  }
  if (game.fresh) {
    game.ui.popup(
      'Welcome to Cedarville Clash!',
      `You've been appointed Campus Director. Collect <b>Tuition</b> from the Admissions Office and <b>Coffee</b> from the Coffee Cart, build up campus, train students, and raid rival schools!<br><br>Start by tapping the bubbles over your collectors, then visit the <b>Shop</b>. When ready, hit <b>Attack!</b> to raid Rival State U.`,
      "Let's go, Jackets!",
    );
  } else if (!game.online) {
    const msg = checkChapelSkip(game.state);
    if (msg) game.ui.popup('A note from the Chapel office', msg, 'I will do better');
  }
  if (game.online) game.showServerNews();
}

void boot();
