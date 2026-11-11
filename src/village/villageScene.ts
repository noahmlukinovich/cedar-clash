import { BUILDINGS } from '../config/buildings';
import { GRID } from '../config/balance';
import type { BuildingType } from '../config/types';
import { sfx } from '../core/audio';
import { bus, toast } from '../core/bus';
import { Camera } from '../core/camera';
import { toGrid, toWorld } from '../core/iso';
import { Particles } from '../core/particles';
import {
  BORDER,
  buildNew,
  canPlace,
  caps,
  collect,
  collectorCap,
  occupancy,
} from '../game/economy';
import { constructionTile } from '../game/events';
import type { BuildingInst, GameState } from '../game/state';
import { drawBar, drawBuildingAt, drawConstructionFence, drawGround, drawLabel, drawTree, borderTrees, type TreeSpot } from '../render/world';
import { drawUnit } from '../render/unitSprites';
import { TROOPS } from '../config/troops';
import type { TroopType } from '../config/types';
import type { Scene, Game } from '../main';

type Mode =
  | { kind: 'idle' }
  | { kind: 'placing'; type: BuildingType; gx: number; gy: number }
  | { kind: 'moving'; id: number; gx: number; gy: number; ox: number; oy: number };

interface Wanderer {
  type: TroopType;
  x: number;
  y: number;
  tx: number;
  ty: number;
  wait: number;
  face: number;
  t: number;
}

export class VillageScene implements Scene {
  cam = new Camera();
  particles = new Particles();
  selectedId = -1;
  mode: Mode = { kind: 'idle' };
  anim = new Map<number, number>(); // building id -> squash time remaining
  trees: TreeSpot[] = borderTrees(BORDER);
  wanderers: Wanderer[] = [];
  private down: { x: number; y: number; button: number; onSelected: boolean; dragged: boolean } | null = null;
  private lastMouse = { x: 0, y: 0 };
  private keys = new Set<string>();
  time = 0;

  constructor(public game: Game) {
    const c = toWorld(20, 20);
    this.cam.x = c.x;
    this.cam.y = c.y;
    this.cam.zoom = 0.85;
    bus.on('buildingDone', (b: BuildingInst) => {
      if (this.game.scene !== this) return;
      this.pop(b.id);
      const sz = BUILDINGS[b.type].size;
      const w = toWorld(b.x + sz / 2, b.y + sz / 2);
      this.particles.burst(w.x, w.y, 20, 24, { kind: 'confetti', color: '#f5c32c', speed: 120, max: 1.2, gravity: 200, vz: 160, size: 6 });
      this.particles.burst(w.x, w.y, 20, 18, { kind: 'confetti', color: '#2e63b8', speed: 120, max: 1.2, gravity: 200, vz: 160, size: 6 });
      this.particles.text(w.x, w.y - 40, 30, b.level === 1 ? 'Built!' : `Level ${b.level}!`, '#ffe066', 20);
      sfx('complete');
    });
  }

  get state(): GameState {
    return this.game.state;
  }

  enter(): void {
    this.particles.list.length = 0;
    this.syncWanderers();
  }

  exit(): void {
    this.mode = { kind: 'idle' };
    this.selectedId = -1;
  }

  pop(id: number): void {
    this.anim.set(id, 1);
  }

  selected(): BuildingInst | undefined {
    return this.state.buildings.find((b) => b.id === this.selectedId);
  }

  // ---------- Placement API (called from UI) ----------
  startPlacing(type: BuildingType): void {
    const size = BUILDINGS[type].size;
    // start at screen center, find nearest free spot
    const w = this.cam.screenToWorld(this.cam.width / 2, this.cam.height / 2);
    const g = toGrid(w.x, w.y);
    let gx = Math.round(g.gx - size / 2);
    let gy = Math.round(g.gy - size / 2);
    const spot = this.findFree(type, gx, gy);
    if (spot) {
      gx = spot.x;
      gy = spot.y;
    }
    this.mode = { kind: 'placing', type, gx, gy };
    this.selectedId = -1;
    bus.emit('selection', null);
    bus.emit('mode', this.mode.kind);
  }

  cancelMode(): void {
    if (this.mode.kind === 'moving') {
      // nothing to revert: building position only changes on success
    }
    this.mode = { kind: 'idle' };
    bus.emit('mode', 'idle');
  }

  findFree(type: BuildingType, gx: number, gy: number): { x: number; y: number } | null {
    const occ = occupancy(this.state);
    for (let r = 0; r < 20; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (canPlace(this.state, type, gx + dx, gy + dy, -1, occ)) return { x: gx + dx, y: gy + dy };
        }
      }
    }
    return null;
  }

  confirmPlace(): void {
    if (this.mode.kind !== 'placing') return;
    const { type, gx, gy } = this.mode;
    const res = buildNew(this.state, type, gx, gy);
    if (typeof res === 'string') {
      toast(res, 'bad');
      sfx('error');
      if (res !== "Can't place there") this.cancelMode();
      return;
    }
    sfx('place');
    sfx('build');
    this.pop(res.id);
    const sz = BUILDINGS[type].size;
    const w = toWorld(gx + sz / 2, gy + sz / 2);
    this.particles.burst(w.x, w.y, 2, 14, { kind: 'puff', color: '#d8c8a8', size: 8, speed: 70, max: 0.6, grow: 10 });
    this.cam.shake(3, 0.15);
    bus.emit('changed');
    if (type === 'wall') {
      // keep placing walls along the drag direction
      const next = this.findFree('wall', gx + 1, gy);
      if (next && Math.abs(next.x - gx) + Math.abs(next.y - gy) <= 2) {
        this.mode = { kind: 'placing', type, gx: next.x, gy: next.y };
      } else this.cancelMode();
      return;
    }
    this.mode = { kind: 'idle' };
    bus.emit('mode', 'idle');
    this.select(res.id);
  }

  select(id: number): void {
    this.selectedId = id;
    const b = this.selected();
    bus.emit('selection', b ?? null);
    if (b) {
      this.pop(b.id);
      sfx('click');
    }
  }

  removeSelected(): void {
    const b = this.selected();
    if (!b || !BUILDINGS[b.type].removable) return;
    this.state.buildings = this.state.buildings.filter((x) => x.id !== b.id);
    const sz = BUILDINGS[b.type].size;
    const w = toWorld(b.x + sz / 2, b.y + sz / 2);
    this.particles.poof(w.x, w.y, 1.5);
    this.select(-1);
    bus.emit('changed');
  }

  doCollect(b: BuildingInst): boolean {
    const got = collect(this.state, b);
    if (got <= 0) return false;
    const isT = b.type === 'admissions';
    const sz = BUILDINGS[b.type].size;
    const w = toWorld(b.x + sz / 2, b.y + sz / 2);
    this.particles.text(w.x, w.y - 50, 30, `+${got}`, isT ? '#ffe066' : '#e0b08a', 22);
    this.particles.burst(w.x, w.y - 30, 20, 12, {
      kind: 'spark',
      color: isT ? '#f5c32c' : '#7a4520',
      speed: 100,
      gravity: 300,
      vz: 180,
      size: 5,
      max: 0.9,
    });
    // fly icons to the HUD
    const scr = this.cam.worldToScreen(w.x, w.y - 40);
    const target = this.game.ui.resourceAnchor(isT ? 'tuition' : 'coffee');
    const n = Math.min(10, 3 + Math.floor(got / 100));
    for (let i = 0; i < n; i++) {
      this.particles.fly({
        x: scr.x + (Math.random() - 0.5) * 30,
        y: scr.y + (Math.random() - 0.5) * 20,
        tx: target.x,
        ty: target.y,
        dur: 0.6 + Math.random() * 0.2,
        delay: i * 0.04,
        color: '',
        icon: isT ? 'tuition' : 'coffee',
        arc: 60 + Math.random() * 40,
        onArrive: i === n - 1 ? () => this.game.ui.bumpResource(isT ? 'tuition' : 'coffee') : undefined,
      });
    }
    sfx(isT ? 'coin' : 'coffee');
    sfx('pop');
    this.pop(b.id);
    bus.emit('changed');
    return true;
  }

  collectAll(): void {
    let any = false;
    for (const b of this.state.buildings) {
      if ((b.type === 'admissions' || b.type === 'coffeecart') && (b.stored ?? 0) >= 1) any = this.doCollect(b) || any;
    }
    if (!any) toast('Nothing to collect yet.');
  }

  // ---------- Picking ----------
  pick(sx: number, sy: number): BuildingInst | undefined {
    const w = this.cam.screenToWorld(sx, sy);
    const g = toGrid(w.x, w.y);
    const tx = Math.floor(g.gx);
    const ty = Math.floor(g.gy);
    // footprint hit first (front-most)
    const sorted = [...this.state.buildings].sort((a, b) => b.x + b.y + BUILDINGS[b.type].size - (a.x + a.y + BUILDINGS[a.type].size));
    for (const b of sorted) {
      const sz = BUILDINGS[b.type].size;
      if (tx >= b.x && tx < b.x + sz && ty >= b.y && ty < b.y + sz) return b;
    }
    // then sprite bounds (tall buildings)
    for (const b of sorted) {
      const sz = BUILDINGS[b.type].size;
      if (sz < 2) continue;
      const c = toWorld(b.x + sz / 2, b.y + sz / 2);
      const hh = 30 + sz * 22;
      if (Math.abs(w.x - c.x) < sz * 26 && w.y < c.y && w.y > c.y - hh) return b;
    }
    return undefined;
  }

  // ---------- Input ----------
  onMouseDown(x: number, y: number, button: number): void {
    this.lastMouse = { x, y };
    const sel = this.selected();
    let onSelected = false;
    if (button === 0 && sel && this.mode.kind === 'idle' && BUILDINGS[sel.type].movable !== false) {
      const p = this.pick(x, y);
      onSelected = p?.id === sel.id;
    }
    this.down = { x, y, button, onSelected, dragged: false };
  }

  onMouseMove(x: number, y: number): void {
    const dx = x - this.lastMouse.x;
    const dy = y - this.lastMouse.y;
    this.lastMouse = { x, y };
    const w = this.cam.screenToWorld(x, y);
    const g = toGrid(w.x, w.y);
    if (this.mode.kind === 'placing') {
      const sz = BUILDINGS[this.mode.type].size;
      this.mode.gx = Math.round(g.gx - sz / 2);
      this.mode.gy = Math.round(g.gy - sz / 2);
    }
    if (!this.down) return;
    if (!this.down.dragged && Math.hypot(x - this.down.x, y - this.down.y) > 6) {
      this.down.dragged = true;
      if (this.down.onSelected) {
        const b = this.selected()!;
        this.mode = { kind: 'moving', id: b.id, gx: b.x, gy: b.y, ox: b.x, oy: b.y };
        bus.emit('mode', 'moving');
      }
    }
    if (!this.down.dragged) return;
    if (this.mode.kind === 'moving') {
      const b = this.selected();
      if (b) {
        const sz = BUILDINGS[b.type].size;
        this.mode.gx = Math.round(g.gx - sz / 2);
        this.mode.gy = Math.round(g.gy - sz / 2);
      }
    } else if (this.mode.kind === 'placing' && this.down.button === 0) {
      // dragging while placing just moves the ghost (already handled)
    } else {
      this.cam.x -= dx / this.cam.zoom;
      this.cam.y -= dy / this.cam.zoom;
      this.cam.clampPos();
    }
  }

  onMouseUp(x: number, y: number, button: number): void {
    const d = this.down;
    this.down = null;
    if (!d) return;
    if (this.mode.kind === 'moving') {
      const m = this.mode;
      const b = this.state.buildings.find((q) => q.id === m.id);
      if (b) {
        if (canPlace(this.state, b.type, m.gx, m.gy, b.id)) {
          if (b.x !== m.gx || b.y !== m.gy) {
            b.x = m.gx;
            b.y = m.gy;
            sfx('place');
            this.pop(b.id);
            const sz = BUILDINGS[b.type].size;
            const w = toWorld(b.x + sz / 2, b.y + sz / 2);
            this.particles.burst(w.x, w.y, 2, 10, { kind: 'puff', color: '#d8c8a8', size: 7, speed: 60, max: 0.5, grow: 10 });
            bus.emit('changed');
            this.syncWanderers();
          }
        } else {
          sfx('error');
        }
      }
      this.mode = { kind: 'idle' };
      bus.emit('mode', 'idle');
      return;
    }
    if (d.dragged || button !== 0) return;
    if (this.mode.kind === 'placing') {
      this.confirmPlace();
      return;
    }
    const b = this.pick(x, y);
    if (!b) {
      if (this.selectedId !== -1) this.select(-1);
      return;
    }
    if ((b.type === 'admissions' || b.type === 'coffeecart') && (b.stored ?? 0) >= 1 && b.level >= 1) {
      if (this.doCollect(b)) {
        this.selectedId = b.id;
        bus.emit('selection', b);
        return;
      }
    }
    this.select(b.id);
  }

  onWheel(x: number, y: number, delta: number): void {
    this.cam.zoomAt(x, y, delta > 0 ? 0.9 : 1.1);
  }

  onKey(key: string, down: boolean): void {
    if (down) this.keys.add(key.toLowerCase());
    else this.keys.delete(key.toLowerCase());
    if (!down) return;
    if (key === 'Escape') {
      if (this.mode.kind !== 'idle') this.cancelMode();
      else this.select(-1);
    }
    if (key === 'Enter' && this.mode.kind === 'placing') this.confirmPlace();
    if ((key === 'Delete' || key === 'Backspace') && this.selected()) this.removeSelected();
    if (key === '+' || key === '=') this.cam.zoomAt(this.cam.width / 2, this.cam.height / 2, 1.15);
    if (key === '-') this.cam.zoomAt(this.cam.width / 2, this.cam.height / 2, 0.87);
  }

  // ---------- Idle troops walking around campus ----------
  syncWanderers(): void {
    const want: TroopType[] = [];
    for (const [t, n] of Object.entries(this.state.army)) for (let i = 0; i < Math.min(n ?? 0, 6); i++) want.push(t as TroopType);
    const halls = this.state.buildings.filter((b) => b.type === 'reshall');
    this.wanderers = want.slice(0, 24).map((type, i) => {
      const h = halls[i % Math.max(1, halls.length)];
      const cx = h ? h.x + 2 : 20;
      const cy = h ? h.y + 5 : 20;
      return { type, x: cx + Math.random() * 2, y: cy + Math.random(), tx: cx, ty: cy, wait: Math.random() * 2, face: 1, t: Math.random() * 5 };
    });
  }

  private updateWanderers(dt: number): void {
    const occ = occupancy(this.state);
    for (const w of this.wanderers) {
      w.t += dt;
      if (w.wait > 0) {
        w.wait -= dt;
        if (w.wait <= 0) {
          for (let k = 0; k < 10; k++) {
            const nx = w.x + (Math.random() - 0.5) * 6;
            const ny = w.y + (Math.random() - 0.5) * 6;
            const ix = Math.floor(nx);
            const iy = Math.floor(ny);
            if (ix > BORDER && iy > BORDER && ix < GRID - BORDER && iy < GRID - BORDER && !occ[iy * GRID + ix]) {
              w.tx = nx;
              w.ty = ny;
              break;
            }
          }
        }
        continue;
      }
      const dx = w.tx - w.x;
      const dy = w.ty - w.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.05) {
        w.wait = 1 + Math.random() * 3;
        continue;
      }
      const sp = TROOPS[w.type].speed * 0.35 * dt;
      w.x += (dx / d) * Math.min(sp, d);
      w.y += (dy / d) * Math.min(sp, d);
      const sxDir = dx - dy;
      if (Math.abs(sxDir) > 0.01) w.face = sxDir > 0 ? 1 : -1;
    }
  }

  update(dt: number, realDt: number): void {
    this.time += realDt;
    this.cam.update(realDt);
    const pan = 600 * realDt / this.cam.zoom;
    if (this.keys.has('w') || this.keys.has('arrowup')) this.cam.y -= pan;
    if (this.keys.has('s') || this.keys.has('arrowdown')) this.cam.y += pan;
    if (this.keys.has('a') || this.keys.has('arrowleft')) this.cam.x -= pan;
    if (this.keys.has('d') || this.keys.has('arrowright')) this.cam.x += pan;
    this.cam.clampPos();
    for (const [id, t] of this.anim) {
      const n = t - realDt * 2.2;
      if (n <= 0) this.anim.delete(id);
      else this.anim.set(id, n);
    }
    this.particles.update(realDt);
    this.updateWanderers(realDt);
    // keep wanderer count roughly in sync with army
    const armyCount = Object.values(this.state.army).reduce((a, n) => a + Math.min(n ?? 0, 6), 0);
    if (Math.min(24, armyCount) !== this.wanderers.length) this.syncWanderers();
  }

  draw(ctx: CanvasRenderingContext2D, dpr: number): void {
    const s = this.state;
    const t = this.time;
    this.cam.apply(ctx, dpr);
    const showGrid = this.mode.kind !== 'idle';
    drawGround(ctx, { grid: showGrid, border: BORDER });
    const ct = constructionTile(s);
    if (ct) drawConstructionFence(ctx, ct.x, ct.y, t);

    // Build drawables
    type D = { depth: number; fn: () => void };
    const list: D[] = [];
    const walls = new Set<number>();
    for (const b of s.buildings) if (b.type === 'wall') walls.add(b.y * GRID + b.x);
    const tuitionCap = caps(s);
    const fillT = s.resources.tuition / Math.max(1, tuitionCap.tuition);
    const fillC = s.resources.coffee / Math.max(1, tuitionCap.coffee);
    const movingId = this.mode.kind === 'moving' ? this.mode.id : -1;

    for (const b of s.buildings) {
      const sz = BUILDINGS[b.type].size;
      let bx = b.x;
      let by = b.y;
      let ghost: 'ok' | 'bad' | undefined;
      if (b.id === movingId && this.mode.kind === 'moving') {
        bx = this.mode.gx;
        by = this.mode.gy;
        ghost = canPlace(s, b.type, bx, by, b.id) ? 'ok' : 'bad';
      }
      let variant = 0;
      if (b.type === 'wall') {
        if (walls.has(by * GRID + bx + 1)) variant |= 1;
        if (walls.has((by + 1) * GRID + bx)) variant |= 2;
      }
      let fill: number | undefined;
      if (b.type === 'admissions' || b.type === 'coffeecart') fill = (b.stored ?? 0) / Math.max(1, collectorCap(b));
      if (b.type === 'registrar') fill = fillT;
      if (b.type === 'rinnova') fill = fillC;
      const squash = this.anim.get(b.id);
      const depth = bx + by + sz + (ghost ? 1000 : 0);
      list.push({
        depth,
        fn: () =>
          drawBuildingAt(ctx, {
            type: b.type,
            level: b.level,
            x: bx,
            y: by,
            variant,
            squash,
            t,
            fill,
            ghost,
            alpha: ghost ? 0.85 : undefined,
            upgrading: b.upgrade ? 1 - (b.upgrade.end - s.clock) / b.upgrade.total : undefined,
            selected: b.id === this.selectedId,
            aim: Math.sin(t * 0.5 + b.id) * 3,
          }),
      });
    }
    for (const tr of this.trees) {
      const w = toWorld(tr.x, tr.y);
      if (this.cam.visible(w.x, w.y)) list.push({ depth: tr.x + tr.y, fn: () => drawTree(ctx, tr) });
    }
    for (const w of this.wanderers) {
      list.push({
        depth: w.x + w.y,
        fn: () => {
          const p = toWorld(w.x, w.y);
          drawUnit(ctx, p.x, p.y, w.type, { t: w.t, facing: w.face, moving: w.wait <= 0, attacking: 0, scale: 0.85 * TROOPS[w.type].size });
        },
      });
    }
    if (this.mode.kind === 'placing') {
      const m = this.mode;
      const ok = canPlace(s, m.type, m.gx, m.gy);
      list.push({
        depth: 10000,
        fn: () =>
          drawBuildingAt(ctx, { type: m.type, level: 1, x: m.gx, y: m.gy, t, ghost: ok ? 'ok' : 'bad', alpha: 0.8, squash: 0 }),
      });
    }
    list.sort((a, b) => a.depth - b.depth);
    for (const d of list) d.fn();

    // overlays: timers, collect bubbles
    for (const b of s.buildings) {
      const sz = BUILDINGS[b.type].size;
      const c = toWorld(b.x + sz / 2, b.y + sz / 2);
      const top = c.y - 40 - sz * 22;
      if (b.upgrade) {
        const left = Math.max(0, b.upgrade.end - s.clock);
        const frac = 1 - left / b.upgrade.total;
        drawBar(ctx, c.x, top, 60, frac, '#5ad05a');
        drawLabel(ctx, c.x, top - 10, fmtTime(left), '#fff', 12);
      } else if ((b.type === 'admissions' || b.type === 'coffeecart') && b.level >= 1) {
        const f = (b.stored ?? 0) / Math.max(1, collectorCap(b));
        if (f > 0.1) {
          const bob = Math.sin(t * 4 + b.id) * 3;
          const bx = c.x;
          const by = top - 4 + bob;
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = '#1e1b2b';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(bx, by, 14, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(bx - 5, by + 12);
          ctx.lineTo(bx, by + 20);
          ctx.lineTo(bx + 5, by + 12);
          ctx.fill();
          ctx.font = '16px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(b.type === 'admissions' ? '🪙' : '☕', bx, by + 1);
          if (f >= 0.999) drawLabel(ctx, bx, by - 22, 'FULL', '#ff6b6b', 10);
        }
      }
    }
    // defense range preview when selected
    const sel = this.selected();
    if (sel && sel.level >= 1) {
      const L = BUILDINGS[sel.type].levels[sel.level - 1];
      const r = L.defense?.range ?? L.trapRadius;
      if (r) {
        const sz = BUILDINGS[sel.type].size;
        const c = toWorld(sel.x + sz / 2, sel.y + sz / 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, r * 45.25, r * 22.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    this.particles.draw(ctx);
    // screen-space flyers
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.particles.drawFlyers(ctx);
  }
}

export function fmtTime(sec: number): string {
  sec = Math.ceil(sec);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
