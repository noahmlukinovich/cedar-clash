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
  chevronDown: `<svg viewBox="0 0 32 32"><path d="m8 12 8 8 8-8" fill="none" stroke="#1e1b2b" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="m8 12 8 8 8-8" fill="none" stroke="#fff2bd" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  tuition: goldBarsSvg(),
  coffee: `<svg viewBox="0 0 32 32"><path d="M16 3C18 8 25.5 14 25.5 19.5A9.5 9.5 0 0 1 6.5 19.5C6.5 14 14 8 16 3Z" fill="#7a4520" stroke="#1e1b2b" stroke-width="2.5" stroke-linejoin="round"/><path d="M10.5 20a5.5 5.5 0 0 0 4 5" fill="none" stroke="#c98a55" stroke-width="2" stroke-linecap="round"/></svg>`,
  chapel: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><defs>
<linearGradient id="chapel-icon-roof" x2=".4" y2="1"><stop stop-color="#4c9cde"/><stop offset=".5" stop-color="#265d9c"/><stop offset="1" stop-color="#102b52"/></linearGradient>
<linearGradient id="chapel-icon-stone" x2="1" y2=".7"><stop stop-color="#f7e6c3"/><stop offset=".54" stop-color="#d9c6a0"/><stop offset="1" stop-color="#a08c6c"/></linearGradient>
<linearGradient id="chapel-icon-front" x2="1" y2="1"><stop stop-color="#fff5dd"/><stop offset=".55" stop-color="#e9d8b5"/><stop offset="1" stop-color="#b3a389"/></linearGradient>
<linearGradient id="chapel-icon-door"><stop stop-color="#da8007"/><stop offset=".26" stop-color="#ffb900"/><stop offset=".55" stop-color="#ffed4b"/><stop offset="1" stop-color="#f1a000"/></linearGradient>
<linearGradient id="chapel-icon-gold"><stop stop-color="#fff7a4"/><stop offset=".22" stop-color="#ffe75c"/><stop offset=".5" stop-color="#ffc20c"/><stop offset="1" stop-color="#d97b00"/></linearGradient>
</defs>
<g stroke="#091329" stroke-width="7" stroke-linejoin="round" stroke-linecap="round">
<path d="M30 126 43 90 75 69 106 62 127 47 153 64 183 70 216 91 229 128 221 145 34 145Z" fill="url(#chapel-icon-roof)"/>
<path d="M32 125 57 93 104 69 89 94 49 123Z" fill="#3f86bc" stroke-width="2"/><path d="m165 72 41 23 20 33-34-9-21-24Z" fill="#2d6ea9" stroke-width="2"/>
<path d="M40 133h173v89H40Z" fill="url(#chapel-icon-stone)"/>
<path d="M42 149h35m-35 25h35m-35 25h35m100-50h35m-35 25h35m-35 25h35" stroke="#f6e8ce" stroke-width="3"/>
<path d="M59 137v83m136-83v83" stroke="#9c8f78" stroke-width="3"/>
<path d="M69 222V119l59-64 59 64v103h-28v-72l-31-29-31 29v72Z" fill="url(#chapel-icon-front)"/>
<path d="M69 121 128 58l59 63" fill="none" stroke="#fff6db" stroke-width="4"/>
<path d="M97 223v-73l31-29 31 29v73Z" fill="url(#chapel-icon-door)" stroke-width="5"/>
<path d="M103 153v63" stroke="#ef8f00" stroke-width="3"/>
<path d="M122 137h12v29h20v12h-20v38h-12v-38h-20v-12h20Z" fill="#fff05a" stroke="#e99a05" stroke-width="2"/>
<path d="M125 138h5v76h-5Z" fill="#fff9ae" stroke="none"/><path d="M104 167h48v4h-48Z" fill="#fff4a0" stroke="none"/>
<path d="M30 222h196v12H30Z" fill="#646866"/>
<path d="M24 235h208v12H24Z" fill="#3b444c"/>
<path d="M76 222h104v9H76Z" fill="#bbab8c" stroke-width="2"/>
<path d="M70 232h116v8H70Z" fill="#d4c39f" stroke-width="2"/>
<path d="M54 223v10m145-10v10m-150 3v9m154-9v9" stroke="#87918c" stroke-width="2"/>
<path d="M114 78V48l-12-7 17-9 9-23 9 23 17 9-12 7v30l-14-12Z" fill="url(#chapel-icon-gold)"/>
<path d="m128 17-4 21-15 6 16 2 3 19 3-20 15-4-14-5Z" fill="#fff8bc" stroke="none"/>
<path d="m131 48 8 3v20l-8-9Z" fill="#ed8a00" stroke="none"/>
</g></svg>`,
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
/** Approved full Stinger, reduced 15% to leave breathing room inside the shield. */
function stingerEmblem(): string {
 const navy = ink, blue = '#2e63b8', cream = '#fff9e9';
 return `<g transform="translate(-20.32 -18.82) scale(.0714)" stroke-linejoin="round" stroke-linecap="round">
 <!-- legs, drawn behind the body -->
 <g fill="${navy}" stroke="${cream}" stroke-width="6">
  <path d="M302 276 217 258Q156 313 87 325Q149 335 222 282L297 292Z"/>
  <path d="M300 295 231 282Q182 330 109 346Q169 361 240 306L299 311Z"/>
  <path d="M264 328 220 329Q195 377 151 390L176 388Q154 427 115 441L137 438Q109 470 71 479L104 476 89 488Q158 472 185 429L179 452Q210 420 217 383L244 350Z"/>
  <path d="M291 420Q292 468 250 486L274 482Q237 510 183 496Q224 483 229 460L241 434Z"/>
 </g>
 <!-- four long, angular wings -->
 <g fill="${blue}" stroke="${cream}" stroke-width="7">
  <path d="M82 22Q61 53 72 111L166 165 172 153 305 255Z"/>
  <path d="M14 99 164 182 172 171 302 255 65 202Q30 191 14 99Z"/>
  <path d="M315 63Q294 78 285 111L307 153 312 144 350 245Z"/>
  <path d="M267 103Q253 136 260 164L328 243 341 244 302 176 294 180Z"/>
 </g>
 <!-- abdomen curls into the long raised stinger -->
 <path d="M294 314Q255 308 222 323Q202 340 197 377Q187 428 219 477Q253 526 310 538C379 555 453 531 510 500C443 531 377 534 330 518Q289 499 303 441L315 373 338 336Z" fill="${navy}" stroke="${cream}" stroke-width="6"/>
 <path d="M225 333Q211 356 218 382L241 396 240 414 264 425 257 402 245 395Q235 369 245 344L280 330Z" fill="${gold}"/>
 <path d="M215 390Q204 410 215 438L242 451 239 430 230 433 224 410Z" fill="${gold}"/>
 <path d="M224 443Q225 465 246 485L267 489 256 470 248 474 238 455Z" fill="${gold}"/>
 <path d="M254 485Q259 509 283 520L302 522 290 507 282 508 271 494Z" fill="${gold}"/>
 <path d="M289 520Q303 534 325 535L341 532 327 525 320 529 308 522Z" fill="${gold}"/>
 <path d="M330 534Q388 546 468 518Q398 538 353 529Z" fill="${gold}"/>
 <path d="M265 347Q256 403 277 452Q287 483 309 500Q278 474 271 438Q260 390 277 350Z" fill="${blue}"/>
 <g fill="none" stroke="${gold}" stroke-width="3"><path d="M224 367Q264 389 298 381"/><path d="M215 405Q254 431 293 421"/><path d="M226 448Q260 470 298 459"/><path d="M251 485Q280 504 312 495"/></g>
 <!-- thorax -->
 <path d="M301 251Q324 237 367 243L385 266 373 309Q360 339 329 339Q298 340 290 316Q275 285 301 251Z" fill="${navy}" stroke="${cream}" stroke-width="6"/>
 <path d="M323 249 351 247Q358 269 374 284L367 313Q345 289 323 249Z" fill="${gold}"/>
 <path d="M299 282Q302 257 319 265L329 275Q310 266 305 298Z" fill="${blue}"/>
 <!-- Stinger's recognizable angular head and antennae -->
 <path d="M402 165Q424 169 449 189L455 176Q494 189 539 230Q521 234 495 217L459 188Q459 208 464 225L489 233 482 237 507 249 500 253 510 266Q528 276 527 298Q526 310 521 319Q521 349 498 372L484 359Q465 349 416 342Q382 337 376 321Q369 303 373 281Q364 263 378 250Q384 234 410 234L407 222Q399 191 402 165Z" fill="${navy}" stroke="${cream}" stroke-width="6"/>
 <path d="M409 175Q428 182 449 198L453 231 431 227 427 218 416 225Q408 203 409 175ZM462 185Q492 198 525 222L511 214 475 199Z" fill="${cream}"/>
 <path d="M406 235Q463 253 500 317Q506 282 498 260Q523 290 513 329L500 358Q484 330 454 307Q443 280 406 235Z" fill="${gold}"/>
 <path d="M406 235Q464 270 493 348L500 358Q484 330 454 307Q443 280 406 235Z" fill="#c9971a"/>
 <path d="M385 289Q379 313 395 324L455 341Q407 324 398 316Q389 308 391 299Z" fill="${gold}"/>
 <path d="M379 253Q387 234 404 248Q429 266 446 300L450 309Q457 323 442 321Q406 319 389 296Q370 276 379 253Z" fill="${navy}"/>
 <path d="M378 260Q383 240 400 251Q421 266 438 296L443 309Q423 273 402 261Q389 253 378 260Z" fill="${blue}"/>
 <path d="M432 237 454 232 472 238 466 242 483 248 478 252 489 260 483 264Q497 287 499 308Q481 268 432 237Z" fill="${blue}"/>
 <circle cx="420" cy="278" r="6.5" fill="#ffffff"/>
</g>`;
}
function attack(): string{return `<g transform="translate(60 45) scale(.82)"><g transform="rotate(-43)">${sword()}</g><g transform="rotate(43)">${sword()}</g><path d="M-27-20Q-11-19 0-28 11-19 27-20L24 9Q20 28 0 38-20 28-24 9Z" fill="${ink}" stroke="${gold}" stroke-width="3"/>${stingerEmblem()}</g>`;}
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

/** Shared by the League Ladder rows and the campus trophy panel. */
export const LEAGUE_ROW_COLORS = [['#dce8f8','#8da2bc'],['#f0c98c','#b87b3c'],['#e5edf6','#91a2ba'],['#ffe22e','#dfa000'],['#11c8ff','#078bd6'],['#aa3bff','#4d0bb4'],['#ff6262','#bd252e'],['#ffdc49','#f0aa09']] as const;

/** Original vector League Ladder artwork. The preview and live modal use this same SVG. */
export function leagueLadderArt(data: { trophies: number; best: number; currentMin: number; leagues: { name: string; min: number }[]; matchmaking: string }): string {
  const xml = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  const wrap = (s: string, length: number): string[] => {
    const lines: string[] = []; let line = '';
    for (const w of s.split(/\s+/)) { if (line && `${line} ${w}`.length > length) { lines.push(line); line = w; } else line += `${line ? ' ' : ''}${w}`; }
    if (line) lines.push(line); return lines;
  };
  const rows = [...data.leagues].reverse().map((l, order) => {
    const i = data.leagues.length - 1 - order, y = 143 + order * 59, me = l.min === data.currentMin;
    return `<g transform="translate(28 ${y})" aria-label="${xml(l.name)}, ${l.min} trophies${me ? ', current league' : ''}">
      ${me ? '<rect x="-6" y="-6" width="716" height="64" rx="22" fill="#fff535" stroke="#ffffb5" stroke-width="2"/>' : ''}
      <rect width="704" height="52" rx="18" fill="#071329"/>
      <rect x="3" y="3" width="698" height="46" rx="15" fill="url(#ladder-row-${i})" stroke="${me ? '#ffd236' : '#fff1d2'}" stroke-width="2"/>
      <path d="M21 7H683Q695 7 695 20" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2" stroke-linecap="round"/>
      <path d="M438 5h47l-34 42h-47Zm61 0h34l-34 42h-34Z" fill="#fff" opacity=".10"/>
      <path d="M13 42Q13 46 24 46H681" fill="none" stroke="#071329" opacity=".18" stroke-width="3"/>
      ${i >= 6 ? `<g transform="translate(19 -1) scale(.76)">${leagueLaurel()}</g><g transform="translate(116 -1) scale(.76)">${leagueLaurel(true)}</g><g transform="translate(${i === 6 ? 448 : 418} -1) scale(.76)">${leagueLaurel(true)}</g>` : ''}
      <g transform="translate(52 -5) scale(.80)">${leagueEmblemPaths(i)}</g>
      <text x="152" y="35" fill="#fff" stroke="#071329" stroke-width="4.5" stroke-linejoin="round" paint-order="stroke fill" font-size="29" font-weight="900" letter-spacing="-.5">${xml(l.name)}</text>
      <g transform="translate(544 7) scale(.72)">${leagueCup()}</g>
      <text x="677" y="35" text-anchor="end" fill="${i === 5 ? '#fff' : '#071329'}" font-size="28" font-weight="900" letter-spacing="-.6">${l.min}+</text>
    </g>`;
  }).join('');
  const intro = `Trophies: ${data.trophies} (best ${data.best}). Win raids to climb; lose them and slide back toward “Prospective Student.”`;
  const introLines = wrap(intro, 66), lines = wrap(data.matchmaking, 70), footerY = 629, height = footerY + (lines.length - 1) * 20 + 31;
  const introText = introLines.map((line, i) => {
    const prefix = `Trophies: ${data.trophies}`;
    const label = i === 0 ? `<tspan font-weight="800">${prefix}</tspan>${xml(line.slice(prefix.length))}` : xml(line);
    return `<text x="46" y="${101 + i * 23}" fill="#10182d" font-size="20.5">${label}</text>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" class="ladder-art" viewBox="0 0 760 ${height}" role="group" aria-label="League Ladder" font-family="DejaVu Sans Condensed,Arial,sans-serif">
    <defs>${leagueEmblemDefs()}
      <linearGradient id="ladder-header" x2="0" y2="1"><stop stop-color="#3179df"/><stop offset=".30" stop-color="#2257b1"/><stop offset="1" stop-color="#102956"/></linearGradient>
      <linearGradient id="ladder-paper" x2=".7" y2="1"><stop stop-color="#fff9eb"/><stop offset=".5" stop-color="#f9f1e0"/><stop offset="1" stop-color="#fff9ed"/></linearGradient>
      ${LEAGUE_ROW_COLORS.map((p, i) => `<linearGradient id="ladder-row-${i}" x2=".15" y2="1"><stop stop-color="${p[0]}"/><stop offset="1" stop-color="${p[1]}"/></linearGradient>`).join('')}
    </defs>
    <rect x="3" y="7" width="754" height="${height - 10}" rx="31" fill="#071329"/>
    <rect x="6" y="4" width="748" height="${height - 14}" rx="29" fill="#102956" stroke="#08152e" stroke-width="6"/>
    <path d="M9 79V35Q9 7 37 7H723Q751 7 751 35V102H9Z" fill="url(#ladder-header)"/>
    <path d="M12 110V35Q12 10 38 10H722Q746 10 746 35V110" fill="none" stroke="#78b9ff" stroke-width="4"/>
    <rect x="10" y="76" width="740" height="${height - 92}" rx="28" fill="url(#ladder-paper)" stroke="#08152e" stroke-width="3"/>
    <g transform="translate(36 10) scale(.86)">${leagueLaurel()}<g transform="translate(25 0) scale(1.23)">${leagueCup()}</g><g transform="translate(79 0)">${leagueLaurel(true)}</g></g>
    <text x="153" y="55" fill="#fff" stroke="#071329" stroke-width="6.5" stroke-linejoin="round" paint-order="stroke fill" font-size="42" font-weight="900" letter-spacing="-.4">League Ladder</text>
    <!-- The real close button is outside this scrolling artwork. -->
    ${introText}${rows}
    ${lines.map((line, i) => `<text x="46" y="${footerY + i * 20}" font-size="17" font-style="italic" fill="#14213d">${xml(line)}</text>`).join('')}
  </svg>`;
  // Separate outline and fill layers also render consistently in native proof captures.
  return svg.replace(/<text([^>]*paint-order="stroke fill"[^>]*)>([^<]*)<\/text>/g, (_all, attrs: string, label: string) => {
    const clean = attrs.replace(/ paint-order="[^"]*"/g, '');
    const foreground = clean.replace(/ stroke="[^"]*"/g, '').replace(/ stroke-width="[^"]*"/g, '');
    return `<text${clean} aria-hidden="true">${label}</text><text${foreground} stroke="#fff" stroke-width=".45"${label === 'League Ladder' ? ' role="heading" aria-level="2"' : ''}>${label}</text>`;
  });
}

function leagueClosePaths(): string {
  return `<g stroke="#08152e" stroke-width="3.6" stroke-linejoin="round"><rect y="3" width="49" height="50" rx="13" fill="#761b1c"/><rect width="49" height="49" rx="13" fill="#b52b23"/><rect x="3" y="2" width="43" height="40" rx="10" fill="#f44e43" stroke="#ffb3a0" stroke-width="2"/><path d="M8 11Q9 6 16 6h21" fill="none" stroke="#ffd0bd" stroke-width="2"/><path d="m15 12 9 9 9-9 6 6-9 9 9 9-6 6-9-9-9 9-6-6 9-9-9-9Z" fill="#fff" stroke-width="2.5"/></g>`;
}

/** The real button remains accessible and pinned on short screens. */
export function leagueCloseArt(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 53 57" aria-hidden="true">${leagueClosePaths()}</svg>`;
}

/** Building Info action: vector bevels, gold inset icon and a movable pressed face. */
export function buildingInfoButtonArt(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" class="building-info-art" viewBox="0 0 100 108" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="building-info-blue" x2="0" y2="1"><stop stop-color="#66b2ff"/><stop offset=".16" stop-color="#3179df"/><stop offset=".52" stop-color="#2257b1"/><stop offset="1" stop-color="#102956"/></linearGradient>
      <linearGradient id="building-info-gold" x2=".8" y2="1"><stop stop-color="#fff6b3"/><stop offset=".32" stop-color="#ffdc62"/><stop offset=".7" stop-color="#e7a921"/><stop offset="1" stop-color="#956015"/></linearGradient>
      <linearGradient id="building-info-inset" x2="0" y2="1"><stop stop-color="#398ee0"/><stop offset="1" stop-color="#122f65"/></linearGradient>
      <linearGradient id="building-info-gloss" x2=".25" y2="1"><stop stop-color="#fff" stop-opacity=".26"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    </defs>
    <rect x="2" y="10" width="96" height="96" rx="22" fill="#071329"/>
    <rect x="5" y="9" width="90" height="92" rx="19" fill="#0b1e3f"/>
    <g class="info-face">
      <rect x="2" y="2" width="96" height="96" rx="22" fill="#071329"/>
      <rect x="5" y="4" width="90" height="89" rx="19" fill="url(#building-info-blue)"/>
      <path d="M8 77V25Q8 8 25 8h50q17 0 17 17v52" fill="none" stroke="#9bd2ff" stroke-width="2.2"/>
      <path d="M11 28Q11 11 28 11h44q16 0 17 16v18Q51 61 11 45Z" fill="url(#building-info-gloss)"/>
      <path d="M12 83q3 8 15 8h46q12 0 15-8" fill="none" stroke="#081b3d" stroke-opacity=".65" stroke-width="4"/>
      <rect x="27" y="17" width="46" height="47" rx="13" fill="#071329"/>
      <rect x="29" y="15" width="42" height="45" rx="12" fill="url(#building-info-gold)" stroke="#573b16" stroke-width="1.3"/>
      <rect x="33" y="19" width="34" height="36" rx="8" fill="url(#building-info-inset)" stroke="#fff0a6" stroke-width="1"/>
      <path d="M35 31v-3q0-7 7-7h16" fill="none" stroke="#a9d7ff" stroke-opacity=".75" stroke-width="1.2"/>
      <circle cx="50" cy="28" r="3.3" fill="#fff9e9"/>
      <path d="M45 36h7v13h4v3H44v-3h3V39h-2Z" fill="#fff9e9"/>
      <text x="50" y="85" text-anchor="middle" font-family="DejaVu Sans Condensed,Arial,sans-serif" font-weight="900" font-size="20" fill="#071329" stroke="#071329" stroke-width="4" stroke-linejoin="round">Info</text>
      <text x="50" y="85" text-anchor="middle" font-family="DejaVu Sans Condensed,Arial,sans-serif" font-weight="900" font-size="20" fill="#fff">Info</text>
    </g>
  </svg>`;
}

function leagueEmblemDefs(prefix = 'ladder'): string {
  return `<linearGradient id="${prefix}-gold" x2=".9" y2=".9"><stop stop-color="#fff998"/><stop offset=".24" stop-color="#ffe454"/><stop offset=".6" stop-color="#ffbf0a"/><stop offset="1" stop-color="#c97b00"/></linearGradient>
    <linearGradient id="${prefix}-navy" x2=".3" y2="1"><stop stop-color="#397eb6"/><stop offset=".5" stop-color="#17508b"/><stop offset="1" stop-color="#092b55"/></linearGradient>
    <linearGradient id="${prefix}-wood" x2="0" y2="1"><stop stop-color="#edb85d"/><stop offset=".45" stop-color="#b77a30"/><stop offset="1" stop-color="#69401e"/></linearGradient>
    <linearGradient id="${prefix}-white" x2=".3" y2="1"><stop stop-color="#fff"/><stop offset=".55" stop-color="#fff9e7"/><stop offset="1" stop-color="#b8c5d5"/></linearGradient>
    <linearGradient id="${prefix}-ribbon" x2="1" y2="1"><stop stop-color="#e1ebf3"/><stop offset=".5" stop-color="#a3b6d3"/><stop offset="1" stop-color="#5a729b"/></linearGradient>`;
}

function leagueCup(): string {
  return `<g stroke="#071329" stroke-width="2.5" stroke-linejoin="round"><path d="M11 7H2v9q0 12 14 13M37 7h9v9q0 12-14 13" fill="#f4b80a"/><path d="M10 4h28v16q0 14-14 14T10 20Z" fill="url(#ladder-gold)"/><path d="M14 8v12q0 7 6 9" stroke="#fff8ad" stroke-width="3" fill="none"/><path d="M33 8v11q0 8-5 11" stroke="#d79005" stroke-width="2" fill="none"/><path d="M21 34h6v8h9v6H12v-6h9Z" fill="url(#ladder-gold)"/><path d="M16 44h16" stroke="#fff3a0" stroke-width="2"/></g>`;
}

function leagueLaurel(mirror = false): string {
  // Broad alternating leaves follow a bowed stem, rather than a straight wheat stalk.
  return `<g${mirror ? ' transform="translate(30 0) scale(-1 1)"' : ''} fill="#f5d62b" stroke="#bd9917" stroke-width=".65" stroke-linejoin="round">
    <path d="M25 58Q4 40 8 8" fill="none" stroke="#eac522" stroke-width="1.8"/>
    <path d="M22 53Q9 55 5 44Q17 42 22 53ZM16 44Q2 44 0 33Q12 32 16 44ZM11 34Q-2 31 0 20Q11 22 11 34ZM8 23Q-2 17 3 7Q13 13 8 23ZM9 14Q3 5 10 0Q18 7 9 14Z"/>
    <path d="M21 51Q17 38 27 33Q32 44 21 51ZM15 42Q12 29 22 24Q28 35 15 42ZM10 31Q9 18 18 14Q24 25 10 31ZM8 21Q10 9 18 7Q21 17 8 21Z"/>
    <path d="M24 56Q8 40 8 19" fill="none" stroke="#fff077" stroke-width=".65"/>
  </g>`;
}

function leagueEmblemPaths(i: number): string {
  const art = [
    `<g transform="rotate(-11 38 37)"><rect x="5" y="18" width="68" height="46" rx="6" fill="#071329"/><rect x="8" y="20" width="62" height="40" rx="4" fill="url(#ladder-white)"/><path d="M30 21V10q0-9 9-9t9 9v11Z" fill="url(#ladder-navy)"/><rect x="36" y="7" width="6" height="13" rx="2" fill="#102a48" stroke-width="1.5"/><path d="M14 26h20v26H14Z" fill="#56b4d7" stroke="none"/><circle cx="24" cy="34" r="5" fill="#efb43b" stroke-width="1.5"/><path d="M16 50q1-15 16 0" fill="#164975" stroke-width="1"/><path d="M40 30h22m-22 8h22m-22 8h16" stroke="#279bca" stroke-width="3"/><path d="M12 24h14" stroke="#fff" stroke-width="2"/></g>`,
    `<path d="M7 32h62v32H7Z" fill="url(#ladder-wood)"/><path d="M4 30 38 14l35 16v6H4Z" fill="url(#ladder-navy)"/><path d="M24 64V30L38 16l15 14v34Z" fill="#f7d894"/><path d="M27 31 38 20l12 11" stroke="#fff5cc" stroke-width="2" fill="none"/><path d="M32 64V46q6-10 13 0v18Z" fill="#4db9e0"/><path d="M38 42v21" fill="none" stroke="#d9f9ff" stroke-width="2"/><path d="M12 41h7v15h-7m45-15h7v15h-7" fill="#54b5df"/><path d="M38 16V0q8-6 18 0v13q-10-6-18 0Z" fill="#f14d3a"/><circle cx="38" cy="33" r="3" fill="#74c4e3" stroke-width="1.5"/><path d="M4 65h69v4H4Z" fill="#bb8a43"/>`,
    `<path d="M31 9V3h14v6" fill="#d49512"/><circle cx="38" cy="37" r="30" fill="url(#ladder-gold)"/><circle cx="38" cy="37" r="24" fill="url(#ladder-white)"/><circle cx="38" cy="37" r="20" fill="none" stroke="#9daec4" stroke-width=".8"/>
      ${Array.from({length:12},(_,n)=>`<path d="M38 15v${n%3===0?5:3}" transform="rotate(${n*30} 38 37)" stroke="#546c88" stroke-width="${n%3===0?1.5:1}"/>`).join('')}
      <path d="m25 52 9-20 18-10-10 20Z" fill="#e94b3c" stroke-width="1.8"/><path d="m25 52 9-20 8 10Z" fill="#269db7" stroke-width="1.5"/><circle cx="38" cy="37" r="3" fill="#f1ce55" stroke-width="1"/><path d="M17 25a24 24 0 0 1 27-10" fill="none" stroke="#fff" stroke-width="2"/>`,
    `<path d="M54 26h10q18 0 12 20-4 12-20 10l1-8q11 2 13-5 4-11-12-10Z" fill="url(#ladder-white)"/>
      <path d="M13 24h44v32q0 13-22 13T13 56Z" fill="url(#ladder-white)"/><ellipse cx="35" cy="24" rx="22" ry="5" fill="#6c422b"/><ellipse cx="35" cy="24" rx="17" ry="2" fill="#a16a36" stroke="none"/><path d="M19 31v22q0 8 6 8" fill="none" stroke="#fff" stroke-width="2.5"/>
      <path d="M28 15Q17 8 29-2m12 17Q30 8 42-3" fill="none" stroke="#fffef4" stroke-width="3"/>
      <g transform="translate(34 47) rotate(-12)"><ellipse cx="-8" cy="-5" rx="7" ry="4" fill="#d6f1ff" stroke-width="1.3"/><ellipse cx="8" cy="-5" rx="7" ry="4" fill="#d6f1ff" stroke-width="1.3"/><ellipse ry="11" rx="8" fill="#ffd32b" stroke-width="1.5"/><path d="M-7-3H7M-7 3H7" stroke-width="2"/><circle cy="-11" r="4" fill="#17243c" stroke="none"/><path d="m0 10 0 5m-3-29-3-3m8 3 3-3" stroke-width="1.2"/></g>`,
    `<path d="m15 42 40-7 16 11-1 12-43 14-17-9q-8-4 5-21Z" fill="#d44b31"/><path d="m18 47 35-6 12 6-38 12-15-4Z" fill="#fff0ba" stroke-width="1.8"/><path d="m14 54 13 8 40-12v6L27 69l-13-8Z" fill="#f7d99b" stroke-width="1"/>
      <path d="m14 26 41-7 16 10-1 12-43 14-17-9q-7-4 4-20Z" fill="#ecb32c"/><path d="m18 30 36-6 12 6-39 12-14-4Z" fill="#fff4ce" stroke-width="1.8"/><path d="m14 38 13 7 40-12v6L27 52l-13-8Z" fill="#f5dfb2" stroke-width="1"/>
      <path d="m14 9 41-7 16 10-1 12-43 14-17-9q-7-4 4-20Z" fill="url(#ladder-navy)"/><path d="m18 13 36-6 12 6-39 12-14-4Z" fill="#fff5d8" stroke-width="1.8"/><path d="m14 21 13 7 40-12v6L27 35l-13-8Z" fill="#f8eacb" stroke-width="1"/><path d="m18 12 36-6" stroke="#6fc9ec" stroke-width="2"/>`,
    `<path d="M24 42 11 72l17-5 11 8 10-31m-2-2 17 31-18-6-9 8-9-32" fill="url(#ladder-ribbon)"/><path d="m25 47-8 18 12-4 8 7 6-20m4-1 10 20-11-6-7 8" fill="none" stroke="#ecf3fc" stroke-width="2"/>
      <path d="M38 1Q45 1 48 5Q56 5 59 12Q66 15 66 23Q71 29 67 36Q66 44 59 48Q55 55 47 55Q39 61 32 56Q23 57 19 50Q11 48 10 40Q5 33 9 25Q8 17 15 12Q18 5 27 5Q32 0 38 1Z" fill="url(#ladder-gold)"/><circle cx="38" cy="29" r="23" fill="#ec9b05" stroke="#fff0a4" stroke-width="2"/><circle cx="38" cy="29" r="19" fill="url(#ladder-gold)" stroke="#d68802" stroke-width="1"/><path d="m38 12 5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1Z" fill="#fff4a2" stroke="#bb7e0c" stroke-width="1.3"/><path d="M19 17Q24 6 38 6" fill="none" stroke="#fffad0" stroke-width="2"/>`,
    `<path d="M15 29v24q23 15 47 0V29Z" fill="url(#ladder-navy)"/><path d="M20 35v15q15 9 28 7" fill="none" stroke="#397baf" stroke-width="2"/><path d="M4 22 38 6l37 16-37 18L4 27Z" fill="url(#ladder-navy)"/><path d="m8 22 30-13 31 13-31 13Z" fill="#1b5791" stroke="#4695c6" stroke-width="1"/><path d="m38 23 25 5v30" fill="none" stroke="#eabf19" stroke-width="2.5"/><path d="m60 54-3 17q6 4 13 0l-4-17Z" fill="url(#ladder-gold)" stroke-width="1.6"/><path d="M61 58v11m4-11 1 11" stroke="#fff18b" stroke-width="1"/><circle cx="38" cy="23" r="2" fill="#f7d65d" stroke-width="1"/>`,
    `<path d="M7 59q30-6 60 0v10H7Z" fill="url(#ladder-wood)"/><path d="M14 53h46v8H14Z" fill="url(#ladder-wood)"/><path d="M17 55h39" stroke="#f9d18d" stroke-width="2"/><g transform="rotate(-44 38 29)"><path d="M34 20h9v38q-4 4-9 0Z" fill="url(#ladder-wood)"/><path d="M37 26v29" stroke="#ffd57b" stroke-width="1.7"/><rect x="14" y="7" width="48" height="20" rx="4" fill="url(#ladder-gold)"/><path d="M21 9v16m34-16v16" stroke="#8e4f07" stroke-width="2"/><path d="M25 11h25" stroke="#fff39d" stroke-width="2.5"/><path d="M16 7v18m44-18v18" stroke="#ffe78a" stroke-width="2"/></g>`,
  ][i];
  return `<g stroke="#08152e" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round">${art}</g>`;
}

/** The same illustrated badge as its matching League Ladder row. */
export function leagueBadgeArt(index: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -4 88 86" aria-hidden="true"><defs>${leagueEmblemDefs('profile-league')}</defs>${leagueEmblemPaths(Math.max(0, Math.min(7, index))).replace(/ladder-/g, 'profile-league-')}</svg>`;
}
