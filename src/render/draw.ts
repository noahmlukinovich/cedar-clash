// Procedural iso drawing primitives. Local coords: (u, v) in tiles from footprint center, z in px up.

export const OUT = '#1e1b2b';
export const LW = 2.4;

export const C = {
  brick: '#bf5a3f',
  brickDark: '#93402c',
  roofBlue: '#2e63b8',
  navy: '#1c3d7a',
  gold: '#f5c32c',
  goldDark: '#c9971a',
  white: '#f4efe4',
  glass: '#86d3f0',
  wood: '#a8713c',
  woodDark: '#7a4f28',
  stone: '#b8b2a7',
  stoneDark: '#8f897e',
  concrete: '#d9d2c3',
  grass: '#69b941',
  grassDark: '#4f9a2f',
  water: '#3fa8e0',
  orange: '#ff8a1f',
  skin: '#f2c49b',
  black: '#2a2733',
  red: '#d9413a',
  green: '#3fbf6a',
  teal: '#2bb3a3',
  purple: '#7b3fa0',
  coffee: '#6b3f22',
};

export function shade(hex: string, amt: number): string {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map((x) => x + x).join('');
  const n = parseInt(c, 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (amt >= 0) {
    r += (255 - r) * amt;
    g += (255 - g) * amt;
    b += (255 - b) * amt;
  } else {
    r *= 1 + amt;
    g *= 1 + amt;
    b *= 1 + amt;
  }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

export type Pt = [number, number];

export function P(u: number, v: number, z = 0): Pt {
  return [(u - v) * 32, (u + v) * 16 - z];
}

export function poly(ctx: CanvasRenderingContext2D, pts: Pt[], fill: string | CanvasGradient | null, stroke = true, lw = LW): void {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = OUT;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

/** Axis-aligned box in local tile coords. */
export function box(
  ctx: CanvasRenderingContext2D,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  z0: number,
  z1: number,
  color: string,
  opts: { top?: string; left?: string; right?: string; stroke?: boolean } = {},
): void {
  const st = opts.stroke !== false;
  // left face (v = v1)
  poly(ctx, [P(u0, v1, z0), P(u1, v1, z0), P(u1, v1, z1), P(u0, v1, z1)], opts.left ?? shade(color, -0.12), st);
  // right face (u = u1)
  poly(ctx, [P(u1, v1, z0), P(u1, v0, z0), P(u1, v0, z1), P(u1, v1, z1)], opts.right ?? shade(color, -0.3), st);
  // top
  poly(ctx, [P(u0, v0, z1), P(u1, v0, z1), P(u1, v1, z1), P(u0, v1, z1)], opts.top ?? shade(color, 0.12), st);
}

export function pyramid(ctx: CanvasRenderingContext2D, u0: number, v0: number, u1: number, v1: number, z: number, h: number, color: string): void {
  const cu = (u0 + u1) / 2;
  const cv = (v0 + v1) / 2;
  const apex = P(cu, cv, z + h);
  poly(ctx, [P(u0, v1, z), P(u1, v1, z), apex], shade(color, -0.05));
  poly(ctx, [P(u1, v1, z), P(u1, v0, z), apex], shade(color, -0.3));
}

/** Gable roof with ridge along u (ridge runs left-to-front). */
export function gable(ctx: CanvasRenderingContext2D, u0: number, v0: number, u1: number, v1: number, z: number, h: number, color: string, axis: 'u' | 'v' = 'u'): void {
  if (axis === 'u') {
    const vm = (v0 + v1) / 2;
    // back slope partially visible above; front slope (toward v1)
    poly(ctx, [P(u0, vm, z + h), P(u1, vm, z + h), P(u1, v0, z), P(u0, v0, z)], shade(color, 0.15));
    poly(ctx, [P(u0, v1, z), P(u1, v1, z), P(u1, vm, z + h), P(u0, vm, z + h)], shade(color, -0.05));
    // gable end on right face (u = u1)
    poly(ctx, [P(u1, v1, z), P(u1, v0, z), P(u1, vm, z + h)], shade(color, -0.35));
  } else {
    const um = (u0 + u1) / 2;
    poly(ctx, [P(um, v0, z + h), P(um, v1, z + h), P(u0, v1, z), P(u0, v0, z)], shade(color, 0.15));
    poly(ctx, [P(u1, v0, z), P(u1, v1, z), P(um, v1, z + h), P(um, v0, z + h)], shade(color, -0.3));
    poly(ctx, [P(u0, v1, z), P(u1, v1, z), P(um, v1, z + h)], shade(color, -0.1));
  }
}

/** Windows on the left face (v = v fixed) spanning u0..u1. */
export function windowsL(ctx: CanvasRenderingContext2D, u0: number, u1: number, v: number, z0: number, z1: number, cols: number, rows: number, color = C.glass, frame = true): void {
  const du = (u1 - u0) / cols;
  const dz = (z1 - z0) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = u0 + du * c + du * 0.22;
      const b = u0 + du * (c + 1) - du * 0.22;
      const zz0 = z0 + dz * r + dz * 0.22;
      const zz1 = z0 + dz * (r + 1) - dz * 0.18;
      poly(ctx, [P(a, v, zz0), P(b, v, zz0), P(b, v, zz1), P(a, v, zz1)], color, frame, 1.6);
      // shine
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      const p1 = P(a + (b - a) * 0.25, v, zz1 - (zz1 - zz0) * 0.2);
      const p2 = P(a + (b - a) * 0.55, v, zz1 - (zz1 - zz0) * 0.2);
      ctx.moveTo(p1[0], p1[1]);
      ctx.lineTo(p2[0], p2[1]);
      ctx.stroke();
    }
  }
}

/** Windows on the right face (u = u fixed) spanning v0..v1. */
export function windowsR(ctx: CanvasRenderingContext2D, v0: number, v1: number, u: number, z0: number, z1: number, cols: number, rows: number, color = C.glass): void {
  const dv = (v1 - v0) / cols;
  const dz = (z1 - z0) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = v0 + dv * c + dv * 0.22;
      const b = v0 + dv * (c + 1) - dv * 0.22;
      const zz0 = z0 + dz * r + dz * 0.22;
      const zz1 = z0 + dz * (r + 1) - dz * 0.18;
      poly(ctx, [P(u, a, zz0), P(u, b, zz0), P(u, b, zz1), P(u, a, zz1)], shade(color, -0.25), true, 1.6);
    }
  }
}

export function door(ctx: CanvasRenderingContext2D, u: number, v: number, w: number, h: number, color = C.woodDark): void {
  poly(ctx, [P(u - w / 2, v, 0), P(u + w / 2, v, 0), P(u + w / 2, v, h), P(u - w / 2, v, h)], color, true, 1.8);
}

/** Cylinder at local (u, v) with radius r (tiles), height h (px). */
export function cylinder(ctx: CanvasRenderingContext2D, u: number, v: number, r: number, z0: number, h: number, color: string, topColor?: string): void {
  const [x, y] = P(u, v, z0);
  const rx = r * 45;
  const ry = r * 22.5;
  const g = ctx.createLinearGradient(x - rx, 0, x + rx, 0);
  g.addColorStop(0, shade(color, -0.05));
  g.addColorStop(0.4, shade(color, 0.12));
  g.addColorStop(1, shade(color, -0.4));
  ctx.beginPath();
  ctx.moveTo(x - rx, y);
  ctx.ellipse(x, y, rx, ry, 0, Math.PI, 0, true);
  ctx.lineTo(x + rx, y - h);
  ctx.ellipse(x, y - h, rx, ry, 0, 0, Math.PI, true);
  ctx.closePath();
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = LW;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x, y - h, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = topColor ?? shade(color, 0.2);
  ctx.fill();
  ctx.stroke();
}

export function dome(ctx: CanvasRenderingContext2D, u: number, v: number, r: number, z: number, color: string): void {
  const [x, y] = P(u, v, z);
  const rx = r * 45;
  const g = ctx.createRadialGradient(x - rx * 0.35, y - rx * 0.6, rx * 0.1, x, y, rx * 1.1);
  g.addColorStop(0, shade(color, 0.45));
  g.addColorStop(1, shade(color, -0.25));
  ctx.beginPath();
  ctx.ellipse(x, y, rx, rx * 0.5, 0, 0, Math.PI);
  ctx.ellipse(x, y, rx, rx * 0.95, 0, Math.PI, 0);
  ctx.closePath();
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = LW;
  ctx.strokeStyle = OUT;
  ctx.stroke();
}

export function flag(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, color: string, wave = 0): void {
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - h);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.quadraticCurveTo(x + 9, y - h - 3 + wave, x + 18, y - h + 2);
  ctx.lineTo(x + 18, y - h + 11);
  ctx.quadraticCurveTo(x + 9, y - h + 6 + wave, x, y - h + 10);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.stroke();
}

export function sign(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, bg = C.navy, fg = C.gold, size = 10): void {
  ctx.font = `900 ${size}px "Trebuchet MS", system-ui, sans-serif`;
  const w = ctx.measureText(text).width + 10;
  const h = size + 7;
  roundRect(ctx, x - w / 2, y - h / 2, w, h, 4);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5);
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function groundShadow(ctx: CanvasRenderingContext2D, size: number): void {
  const s = size / 2 + 0.25;
  ctx.fillStyle = 'rgba(20,30,10,0.28)';
  ctx.beginPath();
  const pts = [P(-s + 0.2, -s + 0.3), P(s + 0.35, -s + 0.3), P(s + 0.35, s + 0.35), P(-s + 0.2, s + 0.35)];
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts) ctx.lineTo(p[0], p[1]);
  ctx.closePath();
  ctx.fill();
}

export function pad(ctx: CanvasRenderingContext2D, size: number, color = C.concrete): void {
  const s = size / 2 - 0.06;
  box(ctx, -s, -s, s, s, 0, 4, color, { stroke: true });
}

export function star5(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.18);
  ctx.strokeStyle = OUT;
  ctx.stroke();
}

export function cross(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, color = C.gold): void {
  const w = h * 0.18;
  ctx.fillStyle = color;
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.rect(x - w / 2, y - h, w, h);
  ctx.rect(x - h * 0.33, y - h * 0.75, h * 0.66, w);
  ctx.fill();
  ctx.stroke();
  ctx.fillRect(x - w / 2 + 0.8, y - h * 0.75 + 0.8, w - 1.6, w - 1.6);
}
