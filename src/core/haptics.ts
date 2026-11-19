import type { Sfx } from './audio';
import { touchMode } from './input';

/**
 * Short vibrations on phones, played alongside some sound effects. Android
 * browsers support this; iPhones ignore it. Touch only, and the player can
 * turn it off in Settings (a per-device choice, like name plates).
 */

const KEY = 'cedarville-clash-haptics';
let on: boolean | undefined;

/** Vibration patterns in ms. Sounds not listed don't vibrate. */
const PATTERNS: Partial<Record<Sfx, number | number[]>> = {
  deploy: 8,
  place: 15,
  build: 15,
  pop: 10,
  coin: 10,
  error: [18, 50, 18],
  star: 25,
  win: [30, 60, 30, 60, 60],
  lose: 60,
  boom: 20,
  spell: 15,
};

let last = 0;

export function hapticsSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

export function hapticsOn(): boolean {
  if (on === undefined) {
    try {
      on = localStorage.getItem(KEY) !== 'off';
    } catch {
      on = true;
    }
  }
  return on;
}

export function setHaptics(v: boolean): void {
  on = v;
  try {
    localStorage.setItem(KEY, v ? 'on' : 'off');
  } catch {
    // private window: the choice lasts for this visit only
  }
}

export function haptic(name: Sfx): void {
  const p = PATTERNS[name];
  if (p === undefined || !touchMode || !hapticsSupported() || !hapticsOn()) return;
  const now = performance.now();
  if (now - last < 45) return; // hold-to-deploy would otherwise buzz non-stop
  last = now;
  try {
    navigator.vibrate(p);
  } catch {
    // some browsers throw before the first user gesture
  }
}
