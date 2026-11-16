// Small DOM and formatting helpers shared by the HUD, the menus and the raid overlay.
import type { ResourceId } from '../config/types';
import { icon } from './icons';

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

/** Escapes text for safe use inside innerHTML (player-chosen names come from other people). */
export function esc(t: string): string {
  return t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Dark or white text, whichever reads better on a solid `#rrggbb` background. */
export function textOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number): number => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  // contrast against the game's dark ink (#1e1b2b) vs white
  return (L + 0.05) / 0.0616 > 1.05 / (L + 0.05) ? '#1e1b2b' : '#ffffff';
}

export function fmt(n: number): string {
  n = Math.floor(n);
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 10_000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString();
}

export function costHtml(res: ResourceId, amt: number, ok = true): string {
  return `<span class="price ${ok ? '' : 'bad'}">${icon(res, 18)} ${amt > 0 ? fmt(amt) : 'Free'}</span>`;
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
