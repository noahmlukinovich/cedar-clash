import { Camera } from '../core/camera';
import type { Game, Scene } from '../main';
export type RaidKind = 'campaign' | 'random' | 'elephant';
export class RaidScene implements Scene {
  cam = new Camera();
  constructor(public game: Game, public kind: RaidKind) {}
  update(): void {}
  draw(): void {}
  onMouseDown(): void {}
  onMouseMove(): void {}
  onMouseUp(): void {}
  onWheel(): void {}
  onKey(): void {}
  enter(): void { this.game.endRaid(); }
  exit(): void {}
}
