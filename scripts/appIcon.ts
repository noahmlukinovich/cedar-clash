// Home-screen icons, drawn in code at build time (no image files in the repo).
// It's the favicon's crest from index.html (a blue hexagon with a gold cross,
// on a 32-unit grid) on a navy tile, rasterised here and saved as PNG with
// Node's zlib. No dependencies.
import { deflateSync } from 'node:zlib';

type RGB = [number, number, number];
const NAVY: RGB = [0x0b, 0x1e, 0x4d];
const BLUE: RGB = [0x2e, 0x63, 0xb8];
const INK: RGB = [0x1e, 0x1b, 0x2b];
const GOLD: RGB = [0xf5, 0xc3, 0x2c];

// The favicon's shapes, in its 32x32 units.
const HEX: [number, number][] = [
  [16, 2],
  [28, 9],
  [28, 23],
  [16, 30],
  [4, 23],
  [4, 9],
];
const HEX_STROKE = 2;
// Gold cross: "M16 8v16 M10 13h12", 3 wide, square ends cut flush.
const BARS: [number, number, number, number][] = [
  [14.5, 8, 17.5, 24],
  [10, 11.5, 22, 14.5],
];

function insidePoly(x: number, y: number, pts: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distToSeg(x: number, y: number, a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy));
}

/** Colour at a point of the 32-unit crest, or null outside it. */
function crest(x: number, y: number): RGB | null {
  for (const [x0, y0, x1, y1] of BARS) if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return GOLD;
  for (let i = 0; i < HEX.length; i++) if (distToSeg(x, y, HEX[i], HEX[(i + 1) % HEX.length]) <= HEX_STROKE / 2) return INK;
  return insidePoly(x, y, HEX) ? BLUE : null;
}

/**
 * RGBA pixels of a size x size icon. `crestShare` is how much of the width
 * the crest's 32 units take up (smaller for maskable icons, which Android
 * may crop to a circle).
 */
export function iconPixels(size: number, crestShare: number): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  const scale = (size * crestShare) / 32;
  const off = (size - 32 * scale) / 2;
  const SS = 4; // 4x4 samples per pixel for smooth edges
  for (let py = 0; py < size; py++) {
    for (let pxl = 0; pxl < size; pxl++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = crest((pxl + (sx + 0.5) / SS - off) / scale, (py + (sy + 0.5) / SS - off) / scale) ?? NAVY;
          r += c[0];
          g += c[1];
          b += c[2];
        }
      }
      const i = (py * size + pxl) * 4;
      px[i] = Math.round(r / (SS * SS));
      px[i + 1] = Math.round(g / (SS * SS));
      px[i + 2] = Math.round(b / (SS * SS));
      px[i + 3] = 255; // opaque: iOS shows transparency as black
    }
  }
  return px;
}

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const v of buf) c = CRC[(c ^ v) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** Encodes RGBA pixels as a PNG. */
export function encodePng(size: number, rgba: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // no filter
    Buffer.from(rgba.buffer, rgba.byteOffset + y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', new Uint8Array(0))]);
}

/** Every file the app manifest needs, by published name. */
export function appIconFiles(): Record<string, Buffer | string> {
  const png = (size: number, share: number): Buffer => encodePng(size, iconPixels(size, share));
  const manifest = {
    name: 'Cedarville Clash',
    short_name: 'Cedar Clash',
    description: 'Build up campus, train students and raid rival schools.',
    start_url: './',
    scope: './',
    display: 'fullscreen',
    orientation: 'landscape',
    background_color: '#0b1e4d',
    theme_color: '#0b1e4d',
    icons: [
      { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  return {
    'icon-192.png': png(192, 0.84),
    'icon-512.png': png(512, 0.84),
    'icon-maskable-512.png': png(512, 0.62), // stays inside Android's safe circle
    'apple-touch-icon.png': png(180, 0.8),
    'manifest.json': JSON.stringify(manifest, null, 2),
  };
}
