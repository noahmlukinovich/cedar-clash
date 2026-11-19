/**
 * Graphics quality, a per-device choice (like name plates):
 * - auto: full sharpness, stepping down (2x -> 1.5x -> 1x pixels) if frames
 *   stay slow for a couple of seconds. It never steps back up in a session,
 *   so it can't flicker between sharp and soft.
 * - sharp: always full sharpness.
 * - saver: 1x pixels and at most 30 frames a second, for battery.
 * Rendering only: the raid simulation runs on its own fixed clock.
 */
export type Quality = 'auto' | 'sharp' | 'saver';

const KEY = 'cedarville-clash-quality';
export const QUALITY_LABEL: Record<Quality, string> = { auto: 'Auto', sharp: 'Sharp', saver: 'Battery saver' };

export function getQuality(): Quality {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'sharp' || v === 'saver') return v;
  } catch {
    // private window
  }
  return 'auto';
}

export function setQuality(q: Quality): void {
  try {
    localStorage.setItem(KEY, q);
  } catch {
    // private window: lasts for this visit only
  }
}

export function nextQuality(q: Quality): Quality {
  return q === 'auto' ? 'sharp' : q === 'sharp' ? 'saver' : 'auto';
}

/** Device pixel ratio cap: never above 2 (the game's art doesn't gain anything past that). */
export function maxDpr(): number {
  return Math.min(2, window.devicePixelRatio || 1);
}

/** Watches frame times and decides when Auto should drop sharpness. Pure, for tests. */
export class FrameMonitor {
  private t = 0;
  private n = 0;
  private sum = 0;
  /** Seconds to ignore after start or a reset (loading spikes, scene changes). */
  private settle = 3;

  constructor(
    /** Average frame time (s) that counts as slow: 25ms is below 40 fps. */
    private slow = 0.025,
    /** How long (s) frames must stay slow before stepping down. */
    private window = 2,
  ) {}

  reset(settle = 1): void {
    this.t = this.n = this.sum = 0;
    this.settle = settle;
  }

  /** Feed one frame's real time. Returns true when sharpness should step down. */
  sample(dt: number): boolean {
    if (this.settle > 0) {
      this.settle -= dt;
      return false;
    }
    this.t += dt;
    this.sum += dt;
    this.n++;
    if (this.t < this.window) return false;
    const avg = this.sum / this.n;
    this.t = this.n = this.sum = 0;
    if (avg <= this.slow) return false;
    this.settle = 1.5; // let the new size take effect before judging again
    return true;
  }
}

/** The next lower sharpness step, or null at the bottom. */
export function lowerDpr(dpr: number): number | null {
  if (dpr > 1.5) return 1.5;
  if (dpr > 1) return 1;
  return null;
}
