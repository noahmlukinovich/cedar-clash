import './style.css';
import { DEBUG_SPEEDS } from './config/balance';
import { ACHIEVEMENTS } from './config/humor';
import { setMuted, sfx, unlockAudio } from './core/audio';
import { bus } from './core/bus';
import { tickArmy } from './game/army';
import { tickEconomy } from './game/economy';
import { checkChapelSkip, claimAchievementReward, tickEvents } from './game/events';
import { loadGame, saveGame } from './game/save';
import type { GameState } from './game/state';
import { RaidScene, type RaidKind } from './raid/raidScene';
import { UI } from './ui/ui';
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

  constructor() {
    const loaded = loadGame();
    this.state = loaded.state;
    this.offlineSeconds = loaded.offlineSeconds;
    this.fresh = loaded.fresh;
    setMuted(this.state.settings.muted);
    this.ui = new UI(this);
    this.village = new VillageScene(this);
    this.scene = this.village;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.bindInput();
    // Offline progress: run the simulation forward in one go.
    if (this.offlineSeconds > 1) {
      const dt = this.offlineSeconds;
      tickEconomy(this.state, dt);
      tickArmy(this.state, dt);
    }
    bus.on('achievement', (id: string) => {
      const a = ACHIEVEMENTS.find((x) => x.id === id);
      if (!a) return;
      claimAchievementReward(this.state, id);
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
      if (!this.resetting) saveGame(this.state);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && !this.resetting) saveGame(this.state);
    });
    this.village.enter();
    requestAnimationFrame((t) => this.frame(t));
  }

  speed(): number {
    return DEBUG_SPEEDS[this.state.settings.speedIdx] ?? 1;
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

  startRaid(opts: { kind: RaidKind }): void {
    this.scene.exit();
    this.ui.showVillage(false);
    this.raid = new RaidScene(this, opts.kind);
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
    saveGame(this.state);
  }

  private frame(now: number): void {
    const realDt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const dt = realDt * this.speed();
    const s = this.state;
    s.clock += dt;
    tickEconomy(s, dt);
    tickArmy(s, dt);
    tickEvents(s, dt);
    this.scene.update(dt, realDt);
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#2d6a1f';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.scene.draw(ctx, this.dpr);
    if (this.scene === this.village) this.ui.update();
    this.saveTimer += realDt;
    if (this.saveTimer > 5) {
      this.saveTimer = 0;
      saveGame(s);
    }
    requestAnimationFrame((t) => this.frame(t));
  }
}

async function boot(): Promise<void> {
  const game = new Game();
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
  } else {
    const msg = checkChapelSkip(game.state);
    if (msg) game.ui.popup('A note from the Chapel office', msg, 'I will do better');
  }
}

void boot();
