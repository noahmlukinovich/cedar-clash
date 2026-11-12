// Read-only look at another player's campus. Nothing here can change any game state: the
// scene only holds the public layout the server sent (see VisitResponse) and draws it.
import { BUILDINGS } from '../config/buildings';
import { GRID } from '../config/balance';
import { sfx } from '../core/audio';
import { Camera } from '../core/camera';
import { toGrid, toWorld } from '../core/iso';
import { BORDER } from '../game/economy';
import type { Game, Scene } from '../main';
import type { VisitBuilding, VisitResponse } from '../net/protocol';
import { borderTrees, drawBuildingAt, drawGround, drawTree, type TreeSpot } from '../render/world';

export class VisitScene implements Scene {
  cam = new Camera();
  selectedId = -1;
  private trees: TreeSpot[] = borderTrees(BORDER);
  private down: { x: number; y: number; dragged: boolean } | null = null;
  private lastMouse = { x: 0, y: 0 };
  private keys = new Set<string>();
  private time = 0;

  constructor(
    public game: Game,
    public info: VisitResponse,
  ) {
    const c = toWorld(20, 20);
    this.cam.x = c.x;
    this.cam.y = c.y;
    this.cam.zoom = 0.85;
  }

  enter(): void {}
  exit(): void {
    this.keys.clear();
    this.down = null;
  }

  selected(): VisitBuilding | undefined {
    return this.info.buildings.find((b) => b.id === this.selectedId);
  }

  select(id: number): void {
    if (id === this.selectedId) return;
    this.selectedId = id;
    const b = this.selected();
    if (b) sfx('click');
    this.game.ui.visitSelect(b ?? null);
  }

  private pick(sx: number, sy: number): VisitBuilding | undefined {
    const w = this.cam.screenToWorld(sx, sy);
    const g = toGrid(w.x, w.y);
    const tx = Math.floor(g.gx);
    const ty = Math.floor(g.gy);
    const sorted = [...this.info.buildings].sort((a, b) => b.x + b.y + BUILDINGS[b.type].size - (a.x + a.y + BUILDINGS[a.type].size));
    for (const b of sorted) {
      const sz = BUILDINGS[b.type].size;
      if (tx >= b.x && tx < b.x + sz && ty >= b.y && ty < b.y + sz) return b;
    }
    for (const b of sorted) {
      const sz = BUILDINGS[b.type].size;
      if (sz < 2) continue;
      const c = toWorld(b.x + sz / 2, b.y + sz / 2);
      if (Math.abs(w.x - c.x) < sz * 26 && w.y < c.y && w.y > c.y - (30 + sz * 22)) return b;
    }
    return undefined;
  }

  onMouseDown(x: number, y: number): void {
    this.lastMouse = { x, y };
    this.down = { x, y, dragged: false };
  }

  onMouseMove(x: number, y: number): void {
    const dx = x - this.lastMouse.x;
    const dy = y - this.lastMouse.y;
    this.lastMouse = { x, y };
    if (!this.down) return;
    if (!this.down.dragged && Math.hypot(x - this.down.x, y - this.down.y) > 6) this.down.dragged = true;
    if (!this.down.dragged) return;
    this.cam.x -= dx / this.cam.zoom;
    this.cam.y -= dy / this.cam.zoom;
    this.cam.clampPos();
  }

  onMouseUp(x: number, y: number, button: number): void {
    const d = this.down;
    this.down = null;
    if (!d || d.dragged || button !== 0) return;
    this.select(this.pick(x, y)?.id ?? -1);
  }

  onWheel(x: number, y: number, delta: number): void {
    this.cam.zoomAt(x, y, delta > 0 ? 0.9 : 1.1);
  }

  onKey(key: string, down: boolean): void {
    if (down) this.keys.add(key.toLowerCase());
    else this.keys.delete(key.toLowerCase());
    if (!down) return;
    if (key === 'Escape') {
      if (this.selectedId !== -1) this.select(-1);
      else this.game.endVisit();
    }
    if (key === '+' || key === '=') this.cam.zoomAt(this.cam.width / 2, this.cam.height / 2, 1.15);
    if (key === '-') this.cam.zoomAt(this.cam.width / 2, this.cam.height / 2, 0.87);
  }

  update(_dt: number, realDt: number): void {
    this.time += realDt;
    this.cam.update(realDt);
    const pan = (600 * realDt) / this.cam.zoom;
    if (this.keys.has('w') || this.keys.has('arrowup')) this.cam.y -= pan;
    if (this.keys.has('s') || this.keys.has('arrowdown')) this.cam.y += pan;
    if (this.keys.has('a') || this.keys.has('arrowleft')) this.cam.x -= pan;
    if (this.keys.has('d') || this.keys.has('arrowright')) this.cam.x += pan;
    this.cam.clampPos();
  }

  draw(ctx: CanvasRenderingContext2D, dpr: number): void {
    const t = this.time;
    this.cam.apply(ctx, dpr);
    drawGround(ctx, { border: BORDER });
    const list: { depth: number; fn: () => void }[] = [];
    const walls = new Set<number>();
    for (const b of this.info.buildings) if (b.type === 'wall') walls.add(b.y * GRID + b.x);
    for (const b of this.info.buildings) {
      const sz = BUILDINGS[b.type].size;
      let variant = 0;
      if (b.type === 'wall') {
        if (walls.has(b.y * GRID + b.x + 1)) variant |= 1;
        if (walls.has((b.y + 1) * GRID + b.x)) variant |= 2;
      }
      list.push({
        depth: b.x + b.y + sz,
        fn: () =>
          drawBuildingAt(ctx, {
            type: b.type,
            level: b.level,
            x: b.x,
            y: b.y,
            variant,
            t,
            upgrading: b.upgrading ? 0.5 : undefined,
            selected: b.id === this.selectedId,
            aim: Math.sin(t * 0.5 + b.id) * 3,
          }),
      });
    }
    for (const tr of this.trees) {
      const w = toWorld(tr.x, tr.y);
      if (this.cam.visible(w.x, w.y)) list.push({ depth: tr.x + tr.y, fn: () => drawTree(ctx, tr) });
    }
    list.sort((a, b) => a.depth - b.depth);
    for (const d of list) d.fn();
  }
}
