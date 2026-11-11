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

  update(dt: number): void {
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
