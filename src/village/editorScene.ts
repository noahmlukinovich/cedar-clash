import { BUILDINGS } from '../config/buildings';
import type { BuildingType } from '../config/types';
import { sfx } from '../core/audio';
import { bus, toast } from '../core/bus';
import { toWorld } from '../core/iso';
import { canPlace } from '../game/economy';
import { activate, defaultName, relocateFence, resolve, snapshot, syncActive } from '../game/layouts';
import type { BuildingInst, GameState } from '../game/state';
import type { Game } from '../main';
import { VillageScene } from './villageScene';

/**
 * Layout editor: the village scene running on a scratch copy of the campus.
 * Nothing touches the real save until save() is called.
 */
export class EditorScene extends VillageScene {
  slot = 0;
  /** Buildings picked up and not yet placed. */
  tray: BuildingInst[] = [];
  dirty = false;
  private shadow: GameState;

  constructor(game: Game) {
    super(game);
    this.editing = true;
    this.shadow = { ...game.state, buildings: [], events: [] };
  }

  override get state(): GameState {
    return this.shadow;
  }

  /** Load a slot into the scratch campus. Empty slots start from the live layout. */
  open(slot: number): void {
    const real = this.game.state;
    this.slot = slot;
    const clones = real.buildings.map((b) => ({ ...b }));
    const { placed, missing } = resolve(clones, real.layouts[slot]?.pos ?? snapshot(real.buildings));
    const gone = new Set(missing.map((b) => b.id));
    for (const b of clones) {
      const p = placed.get(b.id);
      if (p) {
        b.x = p.x;
        b.y = p.y;
      }
    }
    this.shadow = { ...real, buildings: clones.filter((b) => !gone.has(b.id)), events: [] };
    this.tray = missing;
    this.dirty = false;
    this.mode = { kind: 'idle' };
    this.selectedId = -1;
    const v = this.game.village.cam;
    this.cam.x = v.x;
    this.cam.y = v.y;
    this.cam.zoom = v.zoom;
  }

  get slotName(): string {
    return this.game.state.layouts[this.slot]?.name ?? defaultName(this.slot);
  }

  override enter(): void {
    this.particles.list.length = 0;
    bus.emit('changed');
  }

  override syncWanderers(): void {
    this.wanderers = [];
  }

  override update(dt: number, realDt: number): void {
    // Upgrades keep ticking on the real campus; mirror what the sprites show.
    const real = this.game.state;
    this.shadow.clock = real.clock;
    const byId = new Map(real.buildings.map((b) => [b.id, b]));
    for (const b of [...this.shadow.buildings, ...this.tray]) {
      const r = byId.get(b.id);
      if (!r) continue;
      b.level = r.level;
      b.upgrade = r.upgrade;
      b.stored = r.stored;
    }
    super.update(dt, realDt);
  }

  protected override placingLevel(type: BuildingType): number {
    return Math.max(1, this.tray.find((b) => b.type === type)?.level ?? 1);
  }

  // Base-class moves emit 'changed'; anything emitted while editing means the draft changed.
  markDirty(): void {
    this.dirty = true;
  }

  override confirmPlace(): void {
    if (this.mode.kind !== 'placing') return;
    const { type, gx, gy } = this.mode;
    const i = this.tray.findIndex((b) => b.type === type);
    if (i < 0) {
      this.cancelMode();
      return;
    }
    if (!canPlace(this.shadow, type, gx, gy)) {
      toast("Can't place there", 'bad');
      sfx('error');
      return;
    }
    const b = this.tray.splice(i, 1)[0];
    b.x = gx;
    b.y = gy;
    this.shadow.buildings.push(b);
    sfx('place');
    this.pop(b.id);
    const sz = BUILDINGS[type].size;
    const w = toWorld(gx + sz / 2, gy + sz / 2);
    this.particles.burst(w.x, w.y, 2, 10, { kind: 'puff', color: '#d8c8a8', size: 7, speed: 60, max: 0.5, grow: 10 });
    // Keep placing the same type while the tray has more of it.
    const next = this.tray.some((t) => t.type === type) ? this.findFree(type, gx + sz, gy) : null;
    if (next) this.mode = { kind: 'placing', type, gx: next.x, gy: next.y };
    else this.mode = { kind: 'idle' };
    bus.emit('mode', this.mode.kind);
    bus.emit('changed');
  }

  /** In the editor "remove" means "back to the tray". */
  override removeSelected(): void {
    const b = this.selected();
    if (!b) return;
    this.toTray([b]);
  }

  removeAll(): void {
    this.toTray([...this.shadow.buildings]);
  }

  private toTray(list: BuildingInst[]): void {
    if (!list.length) return;
    const ids = new Set(list.map((b) => b.id));
    this.shadow.buildings = this.shadow.buildings.filter((b) => !ids.has(b.id));
    this.tray.push(...list);
    this.mode = { kind: 'idle' };
    this.selectedId = -1;
    sfx('pop');
    bus.emit('selection', null);
    bus.emit('mode', 'idle');
    bus.emit('changed');
  }

  /** Write the draft into its slot. Returns false while buildings are still in the tray. */
  save(): boolean {
    if (this.tray.length) return false;
    const real = this.game.state;
    real.layouts[this.slot] = { name: this.slotName, pos: snapshot(this.shadow.buildings) };
    if (this.slot === real.activeLayout) {
      activate(real, this.slot);
    } else {
      syncActive(real);
      relocateFence(real);
    }
    this.dirty = false;
    return true;
  }
}
