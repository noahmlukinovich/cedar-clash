// Small DOM and formatting helpers shared by the HUD, the modals and the raid overlay.
import type { ResourceId } from '../config/types';
import { icon } from './icons';

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export function fmt(n: number): string {
  n = Math.floor(n);
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 10_000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString();
}

export function fmtTime(sec: number): string {
  sec = Math.max(0, Math.ceil(sec));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function costHtml(res: ResourceId, amt: number, ok = true): string {
  return `<span class="price ${ok ? '' : 'bad'}">${icon(res, 18)} ${amt > 0 ? fmt(amt) : 'Free'}</span>`;
}
