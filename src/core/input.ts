import type { Camera } from './camera';

/**
 * Touch and pen input for the canvas. Mouse input keeps its own handlers in
 * main.ts, unchanged; this only handles pointers that aren't a mouse.
 *
 * - One finger is passed to the scene as a mouse with button 0, so tapping,
 *   dragging, deploying and moving buildings work the way clicking does.
 * - Two fingers pinch-zoom and pan the camera directly. The first finger's
 *   action is cancelled, and nothing more goes to the scene until every
 *   finger is lifted.
 * - A new touch waits a moment (SETTLE_MS) before it reaches the scene, so a
 *   two-finger pan in a raid doesn't drop a troop under the first finger.
 * - Fingers need a bigger move than a mouse before a tap becomes a drag.
 * - A quick one-finger pan keeps the camera gliding after release.
 */

/**
 * True after a touch or pen press anywhere on the page (HUD buttons included),
 * false after a mouse press. Starts true on devices whose main pointer is a
 * finger. Drives touch-only UI such as the floating ✔ / ✖ when placing.
 */
export let touchMode = false;

export function setTouchMode(on: boolean): void {
  if (touchMode === on) return;
  touchMode = on;
  document.body.classList.toggle('touch', on);
}

/** Call once at startup. */
export function trackInputMode(): void {
  try {
    setTouchMode(matchMedia('(pointer: coarse)').matches);
  } catch {
    // very old browser: assume mouse
  }
  window.addEventListener('pointerdown', (e) => setTouchMode(e.pointerType !== 'mouse'), { capture: true });
}

/** How long a finger must rest, without moving, to count as a long-press. */
export const LONG_PRESS_MS = 450;
/** How long a new touch waits for a second finger. */
export const SETTLE_MS = 70;
/** How far (CSS px) a finger moves before a tap becomes a drag. */
export const TOUCH_SLOP = 10;

export interface TouchTarget {
  cam: Camera;
  onMouseDown(x: number, y: number, button: number): void;
  onMouseMove(x: number, y: number): void;
  onMouseUp(x: number, y: number, button: number): void;
  /** Drop the current press without acting on it (a second finger arrived). */
  onPointerCancel(): void;
  /** A finger rested without moving for LONG_PRESS_MS. Optional. */
  onLongPress?(x: number, y: number): void;
}

interface Pt {
  x: number;
  y: number;
}

export class TouchInput {
  /** Every finger currently down, by pointer id. */
  private pts = new Map<number, Pt>();
  /** The finger being forwarded to the scene, if any. */
  private primary: { id: number; start: Pt; forwarded: boolean; moved: boolean; timer: number; longTimer: number } | null = null;
  /** Two-finger gesture state; stays set until every finger is up. */
  private gesture: { dist: number; mid: Pt } | null = null;
  /** Recent camera positions during a one-finger pan, for the flick speed. */
  private trail: { t: number; x: number; y: number }[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private scene: () => TouchTarget,
    /** Is the point over the canvas rather than a HUD element? */
    private onCanvas: (x: number, y: number) => boolean,
    /** Releasing over the HUD still counts as a release on the canvas (raids). */
    private releaseAnywhere: () => boolean,
    private onFirstTouch: () => void,
  ) {
    const c = canvas;
    c.addEventListener('pointerdown', (e) => this.down(e));
    c.addEventListener('pointermove', (e) => this.move(e));
    c.addEventListener('pointerup', (e) => this.up(e, false));
    c.addEventListener('pointercancel', (e) => this.up(e, true));
    // iOS Safari's own pinch-zoom events; the game does its own pinch.
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  }

  /** True while any finger is on the canvas. */
  get active(): boolean {
    return this.pts.size > 0;
  }

  private down(e: PointerEvent): void {
    if (e.pointerType === 'mouse') return;
    e.preventDefault(); // no emulated mouse events after this touch
    setTouchMode(true);
    this.onFirstTouch();
    this.canvas.setPointerCapture?.(e.pointerId);
    const p = { x: e.clientX, y: e.clientY };
    this.pts.set(e.pointerId, p);
    const scene = this.scene();
    scene.cam.stopFling();
    this.trail = [];
    if (this.pts.size === 1 && !this.gesture) {
      const timer = window.setTimeout(() => this.forwardDown(), SETTLE_MS);
      const longTimer = window.setTimeout(() => this.longPress(), LONG_PRESS_MS);
      this.primary = { id: e.pointerId, start: p, forwarded: false, moved: false, timer, longTimer };
      return;
    }
    // A second (or third) finger: switch to pinch / pan.
    this.cancelPrimary();
    this.startGesture();
  }

  private move(e: PointerEvent): void {
    if (e.pointerType === 'mouse' || !this.pts.has(e.pointerId)) return;
    const p = { x: e.clientX, y: e.clientY };
    this.pts.set(e.pointerId, p);
    if (this.gesture) {
      this.updateGesture();
      return;
    }
    const pr = this.primary;
    if (!pr || pr.id !== e.pointerId) return;
    if (!pr.moved) {
      if (Math.hypot(p.x - pr.start.x, p.y - pr.start.y) <= TOUCH_SLOP) return;
      pr.moved = true;
      clearTimeout(pr.longTimer);
      if (!pr.forwarded) this.forwardDown();
    }
    const scene = this.scene();
    scene.onMouseMove(p.x, p.y);
    const now = performance.now();
    this.trail.push({ t: now, x: scene.cam.x, y: scene.cam.y });
    while (this.trail.length > 2 && now - this.trail[0].t > 100) this.trail.shift();
  }

  private up(e: PointerEvent, cancelled: boolean): void {
    if (e.pointerType === 'mouse' || !this.pts.has(e.pointerId)) return;
    this.pts.delete(e.pointerId);
    if (this.gesture) {
      if (this.pts.size === 0) this.gesture = null;
      else this.startGesture(); // keep panning with the fingers that are left
      return;
    }
    const pr = this.primary;
    if (!pr || pr.id !== e.pointerId) return;
    if (cancelled) {
      this.cancelPrimary();
      return;
    }
    clearTimeout(pr.timer);
    clearTimeout(pr.longTimer);
    if (!pr.forwarded) this.forwardDown(); // a quick tap
    this.primary = null;
    const scene = this.scene();
    const x = e.clientX;
    const y = e.clientY;
    if (this.onCanvas(x, y) || this.releaseAnywhere()) scene.onMouseUp(x, y, 0);
    else scene.onMouseUp(-9999, -9999, 99);
    this.flick(scene.cam);
  }

  private forwardDown(): void {
    const pr = this.primary;
    if (!pr || pr.forwarded) return;
    clearTimeout(pr.timer);
    pr.forwarded = true;
    this.scene().onMouseDown(pr.start.x, pr.start.y, 0);
  }

  private longPress(): void {
    const pr = this.primary;
    if (!pr || pr.moved || this.gesture) return;
    if (!pr.forwarded) this.forwardDown();
    this.scene().onLongPress?.(pr.start.x, pr.start.y);
  }

  private cancelPrimary(): void {
    const pr = this.primary;
    if (!pr) return;
    clearTimeout(pr.timer);
    clearTimeout(pr.longTimer);
    this.primary = null;
    if (pr.forwarded) this.scene().onPointerCancel();
  }

  private flick(cam: Camera): void {
    const t = this.trail;
    this.trail = [];
    if (t.length < 2) return;
    const a = t[0];
    const b = t[t.length - 1];
    const dt = (b.t - a.t) / 1000;
    if (dt <= 0 || performance.now() - b.t > 60) return; // finger stopped before lifting
    // Trail is in world px; fling takes screen px of finger motion.
    const vx = (-(b.x - a.x) / dt) * cam.zoom;
    const vy = (-(b.y - a.y) / dt) * cam.zoom;
    if (Math.hypot(vx, vy) > 250) cam.fling(vx, vy);
  }

  private centroid(): { mid: Pt; dist: number } {
    const ps = [...this.pts.values()];
    const mid = { x: 0, y: 0 };
    for (const p of ps) {
      mid.x += p.x / ps.length;
      mid.y += p.y / ps.length;
    }
    const dist = ps.length >= 2 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : 0;
    return { mid, dist };
  }

  private startGesture(): void {
    this.gesture = this.centroid();
  }

  private updateGesture(): void {
    const g = this.gesture!;
    const now = this.centroid();
    const cam = this.scene().cam;
    cam.x -= (now.mid.x - g.mid.x) / cam.zoom;
    cam.y -= (now.mid.y - g.mid.y) / cam.zoom;
    cam.clampPos();
    if (g.dist > 0 && now.dist > 0) cam.zoomAt(now.mid.x, now.mid.y, now.dist / g.dist);
    this.gesture = now;
  }
}
