// Small original inline-SVG icons for the HUD.

export interface IconFace {
  fill: string;
  pts: [number, number][];
}

/**
 * Three gold bars (one on top of two) in isometric view, as filled faces in a
 * 32x32 box, back to front. Shared by the SVG icon and the canvas flyers.
 */
export const GOLD_BAR_FACES: IconFace[] = (() => {
  const S = 1.1;
  const ax = 0.87 * S, ay = 0.5 * S; // bar length axis (down-right)
  const bx = -0.87 * S, by = 0.5 * S; // bar width axis (down-left)
  const L = 15, W = 7, H = 5 * S;
  const ox = 16 - (L * ax + 2 * W * bx) / 2;
  const oy = 16 - (L * ay + 2.5 * W * by) / 2;
  const faces: IconFace[] = [];
  const bar = (x: number, y: number): void => {
    const p = (a: number, b: number, h = 0): [number, number] => [
      +(x + a * ax + b * bx).toFixed(2),
      +(y + a * ay + b * by + h).toFixed(2),
    ];
    faces.push({ fill: '#f5c32c', pts: [p(0, W), p(L, W), p(L, W, H), p(0, W, H)] }); // long side
    faces.push({ fill: '#c9971a', pts: [p(L, 0), p(L, W), p(L, W, H), p(L, 0, H)] }); // end
    faces.push({ fill: '#ffe066', pts: [p(0, 0), p(L, 0), p(L, W), p(0, W)] }); // top
  };
  bar(ox, oy);
  bar(ox + W * bx, oy + W * by);
  bar(ox + (W / 2) * bx, oy + (W / 2) * by - H);
  return faces;
})();

function goldBarsSvg(): string {
  const polys = GOLD_BAR_FACES.map((f) => `<polygon points="${f.pts.map((q) => q.join(',')).join(' ')}" fill="${f.fill}"/>`).join('');
  return `<svg viewBox="0 0 32 32"><g stroke="#1e1b2b" stroke-width="2" stroke-linejoin="round">${polys}</g></svg>`;
}
export const ICONS: Record<string, string> = {
  tuition: goldBarsSvg(),
  coffee: `<svg viewBox="0 0 32 32"><path d="M16 3C18 8 25.5 14 25.5 19.5A9.5 9.5 0 0 1 6.5 19.5C6.5 14 14 8 16 3Z" fill="#7a4520" stroke="#1e1b2b" stroke-width="2.5" stroke-linejoin="round"/><path d="M10.5 20a5.5 5.5 0 0 0 4 5" fill="none" stroke="#c98a55" stroke-width="2" stroke-linecap="round"/></svg>`,
  chapel: `<svg viewBox="0 0 32 32"><path d="M6 28V14l10-9 10 9v14z" fill="#9b6dd6" stroke="#1e1b2b" stroke-width="2.5" stroke-linejoin="round"/><rect x="13" y="19" width="6" height="9" fill="#4a2f6b" stroke="#1e1b2b" stroke-width="1.5"/><path d="M16 7v8M13 10h6" stroke="#f5c32c" stroke-width="2.5"/></svg>`,
  trophy: `<svg viewBox="0 0 32 32"><path d="M9 5h14v6a7 7 0 0 1-14 0z" fill="#f5c32c" stroke="#1e1b2b" stroke-width="2.5"/><path d="M9 8H4c0 5 3 7 6 7M23 8h5c0 5-3 7-6 7" fill="none" stroke="#1e1b2b" stroke-width="2.5"/><rect x="13" y="18" width="6" height="5" fill="#c9971a" stroke="#1e1b2b" stroke-width="2"/><rect x="9" y="23" width="14" height="5" rx="1.5" fill="#1c3d7a" stroke="#1e1b2b" stroke-width="2"/></svg>`,
  builder: `<svg viewBox="0 0 32 32"><path d="M6 18a10 10 0 0 1 20 0z" fill="#f5c32c" stroke="#1e1b2b" stroke-width="2.5"/><rect x="3" y="17" width="26" height="5" rx="2" fill="#f5c32c" stroke="#1e1b2b" stroke-width="2.5"/><path d="M16 8v6" stroke="#1e1b2b" stroke-width="2.5"/></svg>`,
  star: `<svg viewBox="0 0 32 32"><path d="M16 3l4 8.5 9 1.2-6.6 6.3 1.7 9L16 23.6 7.9 28l1.7-9L3 12.7l9-1.2z" fill="#f5c32c" stroke="#1e1b2b" stroke-width="2.5" stroke-linejoin="round"/></svg>`,
  starEmpty: `<svg viewBox="0 0 32 32"><path d="M16 3l4 8.5 9 1.2-6.6 6.3 1.7 9L16 23.6 7.9 28l1.7-9L3 12.7l9-1.2z" fill="#4a4a5a" stroke="#1e1b2b" stroke-width="2.5" stroke-linejoin="round"/></svg>`,
  gear: `<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="9" fill="#c0c6cc" stroke="#1e1b2b" stroke-width="2.5"/><g stroke="#1e1b2b" stroke-width="5" stroke-linecap="round"><path d="M16 3v4M16 25v4M3 16h4M25 16h4M7 7l3 3M22 22l3 3M25 7l-3 3M7 25l3-3"/></g><g stroke="#c0c6cc" stroke-width="2.5" stroke-linecap="round"><path d="M16 3v4M16 25v4M3 16h4M25 16h4M7 7l3 3M22 22l3 3M25 7l-3 3M7 25l3-3"/></g><circle cx="16" cy="16" r="4" fill="#4b5563" stroke="#1e1b2b" stroke-width="2"/></svg>`,
  ring: `<svg viewBox="0 0 32 32"><circle cx="16" cy="20" r="9" fill="none" stroke="#1e1b2b" stroke-width="6"/><circle cx="16" cy="20" r="9" fill="none" stroke="#f5c32c" stroke-width="3"/><path d="M11 6h10l-5 6z" fill="#8fe3ff" stroke="#1e1b2b" stroke-width="2" stroke-linejoin="round"/></svg>`,
  shop: `<svg viewBox="0 0 32 32"><path d="M5 12h22l-2 15H7z" fill="#f4efe4" stroke="#1e1b2b" stroke-width="2.5" stroke-linejoin="round"/><path d="M4 7h24v6H4z" fill="#d9413a" stroke="#1e1b2b" stroke-width="2.5"/><path d="M10 7v6M16 7v6M22 7v6" stroke="#fff" stroke-width="2"/></svg>`,
  sword: `<svg viewBox="0 0 32 32"><path d="M6 26l14-14 4-6 2 2-6 4L6 26z" fill="#d9dde3" stroke="#1e1b2b" stroke-width="2.5" stroke-linejoin="round"/><path d="M8 18l6 6M4 28l4-4" stroke="#1e1b2b" stroke-width="3" stroke-linecap="round"/><path d="M8 18l6 6" stroke="#f5c32c" stroke-width="1.5"/></svg>`,
  army: `<svg viewBox="0 0 32 32"><path d="M4 26l12-20 12 20z" fill="#2e63b8" stroke="#1e1b2b" stroke-width="2.5" stroke-linejoin="round"/><path d="M14 26v-7h4v7" fill="#f5c32c" stroke="#1e1b2b" stroke-width="2"/></svg>`,
  medal: `<svg viewBox="0 0 32 32"><path d="M10 3l6 10 6-10" fill="#2e63b8" stroke="#1e1b2b" stroke-width="2.5"/><circle cx="16" cy="20" r="9" fill="#f5c32c" stroke="#1e1b2b" stroke-width="2.5"/><path d="M16 15l1.6 3.4 3.6.4-2.7 2.4.8 3.6-3.3-1.9-3.3 1.9.8-3.6-2.7-2.4 3.6-.4z" fill="#fff"/></svg>`,
  sound: `<svg viewBox="0 0 32 32"><path d="M5 12h6l7-6v20l-7-6H5z" fill="#f4efe4" stroke="#1e1b2b" stroke-width="2.5" stroke-linejoin="round"/><path d="M22 11c3 3 3 7 0 10M25 8c5 5 5 11 0 16" fill="none" stroke="#1e1b2b" stroke-width="2.5" stroke-linecap="round"/></svg>`,
  mute: `<svg viewBox="0 0 32 32"><path d="M5 12h6l7-6v20l-7-6H5z" fill="#bbb" stroke="#1e1b2b" stroke-width="2.5" stroke-linejoin="round"/><path d="M22 12l7 8M29 12l-7 8" stroke="#d9413a" stroke-width="3" stroke-linecap="round"/></svg>`,
  clock: `<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="#f4efe4" stroke="#1e1b2b" stroke-width="2.5"/><path d="M16 9v7l5 3" stroke="#1e1b2b" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>`,
};

export function icon(name: string, size = 24): string {
  return `<span class="ic" style="width:${size}px;height:${size}px">${ICONS[name] ?? ''}</span>`;
}


export type CampusControl = 'attack' | 'army' | 'shop';

/** Approved HUD artwork. The Army portraits are drawn separately by the unit renderer. */
export function campusControlArt(kind: CampusControl): string {
 const ink = '#102b41', gold = '#f5c32c';
function sword(): string{return `<g stroke="${ink}" stroke-width="3" stroke-linejoin="round"><path d="M-4-31 0-43 4-31 4 20-4 20Z" fill="#dce5ed"/><path d="M0-39 0 19 4 19 4-31Z" fill="#8fa5ba" stroke="none"/><path d="M-12 19H12V25H-12Z" fill="${gold}"/><path d="M-3 25H3V40H-3Z" fill="#cf941e"/><circle cy="41" r="4" fill="${gold}"/></g>`;}
function attack(): string{return `<g transform="translate(60 45) scale(.82)"><g transform="rotate(-43)">${sword()}</g><g transform="rotate(43)">${sword()}</g><path d="M-27-20Q-11-19 0-28 11-19 27-20L24 9Q20 28 0 38-20 28-24 9Z" fill="${ink}" stroke="${gold}" stroke-width="3"/></g>`;}
function army(): string{return ''; }
function shop(): string{return `<g stroke="${ink}" stroke-width="2.6" stroke-linejoin="round"><path d="M21 35H99V83H21Z" fill="#b56348"/><path d="M18 25H102V37H18Z" fill="#f4e1b7"/><path d="M35 25V15H85V25" fill="#c37453"/><path d="M30 42H90V83H30Z" fill="#f0dcad"/><path d="M26 41H94L102 55H18Z" fill="${gold}"/><path d="M38 41H49L45 55H32ZM70 41H81L88 55H75Z" fill="#214570" stroke="none"/><path d="M18 55Q26 63 34 55 42 63 50 55 58 63 66 55 74 63 82 55 92 63 102 55" fill="#214570"/><path d="M33 61H45V76H33ZM75 61H87V76H75ZM52 60H68V83H52Z" fill="#8fc8dc"/><path d="M35 72 44 63M77 72 86 63M55 77 65 63" stroke="#e9f5f3" stroke-width="2"/><path d="M63 71V76" stroke="${gold}" stroke-width="2.5"/><path d="M46 14H74V31H46Z" fill="${ink}"/><path d="M55 21H65V28H55ZM57 21V18Q60 13 63 18V21" fill="${gold}" stroke="${gold}" stroke-width="1.6"/></g>`;}
function button(type: CampusControl): string{
 const palette=type==='attack'?['#ffe378','#f5bd25','#bd8115']:type==='army'?['#365e98','#183761','#0d253f']:['#fffbed','#f1e2c2','#b8a67f'];
 const label=type==='attack'?'ATTACK!':type.toUpperCase();
 const foreground=type==='army'?'#ffffff':ink;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="496" class="campus-control-art" aria-hidden="true" focusable="false" viewBox="0 0 120 124"><defs><linearGradient id="control-${type}-face" x2="0" y2="1"><stop stop-color="${palette[0]}"/><stop offset="1" stop-color="${palette[1]}"/></linearGradient></defs><rect x="2" y="6" width="116" height="116" rx="24" fill="${ink}" opacity=".40"/><rect x="2" y="1" width="116" height="116" rx="24" fill="${palette[2]}" stroke="${ink}" stroke-width="3"/><rect x="5" y="3" width="110" height="107" rx="21" fill="url(#control-${type}-face)" stroke="${type==='army'?gold:'#fff0b5'}" stroke-width="2"/><path d="M15 15Q17 8 27 8H94" fill="none" stroke="#fff5c9" opacity=".55" stroke-width="2" stroke-linecap="round"/>${type==='attack'?attack():type==='army'?army():shop()}<text x="60" y="102" text-anchor="middle" font-family="DejaVu Sans,Arial,sans-serif" font-size="${type==='attack'?18:19}" font-weight="bold" fill="${foreground}">${label}</text></svg>`;
}
 return button(kind);
}
