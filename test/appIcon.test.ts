import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { appIconFiles, encodePng, iconPixels } from '../scripts/appIcon';

/** Minimal PNG reader for the files we write (RGBA, 8-bit, no filtering). */
function readPng(buf: Buffer): { w: number; h: number; px: (x: number, y: number) => number[] } {
  expect([...buf.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  let p = 8;
  const idat: Buffer[] = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    if (type === 'IDAT') idat.push(buf.subarray(p + 8, p + 8 + len));
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  return { w, h, px: (x, y) => [...raw.subarray(y * (w * 4 + 1) + 1 + x * 4, y * (w * 4 + 1) + 1 + x * 4 + 4)] };
}

describe('home-screen icons', () => {
  it('makes every file the manifest lists, at the right sizes', () => {
    const files = appIconFiles();
    const manifest = JSON.parse(files['manifest.json'] as string);
    expect(manifest.orientation).toBe('landscape');
    expect(manifest.start_url).toBe('./');
    for (const ic of manifest.icons) {
      const png = readPng(files[ic.src] as Buffer);
      expect(`${png.w}x${png.h}`).toBe(ic.sizes);
    }
    expect(readPng(files['apple-touch-icon.png'] as Buffer).w).toBe(180);
  });

  it('draws the crest: navy corners, gold cross in the middle, blue hexagon, opaque', () => {
    const png = readPng(encodePng(64, iconPixels(64, 0.84)));
    expect(png.px(1, 1)).toEqual([0x0b, 0x1e, 0x4d, 255]);
    const mid = png.px(32, 34); // on the vertical bar of the cross
    expect(mid).toEqual([0xf5, 0xc3, 0x2c, 255]);
    const blue = png.px(22, 44); // inside the hexagon, off the cross
    expect(blue).toEqual([0x2e, 0x63, 0xb8, 255]);
  });

  it('keeps the maskable crest inside the safe circle', () => {
    const size = 128;
    const png = readPng(encodePng(size, iconPixels(size, 0.62)));
    // Everything outside the central 80% circle is plain navy.
    for (let a = 0; a < 360; a += 15) {
      const r = size * 0.41;
      const x = Math.round(size / 2 + r * Math.cos((a * Math.PI) / 180));
      const y = Math.round(size / 2 + r * Math.sin((a * Math.PI) / 180));
      expect(png.px(x, y)).toEqual([0x0b, 0x1e, 0x4d, 255]);
    }
  });

  it('is the same every build', () => {
    expect(encodePng(48, iconPixels(48, 0.8)).equals(encodePng(48, iconPixels(48, 0.8)))).toBe(true);
  });
});
