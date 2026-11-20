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

/** Original vector League Ladder artwork. The preview and live modal use this same SVG. */
export function leagueLadderArt(data: { trophies: number; best: number; currentMin: number; leagues: { name: string; min: number }[]; matchmaking: string }): string {
  const xml = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  const cup = `<g stroke="#08152e" stroke-width="3" stroke-linejoin="round"><path d="M12 8H3v9q0 12 13 12M36 8h9v9q0 12-13 12" fill="#f6b809"/><path d="M10 5h28v15q0 15-14 15T10 20Z" fill="url(#ladder-gold)"/><path d="M22 35h5v8h9v5H13v-5h9Z" fill="#ffcd26"/><path d="M15 9v11q0 7 5 9" fill="none" stroke="#fff6a0" stroke-width="2.5"/></g>`;
  const laurel = `<g fill="#f5d426" stroke="#17233b" stroke-width="1"><path d="M14 58Q-1 47 3 20" fill="none" stroke="#f5d426" stroke-width="2"/>${[0,1,2,3,4].map(i=>`<ellipse cx="${6+i*1.4}" cy="${22+i*7}" rx="3.3" ry="6" transform="rotate(${-35-i*10} ${6+i*1.4} ${22+i*7})"/>`).join('')}</g>`;
  const badge = (i: number): string => {
    const art = [
      `<g transform="rotate(-10 38 35)"><rect x="6" y="17" width="65" height="43" rx="5" fill="#f7fbff"/><rect x="30" y="5" width="15" height="19" rx="5" fill="#176baf"/><path d="M36 9v8" stroke="#78c8ef"/><rect x="14" y="28" width="20" height="24" fill="#9adcf1" stroke="none"/><circle cx="24" cy="35" r="5" fill="#efb63f"/><path d="M16 49q1-15 16 0" fill="#133e67"/><path d="M41 30h23m-23 9h23m-23 9h16" stroke="#2494c8" stroke-width="3"/></g>`,
      `<path d="M7 31h62v32H7Z" fill="#efb953"/><path d="M3 31 38 12l36 19Z" fill="#20568a"/><path d="M25 63V30h27v33Z" fill="#f3d48c"/><path d="M32 63V44q7-10 14 0v19" fill="#3caada"/><path d="M12 40h7v13h-7m44-13h7v13h-7" fill="#52a7cd"/><path d="M38 13V0l19 4-19 7" fill="#f54640"/><circle cx="38" cy="31" r="4" fill="#5cb5d9"/>`,
      `<circle cx="38" cy="35" r="29" fill="url(#ladder-gold)"/><circle cx="38" cy="35" r="23" fill="#f8fbff"/><path d="M38 13v6m0 32v6M16 35h6m32 0h6" stroke="#778ca6" stroke-width="2"/><path d="m24 49 10-18 18-10-10 18Z" fill="#ec4a4e"/><path d="m24 49 10-18 8 8Z" fill="#2a94bc"/><circle cx="38" cy="35" r="3" fill="#f1c940"/>`,
      `<path d="M57 31h9q15 0 10 16-3 8-18 6" fill="#f9fcff"/><path d="M13 24h45v31q0 14-23 14T13 55Z" fill="#fafcff"/><ellipse cx="35" cy="25" rx="22" ry="5" fill="#7d4c22"/><path d="M28 15Q17 8 29 1m12 14Q30 9 42 0" fill="none" stroke="#fff8de" stroke-width="3"/><ellipse cx="35" cy="46" rx="8" ry="12" fill="#fbd52b"/><path d="M28 42h14m-14 7h14" stroke="#14223c" stroke-width="2"/><ellipse cx="24" cy="40" rx="6" ry="4" fill="#d8f3ff"/><ellipse cx="46" cy="40" rx="6" ry="4" fill="#d8f3ff"/>`,
      `<path d="m7 46 45-8 17 10-44 13L7 55Z" fill="#d83d33"/><path d="m12 46 40-5 11 7-38 9-13-4Z" fill="#fff0bd" stroke-width="2"/><path d="m9 29 44-8 17 10-44 13L9 39Z" fill="#e8b83a"/><path d="m13 30 39-5 12 6-38 9-13-4Z" fill="#fff3c9" stroke-width="2"/><path d="M7 15 52 6l18 10-44 14L7 25Z" fill="#168dc3"/><path d="M13 24 52 13l12 4-38 9Z" fill="#f8efcd" stroke-width="2"/>`,
      `<path d="M23 40 10 68l19-5 9 8 8-30m1-1 15 29-19-6-6 8-8-31" fill="#a9c3d9"/><circle cx="37" cy="28" r="27" fill="url(#ladder-gold)"/><circle cx="37" cy="28" r="20" fill="#f4aa0c" stroke="#fff3a6" stroke-width="2"/><path d="m37 10 5 12 13 1-10 9 3 13-11-7-11 7 3-13-10-9 13-1Z" fill="#fff5a0" stroke="#db8d05" stroke-width="1.5"/>`,
      `<path d="m4 24 34-16 35 16-35 17Z" fill="#225d99"/><path d="M15 32v21q23 14 46 0V32L38 43Z" fill="#123c6b"/><path d="m37 25 26 6v26" fill="none" stroke="#f7cf22" stroke-width="3"/><path d="m59 55-2 15h12l-3-15Z" fill="#ffe047"/><circle cx="37" cy="25" r="2" fill="#ffe047"/>`,
      `<path d="M8 58h58v9H8Z" fill="#9b5b24"/><path d="M15 52h44v7H15Z" fill="#e3a342"/><g transform="rotate(-43 39 30)"><path d="M35 13h9v42h-9Z" fill="#c28227"/><rect x="17" y="6" width="45" height="19" rx="4" fill="url(#ladder-gold)"/><path d="M20 7v17m37-17v17" stroke="#fff0a2" stroke-width="3"/></g>`,
    ][i];
    return `<g stroke="#08152e" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">${art}</g>`;
  };
  const palettes = [['#dce8f8','#8da2bc'],['#f0c98c','#b87b3c'],['#e5edf6','#91a2ba'],['#ffe83d','#d5a306'],['#32ceff','#0589cf'],['#b153ff','#4a15ad'],['#ff6262','#bd252e'],['#ffe85b','#e3a407']];
  const wrap = (s: string, length: number): string[] => {
    const lines: string[] = []; let line = '';
    for (const w of s.split(/\s+/)) { if (line && `${line} ${w}`.length > length) { lines.push(line); line = w; } else line += `${line ? ' ' : ''}${w}`; }
    if (line) lines.push(line); return lines;
  };
  const rows = [...data.leagues].reverse().map((l, order) => {
    const i = data.leagues.length - 1 - order, y = 172 + order * 65, me = l.min === data.currentMin;
    return `<g transform="translate(24 ${y})" aria-label="${xml(l.name)}, ${l.min} trophies${me ? ', current league' : ''}"><rect x="0" y="0" width="712" height="57" rx="17" fill="url(#ladder-row-${i})" stroke="#08152e" stroke-width="3"/>${me ? '<rect x="-4" y="-4" width="720" height="65" rx="21" fill="none" stroke="#fff02c" stroke-width="5"/>' : ''}<rect x="4" y="4" width="704" height="49" rx="14" fill="none" stroke="#fff5ce" opacity=".55" stroke-width="2"/><path d="M430 2h65l-40 53h-65Z" fill="#ffffff" opacity=".09"/><g transform="translate(17 -6) scale(.93)">${i >= 6 ? laurel : ''}<g transform="translate(${i>=6?12:5} 0)">${badge(i)}</g></g><text x="153" y="38" fill="#fff" stroke="#08152e" stroke-width="4.5" paint-order="stroke fill" font-size="${l.name.length > 19 ? 26 : 29}" font-weight="900">${xml(l.name)}</text><g transform="translate(561 11) scale(.65)">${cup}</g><text x="694" y="38" text-anchor="end" fill="${i===5?'#fff':'#08152e'}" font-size="27" font-weight="900">${l.min}+</text></g>`;
  }).join('');
  const intro = `Trophies: ${data.trophies} (best ${data.best}). Win raids to climb; lose them and slide back toward “Prospective Student.”`;
  const lines = wrap(data.matchmaking, 78), height = 723 + lines.length * 20 + 25;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" class="ladder-art" viewBox="0 0 760 ${height}" role="group" aria-label="League Ladder" font-family="DejaVu Sans,Arial,sans-serif"><defs><linearGradient id="ladder-header" x2="0" y2="1"><stop stop-color="#216bd1"/><stop offset="1" stop-color="#0f2c69"/></linearGradient><linearGradient id="ladder-gold" x2="1" y2="1"><stop stop-color="#fff579"/><stop offset=".5" stop-color="#ffd21a"/><stop offset="1" stop-color="#df8f00"/></linearGradient>${palettes.map((p,i)=>`<linearGradient id="ladder-row-${i}" x2="0" y2="1"><stop stop-color="${p[0]}"/><stop offset="1" stop-color="${p[1]}"/></linearGradient>`).join('')}</defs><rect x="4" y="7" width="752" height="${height-11}" rx="28" fill="#07132d"/><rect x="5" y="3" width="750" height="${height-14}" rx="28" fill="#fff7e6" stroke="#07132d" stroke-width="5"/><path d="M33 5h694q26 0 26 27v55H7V32Q7 5 33 5Z" fill="url(#ladder-header)"/><path d="M24 18Q31 9 45 10h670" fill="none" stroke="#81bdff" stroke-width="3" opacity=".8"/><g transform="translate(28 7) scale(1.02)">${laurel}<g transform="translate(17 9)">${cup}</g><g transform="translate(84 0) scale(-1 1)">${laurel}</g></g><text x="125" y="60" fill="#fff" stroke="#07132d" stroke-width="6" paint-order="stroke fill" font-size="43" font-weight="900">League Ladder</text><g transform="translate(688 19)" stroke="#08152e" stroke-width="3"><rect width="49" height="50" rx="13" fill="#bd2b21"/><rect x="2" y="1" width="45" height="43" rx="11" fill="#ff6754"/><path d="m15 12 9 9 9-9 6 6-9 9 9 9-6 6-9-9-9 9-6-6 9-9-9-9Z" fill="#fff"/></g>${wrap(intro,64).map((line,i)=>`<text x="28" y="${113+i*22}" fill="#101a34" font-size="18" font-weight="${i===0?'700':'400'}">${xml(line)}</text>`).join('')}${rows}${lines.map((line,i)=>`<text x="28" y="${723+i*20}" font-size="16" font-style="italic" fill="#14213d">${xml(line)}</text>`).join('')}</svg>`;
  // Two text layers keep the white lettering above its dark outline in SVG renderers.
  return svg.replace(/<text([^>]*paint-order="stroke fill"[^>]*)>([^<]*)<\/text>/g, (_all, attrs: string, label: string) => {
    const clean = attrs.replace(/ paint-order="[^"]*"/g, '');
    const foreground = clean.replace(/ stroke="[^"]*"/g, '').replace(/ stroke-width="[^"]*"/g, '');
    return `<text${clean} aria-hidden="true">${label}</text><text${foreground}${label === 'League Ladder' ? ' role="heading" aria-level="2"' : ''}>${label}</text>`;
  });

}

/** The visible close control stays pinned while a shorter screen scrolls the ladder. */
export function leagueCloseArt(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 49 50" aria-hidden="true"><g stroke="#08152e" stroke-width="3"><rect width="49" height="50" rx="13" fill="#bd2b21"/><rect x="2" y="1" width="45" height="43" rx="11" fill="#ff6754"/><path d="m15 12 9 9 9-9 6 6-9 9 9 9-6 6-9-9-9 9-6-6 9-9-9-9Z" fill="#fff"/></g></svg>`;
}
