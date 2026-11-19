import { clamp } from './iso';

export class Camera {
  x = 0; // world px at screen center
  y = 600;
  zoom = 1;
  minZoom = 0.45;
  maxZoom = 2.2;
  shakeT = 0;
  shakeMag = 0;
  sx = 0; // shake offsets
  sy = 0;
  /** Glide after a touch flick, in world px per second. Render-only, like shake. */
  vx = 0;
  vy = 0;
  width = 1280;
  height = 800;

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: (wx - this.x) * this.zoom + this.width / 2 + this.sx,
      y: (wy - this.y) * this.zoom + this.height / 2 + this.sy,
    };
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.width / 2 - this.sx) / this.zoom + this.x,
      y: (sy - this.height / 2 - this.sy) / this.zoom + this.y,
    };
  }

  /** Is a world-space point (with margin in world px) on screen? */
  visible(wx: number, wy: number, margin = 150): boolean {
    const hw = this.width / 2 / this.zoom + margin;
    const hh = this.height / 2 / this.zoom + margin;
    return wx > this.x - hw && wx < this.x + hw && wy > this.y - hh && wy < this.y + hh + margin;
  }

  zoomAt(sx: number, sy: number, factor: number): void {
    const before = this.screenToWorld(sx, sy);
    this.zoom = clamp(this.zoom * factor, this.minZoom, this.maxZoom);
    const after = this.screenToWorld(sx, sy);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.clampPos();
  }

  clampPos(): void {
    // world spans roughly x in [-1280, 1280], y in [0, 1280]
    this.x = clamp(this.x, -1300, 1300);
    this.y = clamp(this.y, -50, 1350);
  }

  shake(mag: number, time = 0.3): void {
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeT = Math.max(this.shakeT, time);
  }

  /** Keep gliding after a flick. Speeds are in screen px per second. */
  fling(screenVx: number, screenVy: number): void {
    this.vx = -screenVx / this.zoom;
    this.vy = -screenVy / this.zoom;
  }

  stopFling(): void {
    this.vx = this.vy = 0;
  }

  update(dt: number): void {
    if (this.vx || this.vy) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      const before = { x: this.x, y: this.y };
      this.clampPos();
      if (this.x !== before.x) this.vx = 0;
      if (this.y !== before.y) this.vy = 0;
      const k = Math.exp(-dt * 5); // most of the glide is gone in about half a second
      this.vx *= k;
      this.vy *= k;
      if (Math.hypot(this.vx, this.vy) * this.zoom < 8) this.vx = this.vy = 0;
    }
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const m = this.shakeMag * Math.max(0, this.shakeT / 0.3);
      this.sx = (Math.random() * 2 - 1) * m;
      this.sy = (Math.random() * 2 - 1) * m;
      if (this.shakeT <= 0) {
        this.shakeMag = 0;
        this.sx = this.sy = 0;
      }
    }
  }

  apply(ctx: CanvasRenderingContext2D, dpr: number): void {
    ctx.setTransform(
      this.zoom * dpr,
      0,
      0,
      this.zoom * dpr,
      (this.width / 2 + this.sx - this.x * this.zoom) * dpr,
      (this.height / 2 + this.sy - this.y * this.zoom) * dpr,
    );
  }
}
