// Isometric projection helpers. Grid coords (gx, gy) in tiles; world coords in px.
export const TW = 64; // tile width in px
export const TH = 32; // tile height in px

export function toWorld(gx: number, gy: number): { x: number; y: number } {
  return { x: (gx - gy) * (TW / 2), y: (gx + gy) * (TH / 2) };
}

export function toGrid(wx: number, wy: number): { gx: number; gy: number } {
  const a = wx / (TW / 2);
  const b = wy / (TH / 2);
  return { gx: (a + b) / 2, gy: (b - a) / 2 };
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Distance from point to an axis-aligned rect [x, x+w] x [y, y+h]. */
export function distToRect(px: number, py: number, x: number, y: number, w: number, h: number): number {
  const dx = Math.max(x - px, 0, px - (x + w));
  const dy = Math.max(y - py, 0, py - (y + h));
  return Math.sqrt(dx * dx + dy * dy);
}

export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
