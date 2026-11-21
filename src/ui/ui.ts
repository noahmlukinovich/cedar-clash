import { publicPlayerProfile } from '../game/profile';
import { BUILDINGS, SHOP_TABS, maxCount, maxLevelForDmc } from '../config/buildings';
import { DEBUG_SPEEDS, MAX_DMC, SCOUT_COST_PER_DMC } from '../config/balance';
import { CHANGELOG, LATEST_CHANGE } from '../config/changelog';
import { ACHIEVEMENTS, EVENT_INFO, LEAGUES, leagueFor, CHAPEL_ATTEND_LINES, CHUCKS_LINE } from '../config/humor';
import { HEROES, TROOPS, TROOP_ORDER } from '../config/troops';
import { SPELLS, SPELL_ORDER } from '../config/spells';
import type { BuildingType, HeroType, ResourceId, SpellType, TroopType } from '../config/types';
import { isMuted, setMuted, sfx } from '../core/audio';
import { bus } from '../core/bus';
import { hapticsOn, hapticsSupported, setHaptics } from '../core/haptics';
import { QUALITY_LABEL, nextQuality } from '../core/quality';
import { installOption, promptInstall } from '../core/install';
import { tapWord, touchMode } from '../core/input';
import { pick } from '../core/rng';
import {
  ARMIES,
  armyCapacity,
  armyUsed,
  brewCheck,
  heroAvailable,
  heroUnlocked,
  heroUpgradeCheck,
  libraryLevel,
  isReady,
  queueRuns,
  queueUsed,
  reserveReady,
  researchCheck,
  spellCapacity,
  spellsUsed,
  trainCheck,
  trainItemLeft,
  trainQueueLeft,
  troopUnlocked,
} from '../game/army';
import {
  buildCheck,
  builders,
  canAfford,
  caps,
  countOf,
  dmcLevel,
  finishNowCost,
  hasEvent,
  nextLevelInfo,
  resName,
  upgradeCheck,
  upgradeResOptions,
} from '../game/economy';
import { defaultName, isComplete, snapshot } from '../game/layouts';
import { canAttendChapel, chapelReward, startEvent } from '../game/events';
import { exportSave, importSave, resetSave, saveGame, staleSave } from '../game/save';
import { OBJECTIVES, dailyFor, dailyProgress, dayKey, msUntilNextDaily } from '../game/daily';
import { expectedDmc } from '../raid/matchmaking';
import { MAX_NAME_LEN, cleanName, renamePlayer } from '../game/state';
import { setPrefersOffline } from '../net/login';
import type { BuildingInst, SavedArmy } from '../game/state';
import { SAVED_ARMY_SLOTS, readSavedArmy, savedArmyCompositionCheck, savedArmyTotals, savedArmyTrainCheck } from '../game/savedArmies';
import { type ExtraRow, type UpgradeRow, listUpgrades } from '../game/upgrades';
import { toWorld } from '../core/iso';
import type { Game } from '../main';
import { NAME_RULES, type PlayerProfile, type VisitBuilding, type VisitResponse, validCampusName } from '../net/protocol';
import { fmtTime, type VillageScene } from '../village/villageScene';
import { namePlatesOn, setNamePlates } from '../render/world';
import { ICONS, LEAGUE_ROW_COLORS, campusControlArt, buildingInfoButtonArt, icon, leagueLadderArt, leagueCloseArt, leagueBadgeArt } from './icons';
import { armyControlPortraits, buildingThumb, spellThumb, unitThumb } from './thumbs';

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

const RES_COLORS: Record<ResourceId, string> = {
  tuition: 'linear-gradient(#ffe066,#e3a817)',
  coffee: 'linear-gradient(#b0703f,#6b3f22)',
  chapel: 'repeating-linear-gradient(125deg,transparent 0 12px,rgba(255,255,255,.12) 12px 23px),linear-gradient(#bd61f1,#7523bb)',
};

export function costHtml(res: ResourceId, amt: number, ok = true): string {
  return `<span class="price ${ok ? '' : 'bad'}">${icon(res, 18)} ${amt > 0 ? fmt(amt) : 'Free'}</span>`;
}

const SEEN_KEY = 'cedarville-clash-whatsnew';

/** Newest What's New entry this browser has shown (0 if none, or if storage is unavailable). */
function seenChange(): number {
  try {
    return Number(localStorage.getItem(SEEN_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function markChangeSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, String(LATEST_CHANGE));
  } catch {
    /* private mode: the popup may show again next time, which is harmless */
  }
}

/** Procedural, presentation-only loading artwork. No login or game-state changes. */
function mountLoadingArtwork(host: HTMLElement): { setProgress: (p: number) => void; dispose: () => void } {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);
  const context = canvas.getContext('2d');
  if (!context) return { setProgress: () => {}, dispose: () => {} };
  const ctx: CanvasRenderingContext2D = context;
  const logoBuffer = document.createElement('canvas');
  const logoContext = logoBuffer.getContext('2d');
  if (!logoContext) return { setProgress: () => {}, dispose: () => {} };
  const logoCtx: CanvasRenderingContext2D = logoContext;
      const CONFIG = {
        palette: {
          bgCenter: '#2558BD',
          bgMid: '#123682',
          bgEdge: '#0B1E4D',
          goldLight: '#FFF275',
          goldMid: '#FFC400',
          goldDeep: '#DC7C00',
          goldDark: '#7A4400',
          navyOutline: '#08142E',
          iceWhite: '#FFFFFF',
          iceBlue: '#A8D0F8',
          woodLight: '#8C522B',
          woodMid: '#5E3418',
          woodDark: '#381C0A'
        },
        loadingStatuses: [
          'Tuning chapel bells...',
          'Calibrating Hebrew crossbow bolts...',
          'Brewing Rinnova espresso...',
          'Polishing Yellow Jacket armor...',
          'Measuring Cedar Lake crosswinds...'
        ],
        hebrewLetters: [
          'א', 'ב', 'ג', 'ד', 'ה',
          'ו', 'ז', 'ח', 'ט', 'י',
          'כ', 'ל', 'מ', 'נ', 'ס',
          'ע', 'פ', 'צ', 'ק', 'ר',
          'ש', 'ת'
        ],
        disclaimer: 'An unofficial, affectionate parody. Not affiliated with any university or game studio. All art is procedurally generated.'
      };


      function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
        const radius = Math.max(0, Math.min(r, Math.abs(w) * 0.5, Math.abs(h) * 0.5));
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + w - radius, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
        ctx.lineTo(x + w, y + h - radius);
        ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
        ctx.lineTo(x + radius, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
      }

      function wrapTextLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
        const words = text.split(/\s+/);
        const lines = [];
        let currentLine = '';

        for (let i = 0; i < words.length; i++) {
          const word = words[i];
          const testLine = currentLine ? `${currentLine} ${word}` : word;
          if (ctx.measureText(testLine).width <= maxWidth || !currentLine) {
            currentLine = testLine;
          } else {
            lines.push(currentLine);
            currentLine = word;
          }
        }
        if (currentLine) {
          lines.push(currentLine);
        }
        return lines;
      }

      // --------------------------------------------------------------------------
      // 6. LAYER 1: ATMOSPHERIC BACKGROUND, SUNBURST RAYS, LATTICE & VIGNETTE
      // --------------------------------------------------------------------------
      function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, crestY: number, time: number) {
        const cx = w * 0.5;
        const maxRadius = Math.hypot(w, h) * 0.68;

        // Deep royal navy-to-sapphire radial gradient (#2558BD -> #0B1E4D)
        const bgGrad = ctx.createRadialGradient(cx, crestY, 10, cx, crestY, maxRadius);
        bgGrad.addColorStop(0, CONFIG.palette.bgCenter);
        bgGrad.addColorStop(0.52, CONFIG.palette.bgMid);
        bgGrad.addColorStop(1, CONFIG.palette.bgEdge);
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);

        // Slowly rotating translucent cathedral/sunburst light rays radiating from behind crest
        ctx.save();
        ctx.translate(cx, crestY);
        ctx.rotate(time * 0.042);

        const rayCount = 16;
        const rayLength = Math.hypot(w, h) * 0.95;
        const rayAngleWidth = (Math.PI * 2) / (rayCount * 2.35);

        for (let i = 0; i < rayCount; i++) {
          const angle = (i * Math.PI * 2) / rayCount;
          const rayGrad = ctx.createRadialGradient(0, 0, 20, 0, 0, rayLength * 0.85);
          rayGrad.addColorStop(0, 'rgba(145, 205, 255, 0.14)');
          rayGrad.addColorStop(0.45, 'rgba(80, 152, 248, 0.06)');
          rayGrad.addColorStop(1, 'rgba(20, 65, 155, 0)');

          ctx.fillStyle = rayGrad;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, rayLength, angle - rayAngleWidth * 0.5, angle + rayAngleWidth * 0.5);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();

        // Subtle heraldic diamond lattice overlay for Clash arena texture
        ctx.save();
        ctx.strokeStyle = 'rgba(185, 222, 255, 0.045)';
        ctx.lineWidth = 1;
        const tile = 54;
        ctx.beginPath();
        for (let offset = -h; offset < w + h; offset += tile) {
          ctx.moveTo(offset, 0);
          ctx.lineTo(offset + h, h);
          ctx.moveTo(offset, 0);
          ctx.lineTo(offset - h, h);
        }
        ctx.stroke();
        ctx.restore();

        // Subtle warm golden aura right behind the shield & title
        const haloGrad = ctx.createRadialGradient(cx, crestY, 5, cx, crestY, Math.min(w, h) * 0.36);
        haloGrad.addColorStop(0, 'rgba(255, 210, 63, 0.19)');
        haloGrad.addColorStop(0.55, 'rgba(65, 145, 255, 0.07)');
        haloGrad.addColorStop(1, 'rgba(11, 30, 77, 0)');
        ctx.fillStyle = haloGrad;
        ctx.fillRect(0, 0, w, h);

        // Edge vignette for cinematic Supercell framing
        const vigGrad = ctx.createRadialGradient(
          cx,
          h * 0.5,
          Math.min(w, h) * 0.32,
          cx,
          h * 0.5,
          Math.max(w, h) * 0.78
        );
        vigGrad.addColorStop(0, 'rgba(4, 12, 32, 0)');
        vigGrad.addColorStop(1, 'rgba(3, 10, 26, 0.58)');
        ctx.fillStyle = vigGrad;
        ctx.fillRect(0, 0, w, h);
      }

      // --------------------------------------------------------------------------
      // 7. LAYER 2: HERALDIC SHIELD CREST & CROSSED HEBREW CROSSBOWS
      // --------------------------------------------------------------------------
      function drawCrossbow(ctx: CanvasRenderingContext2D, angleRad: number, scale: number, hebrewGlyph: string) {
        ctx.save();
        ctx.rotate(angleRad);
        ctx.scale(scale, scale);

        // Drop shadow for crossbow
        ctx.shadowColor = 'rgba(3, 10, 28, 0.6)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 6;

        // Wooden stock (vertical along local Y, pointing up-right after rotation)
        ctx.lineWidth = 4;
        ctx.strokeStyle = CONFIG.palette.navyOutline;
        const stockGrad = ctx.createLinearGradient(-12, 0, 12, 0);
        stockGrad.addColorStop(0, CONFIG.palette.woodDark);
        stockGrad.addColorStop(0.4, CONFIG.palette.woodLight);
        stockGrad.addColorStop(1, CONFIG.palette.woodMid);

        ctx.fillStyle = stockGrad;
        drawRoundedRect(ctx, -9, -125, 18, 255, 7);
        ctx.fill();
        ctx.stroke();

        // Reset shadow for crisp internal details
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        // Gold stirrup ring at front tip
        ctx.strokeStyle = CONFIG.palette.navyOutline;
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.arc(0, -132, 13, Math.PI, 0);
        ctx.stroke();
        ctx.strokeStyle = CONFIG.palette.goldMid;
        ctx.lineWidth = 3.5;
        ctx.stroke();

        // Curved laminated bow limbs (prod)
        ctx.beginPath();
        ctx.moveTo(-98, -62);
        ctx.quadraticCurveTo(-52, -112, 0, -110);
        ctx.quadraticCurveTo(52, -112, 98, -62);
        ctx.lineWidth = 14;
        ctx.lineCap = 'round';
        ctx.strokeStyle = CONFIG.palette.navyOutline;
        ctx.stroke();

        const prodGrad = ctx.createLinearGradient(-98, -110, 98, -62);
        prodGrad.addColorStop(0, CONFIG.palette.goldDark);
        prodGrad.addColorStop(0.3, CONFIG.palette.goldLight);
        prodGrad.addColorStop(0.5, CONFIG.palette.goldMid);
        prodGrad.addColorStop(0.7, CONFIG.palette.goldLight);
        prodGrad.addColorStop(1, CONFIG.palette.goldDark);

        ctx.lineWidth = 8;
        ctx.strokeStyle = prodGrad;
        ctx.stroke();

        // Bow limb gold end-caps
        [-98, 98].forEach((bx) => {
          ctx.fillStyle = CONFIG.palette.goldMid;
          ctx.strokeStyle = CONFIG.palette.navyOutline;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(bx, -62, 6.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });

        // Taut bowstring drawn back to trigger nut
        ctx.strokeStyle = '#DCEEFF';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(-96, -62);
        ctx.lineTo(0, -14);
        ctx.lineTo(96, -62);
        ctx.stroke();

        // Gold trigger latch & bolt groove
        ctx.fillStyle = CONFIG.palette.goldMid;
        ctx.strokeStyle = CONFIG.palette.navyOutline;
        ctx.lineWidth = 2.5;
        drawRoundedRect(ctx, -6, -24, 12, 18, 4);
        ctx.fill();
        ctx.stroke();

        // Loaded glowing bolt shaft & arrowhead
        ctx.strokeStyle = '#FFE885';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(0, -18);
        ctx.lineTo(0, -148);
        ctx.stroke();

        // Steel/Gold broadhead tip
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = CONFIG.palette.navyOutline;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(0, -162);
        ctx.lineTo(9, -142);
        ctx.lineTo(0, -146);
        ctx.lineTo(-9, -142);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Subtle glowing Hebrew rune floating near the bolt tip
        ctx.fillStyle = '#FFF078';
        ctx.shadowColor = '#FFBE0B';
        ctx.shadowBlur = 10;
        ctx.font = '900 18px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(hebrewGlyph, 0, -177);

        ctx.restore();
      }

      function traceShieldPath(ctx: CanvasRenderingContext2D, w: number, h: number) {
        const hw = w * 0.5;
        const hh = h * 0.5;
        ctx.beginPath();
        // Top arched crown of shield
        ctx.moveTo(-hw * 0.86, -hh * 0.92);
        ctx.quadraticCurveTo(0, -hh * 1.08, hw * 0.86, -hh * 0.92);
        // Upper-right notched flare
        ctx.quadraticCurveTo(hw * 0.95, -hh * 0.72, hw, -hh * 0.52);
        // Curved right side tapering down to bottom point
        ctx.bezierCurveTo(hw * 0.98, hh * 0.18, hw * 0.52, hh * 0.74, 0, hh);
        // Curved left side mirroring back up
        ctx.bezierCurveTo(-hw * 0.52, hh * 0.74, -hw * 0.98, hh * 0.18, -hw, -hh * 0.52);
        // Upper-left notched flare
        ctx.quadraticCurveTo(-hw * 0.95, -hh * 0.72, -hw * 0.86, -hh * 0.92);
        ctx.closePath();
      }

      function drawCrest(ctx: CanvasRenderingContext2D, cx: number, cy: number, scale: number, time: number) {
        ctx.save();
        // Gentle heroic floating bob
        const bobY = Math.sin(time * 1.8) * 3.5 * scale;
        ctx.translate(cx, cy + bobY);

        // 1. Crossed procedural crossbows behind the shield
        drawCrossbow(ctx, -0.62, scale * 0.96, 'א');
        drawCrossbow(ctx, 0.62, scale * 0.96, 'ה');

        ctx.scale(scale, scale);

        const shieldW = 228;
        const shieldH = 256;

        // 2. Outer shield drop shadow
        ctx.save();
        ctx.shadowColor = 'rgba(2, 8, 24, 0.72)';
        ctx.shadowBlur = 26;
        ctx.shadowOffsetY = 14;
        traceShieldPath(ctx, shieldW, shieldH);
        ctx.fillStyle = CONFIG.palette.navyOutline;
        ctx.fill();
        ctx.restore();

        // 3. Thick outer dark navy outline + beveled metallic gold rim
        traceShieldPath(ctx, shieldW, shieldH);
        const rimGrad = ctx.createLinearGradient(-shieldW * 0.5, -shieldH * 0.5, shieldW * 0.5, shieldH * 0.5);
        rimGrad.addColorStop(0, '#FFF28C');
        rimGrad.addColorStop(0.28, '#FFBE0B');
        rimGrad.addColorStop(0.55, '#E08E00');
        rimGrad.addColorStop(0.82, '#FFE066');
        rimGrad.addColorStop(1, '#8C4E00');
        ctx.fillStyle = rimGrad;
        ctx.fill();

        ctx.lineWidth = 7;
        ctx.strokeStyle = CONFIG.palette.navyOutline;
        ctx.stroke();

        // Inner bevel highlight ring on gold frame
        ctx.save();
        ctx.scale(0.92, 0.925);
        traceShieldPath(ctx, shieldW, shieldH);
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#6E3B00';
        ctx.stroke();
        ctx.restore();

        // 4. Royal blue inner shield face
        ctx.save();
        ctx.scale(0.86, 0.87);
        traceShieldPath(ctx, shieldW, shieldH);

        const innerGrad = ctx.createRadialGradient(0, -25, 10, 0, 10, 145);
        innerGrad.addColorStop(0, '#2369DB');
        innerGrad.addColorStop(0.58, '#103B87');
        innerGrad.addColorStop(1, '#082152');
        ctx.fillStyle = innerGrad;
        ctx.fill();

        // Clip inside blue face for subtle filigree & heraldic emblem
        ctx.clip();

        // Subtle vertical heraldic split sheen
        ctx.fillStyle = 'rgba(255, 255, 255, 0.055)';
        ctx.fillRect(0, -shieldH, shieldW, shieldH * 2);

        // Subtle procedural heraldic torch / book filigree in upper & lower shield
        ctx.strokeStyle = 'rgba(255, 210, 63, 0.22)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(0, -95);
        ctx.lineTo(0, 95);
        ctx.moveTo(-65, -20);
        ctx.lineTo(65, -20);
        ctx.stroke();

        // Stylized golden torch flame at top center of crest
        const flameGrad = ctx.createLinearGradient(0, -98, 0, -52);
        flameGrad.addColorStop(0, 'rgba(255, 240, 120, 0.55)');
        flameGrad.addColorStop(1, 'rgba(255, 159, 28, 0.15)');
        ctx.fillStyle = flameGrad;
        ctx.beginPath();
        ctx.moveTo(0, -98);
        ctx.bezierCurveTo(18, -80, 15, -60, 0, -54);
        ctx.bezierCurveTo(-15, -60, -18, -80, 0, -98);
        ctx.fill();

        // Stylized open book / chevron filigree at bottom of crest
        ctx.strokeStyle = 'rgba(255, 224, 102, 0.28)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-34, 52);
        ctx.quadraticCurveTo(-16, 44, 0, 56);
        ctx.quadraticCurveTo(16, 44, 34, 52);
        ctx.lineTo(30, 74);
        ctx.quadraticCurveTo(15, 64, 0, 76);
        ctx.quadraticCurveTo(-15, 64, -30, 74);
        ctx.closePath();
        ctx.stroke();

        ctx.restore();

        // 5. Metallic gold rivets along the shield bezel
        const rivets = [
          [0, -116],
          [-86, -98],
          [86, -98],
          [-99, -46],
          [99, -46],
          [-72, 42],
          [72, 42],
          [0, 114]
        ];
        rivets.forEach(([rx, ry]) => {
          ctx.fillStyle = '#FFE875';
          ctx.strokeStyle = '#5C3200';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(rx, ry, 3.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });

        ctx.restore();
      }

      // --------------------------------------------------------------------------
      // 8. LAYER 3: TILTED 3D EXTRUDED "CEDARVILLE CLASH" LOGO + SHINE SWEEP
      // --------------------------------------------------------------------------
      function renderExtrudedWord(targetCtx: CanvasRenderingContext2D, text: string, x: number, y: number, font: string, topColor: string, midColor: string, botColor: string, extrudeDepth: number, outlineWidth: number) {
        targetCtx.save();
        targetCtx.font = font;
        targetCtx.textAlign = 'center';
        targetCtx.textBaseline = 'middle';
        targetCtx.lineJoin = 'round';
        targetCtx.miterLimit = 2;

        // 1. Soft drop shadow beneath the 3D extrusion
        targetCtx.save();
        targetCtx.shadowColor = 'rgba(3, 10, 28, 0.72)';
        targetCtx.shadowBlur = 16;
        targetCtx.shadowOffsetY = extrudeDepth + 7;
        targetCtx.fillStyle = CONFIG.palette.navyOutline;
        targetCtx.lineWidth = outlineWidth;
        targetCtx.strokeStyle = CONFIG.palette.navyOutline;
        targetCtx.strokeText(text, x, y + extrudeDepth);
        targetCtx.restore();

        // 2. Multi-pass 3D block extrusion (dark navy to deep bronze-navy)
        for (let i = extrudeDepth; i >= 1; i--) {
          const ratio = i / extrudeDepth;
          targetCtx.lineWidth = outlineWidth;
          targetCtx.strokeStyle = ratio > 0.45 ? '#07122B' : '#122654';
          targetCtx.fillStyle = ratio > 0.45 ? '#07122B' : '#122654';
          const ox = i * 0.18;
          const oy = i * 1.05;
          targetCtx.strokeText(text, x + ox, y + oy);
          targetCtx.fillText(text, x + ox, y + oy);
        }

        // 3. Crisp outer dark outline around top face
        targetCtx.lineWidth = outlineWidth;
        targetCtx.strokeStyle = CONFIG.palette.navyOutline;
        targetCtx.strokeText(text, x, y);

        // 4. Top-edge inner specular rim highlight
        targetCtx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        targetCtx.fillText(text, x, y - 1.8);

        // 5. Rich vertical gradient face fill
        const metrics = targetCtx.measureText(text);
        const approxH = (metrics.actualBoundingBoxAscent || 40) + (metrics.actualBoundingBoxDescent || 12);
        const faceGrad = targetCtx.createLinearGradient(x, y - approxH * 0.55, x, y + approxH * 0.55);
        faceGrad.addColorStop(0, topColor);
        faceGrad.addColorStop(0.52, midColor);
        faceGrad.addColorStop(1, botColor);

        targetCtx.fillStyle = faceGrad;
        targetCtx.fillText(text, x, y);

        targetCtx.restore();
      }

      function drawLogo(ctx: CanvasRenderingContext2D, cx: number, cy: number, scale: number, time: number) {
        // Render logo onto offscreen buffer so the diagonal shine sweep clips purely to letters
        const bufW = 860;
        const bufH = 300;
        if (logoBuffer.width !== bufW || logoBuffer.height !== bufH) {
          logoBuffer.width = bufW;
          logoBuffer.height = bufH;
        }

        logoCtx.clearRect(0, 0, bufW, bufH);

        const midX = bufW * 0.5;
        const primaryY = 114;
        const secondaryY = 192;

        const primaryFont = '900 82px Impact, "Arial Black", sans-serif';
        const secondaryFont = '700 50px "Arial Black", sans-serif';

        // Draw "CEDARVILLE" in royal gold 3D extrusion (#FFF275 -> #FFC400 -> #DC7C00)
        renderExtrudedWord(
          logoCtx,
          'CEDARVILLE',
          midX,
          primaryY,
          primaryFont,
          '#FFF275',
          '#FFC400',
          '#DC7C00',
          10,
          13
        );

        // Draw "CLASH" in metallic white-to-ice-blue 3D extrusion
        renderExtrudedWord(
          logoCtx,
          'CLASH',
          midX,
          secondaryY,
          secondaryFont,
          '#FFFFFF',
          '#E6F3FF',
          '#8DC0F2',
          8,
          10
        );

        // Animated diagonal glossy shine sweep across the letters every ~3.6 seconds
        const sweepCycle = (time % 3.6) / 3.6;
        if (sweepCycle < 0.42) {
          const t = sweepCycle / 0.42;
          const sweepX = -180 + t * (bufW + 360);

          logoCtx.save();
          logoCtx.globalCompositeOperation = 'source-atop';

          const shineGrad = logoCtx.createLinearGradient(sweepX - 70, 0, sweepX + 70, 0);
          shineGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
          shineGrad.addColorStop(0.45, 'rgba(255, 255, 255, 0.34)');
          shineGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.58)');
          shineGrad.addColorStop(0.55, 'rgba(255, 255, 255, 0.34)');
          shineGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

          logoCtx.translate(midX, bufH * 0.5);
          logoCtx.transform(1, 0, -0.38, 1, 0, 0); // Skew beam diagonally
          logoCtx.translate(-midX, -bufH * 0.5);

          logoCtx.fillStyle = shineGrad;
          logoCtx.fillRect(sweepX - 90, 0, 180, bufH);
          logoCtx.restore();
        }

        // Composite level, upright lettering onto main canvas
        ctx.save();
        const bobY = Math.sin(time * 1.8) * 3.5 * scale;
        ctx.translate(cx, cy + bobY);
        ctx.scale(scale, scale);
        ctx.drawImage(logoBuffer, -bufW * 0.5, -bufH * 0.5);
        ctx.restore();
      }

      // --------------------------------------------------------------------------
      // Loading progress artwork
      // --------------------------------------------------------------------------
      function drawProgressBar(ctx: CanvasRenderingContext2D, cx: number, cy: number, barW: number, barH: number, progress: number, time: number) {
        const x = cx - barW * 0.5;
        const y = cy - barH * 0.5;
        const radius = barH * 0.5;

        ctx.save();

        // Rotating humorous Cedarville status line above the bar
        const statusIndex = Math.min(
          CONFIG.loadingStatuses.length - 1,
          Math.floor(progress * CONFIG.loadingStatuses.length)
        );
        const statusText = progress >= 1 ? 'Arena gates unlocked!' : CONFIG.loadingStatuses[statusIndex];

        ctx.font = `800 ${Math.max(13, Math.round(barH * 0.48))}px Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = 'rgba(218, 236, 255, 0.92)';
        ctx.shadowColor = 'rgba(4, 12, 32, 0.85)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 2;
        ctx.fillText(statusText, cx, y - 10);

        // Reset shadow
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        // 1. Outer drop shadow + dark outline
        ctx.save();
        ctx.shadowColor = 'rgba(2, 8, 24, 0.72)';
        ctx.shadowBlur = 16;
        ctx.shadowOffsetY = 7;
        drawRoundedRect(ctx, x - 4, y - 4, barW + 8, barH + 8, radius + 4);
        ctx.fillStyle = CONFIG.palette.navyOutline;
        ctx.fill();
        ctx.restore();

        // 2. Beveled metallic gold border frame
        drawRoundedRect(ctx, x - 3, y - 3, barW + 6, barH + 6, radius + 3);
        const frameGrad = ctx.createLinearGradient(x, y - 3, x, y + barH + 3);
        frameGrad.addColorStop(0, '#FFF078');
        frameGrad.addColorStop(0.5, '#E08E00');
        frameGrad.addColorStop(1, '#7A4400');
        ctx.fillStyle = frameGrad;
        ctx.fill();

        ctx.lineWidth = 2.5;
        ctx.strokeStyle = CONFIG.palette.navyOutline;
        ctx.stroke();

        // 3. Recessed dark-navy inner trough
        drawRoundedRect(ctx, x, y, barW, barH, radius);
        const troughGrad = ctx.createLinearGradient(x, y, x, y + barH);
        troughGrad.addColorStop(0, '#040D21');
        troughGrad.addColorStop(0.45, '#091B40');
        troughGrad.addColorStop(1, '#0D2657');
        ctx.fillStyle = troughGrad;
        ctx.fill();

        // 4. Clipped golden liquid fill
        ctx.save();
        drawRoundedRect(ctx, x + 1.5, y + 1.5, barW - 3, barH - 3, radius - 1.5);
        ctx.clip();

        const fillW = Math.max(0, (barW - 3) * progress);
        if (fillW > 0) {
          const fillGrad = ctx.createLinearGradient(x, y, x, y + barH);
          fillGrad.addColorStop(0, '#FFF176');
          fillGrad.addColorStop(0.42, '#FFBE0B');
          fillGrad.addColorStop(0.85, '#E87A00');
          fillGrad.addColorStop(1, '#C96200');

          ctx.fillStyle = fillGrad;
          ctx.fillRect(x + 1.5, y + 1.5, fillW, barH - 3);

          // Animated diagonal shimmer stripes moving across the golden liquid
          ctx.save();
          ctx.beginPath();
          ctx.rect(x + 1.5, y + 1.5, fillW, barH - 3);
          ctx.clip();

          const stripeSpacing = 26;
          const stripeOffset = (time * 42) % stripeSpacing;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
          for (let sx = x - barH + stripeOffset; sx < x + fillW + barH; sx += stripeSpacing) {
            ctx.beginPath();
            ctx.moveTo(sx, y + barH);
            ctx.lineTo(sx + barH * 0.7, y);
            ctx.lineTo(sx + barH * 0.7 + 10, y);
            ctx.lineTo(sx + 10, y + barH);
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();

          // Top glossy white specular highlight strip
          const specGrad = ctx.createLinearGradient(x, y + 2, x, y + barH * 0.46);
          specGrad.addColorStop(0, 'rgba(255, 255, 255, 0.68)');
          specGrad.addColorStop(1, 'rgba(255, 255, 255, 0.05)');
          ctx.fillStyle = specGrad;
          drawRoundedRect(ctx, x + 4, y + 2.5, Math.max(0, fillW - 5), barH * 0.36, barH * 0.18);
          ctx.fill();

          // Glowing leading edge flare while actively filling
          if (progress > 0.02 && progress < 0.995) {
            const tipX = x + 1.5 + fillW;
            const flareGrad = ctx.createRadialGradient(tipX, cy, 1, tipX, cy, barH * 0.75);
            flareGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
            flareGrad.addColorStop(0.45, 'rgba(255, 240, 120, 0.55)');
            flareGrad.addColorStop(1, 'rgba(255, 190, 11, 0)');
            ctx.fillStyle = flareGrad;
            ctx.beginPath();
            ctx.arc(tipX, cy, barH * 0.75, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Subtle inner top shadow for recessed depth
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.lineWidth = 3;
        drawRoundedRect(ctx, x + 1, y + 1, barW - 2, barH - 2, radius - 1);
        ctx.stroke();
        ctx.restore();

        // 5. Crisp centered percentage readout with dark outline
        const pctText = `${Math.round(progress * 100)}%`;
        ctx.font = `700 ${Math.max(14, Math.round(barH * 0.56))}px Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 4.5;
        ctx.strokeStyle = CONFIG.palette.navyOutline;
        ctx.strokeText(pctText, cx, cy + 1);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(pctText, cx, cy + 1);

        ctx.restore();
      }



  let progress = 0, frameId = 0;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const start = performance.now();
  function resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(host.clientWidth * dpr);
    canvas.height = Math.round(host.clientHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function frame(now: number): void {
    const time = reduced.matches ? 0 : (now - start) / 1000;
    const w = host.clientWidth, h = host.clientHeight, cx = w / 2;
    const scale = Math.min(1.12, w / 690, h / 680), crestY = h * .40;
    const barY = crestY + 144 * scale + 28;
    drawBackground(ctx, w, h, crestY, time);
    drawCrest(ctx, cx, crestY - 12 * scale, scale, time);
    drawLogo(ctx, cx, crestY + 12 * scale, scale, time);
    drawProgressBar(ctx, cx, barY, Math.min(440, w * .82), w < 520 ? 26 : 30, progress, time);
    ctx.font = '12px Arial'; ctx.textAlign = 'center'; ctx.fillStyle = '#a9bddc';
    const lines = wrapTextLines(ctx, CONFIG.disclaimer, w - 40);
    lines.forEach((line, i) => ctx.fillText(line, cx, h - 24 - (lines.length - 1 - i) * 16));
    frameId = requestAnimationFrame(frame);
  }
  resize(); window.addEventListener('resize', resize);
  frameId = requestAnimationFrame(frame);
  return {
    setProgress: (p) => { progress = Math.max(0, Math.min(1, p)); },
    dispose: () => { cancelAnimationFrame(frameId); window.removeEventListener('resize', resize); },
  };
}

export class UI {
  root = document.getElementById('ui')!;
  village = el('div', 'hud');
  resEls: Record<ResourceId, { val: HTMLElement; fill: HTMLElement; cap: HTMLElement; ic: HTMLElement }> = {} as never;
  buildersEl!: HTMLElement;
  trophyEl!: HTMLElement;
  profileCard!: HTMLButtonElement;
  private profileHudSig = "";
  chipsEl!: HTMLElement;
  selPanel!: HTMLElement;
  placePanel!: HTMLElement;
  /** Touch placing: ✔ / ✖ that float above the ghost. */
  placeFloat!: HTMLElement;
  private placeOkBtn!: HTMLButtonElement;
  bottomLeft!: HTMLElement;
  bottomRight!: HTMLElement;
  sideRight!: HTMLElement;
  toasts = el('div');
  editorHud = el('div', 'hud hidden');
  private visitHud: HTMLElement | null = null;
  private visitSel: HTMLElement | null = null;
  modalBack: HTMLElement | null = null;
  refreshModal: (() => void) | null = null;
  private lastSelId = -2;
  private chipSig = '';
  private lastSelSig = '';
  private tick = 0;
  private buildersSig = '';
  /** Set at start-up when this browser hasn't seen the newest What's New entry yet. */
  whatsNewPending = false;

  constructor(public game: Game) {
    this.toasts.id = 'toasts';
    document.body.appendChild(this.toasts);
    this.root.appendChild(this.village);
    this.buildVillageHud();
    this.root.appendChild(this.editorHud);
    for (const ev of ['selection', 'mode', 'changed'] as const) bus.on(ev, () => this.renderEditor());
    bus.on('toast', (d: { text: string; kind: 'info' | 'good' | 'bad' | 'event' }) => this.toast(d.text, d.kind));
    bus.on('selection', () => this.renderSelection(true));
    bus.on('mode', () => this.renderSelection(true));
    bus.on('changed', () => this.renderSelection(true));
    bus.on('buildingDone', () => this.renderSelection(true));
  }

  get state() {
    return this.game.state;
  }

  // ---------- Toasts & banners ----------
  toast(text: string, kind: 'info' | 'good' | 'bad' | 'event' = 'info', ms = 2600): void {
    const t = el('div', `toast ${kind} stroke`, text);
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 3) this.toasts.firstChild?.remove();
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 350);
    }, ms + (kind === 'event' ? 2500 : 0));
  }

  banner(text: string, color = '#fff'): void {
    const b = el('div', 'banner stroke', text);
    b.style.color = color;
    document.body.appendChild(b);
    setTimeout(() => b.remove(), 2300);
  }

  // ---------- Village HUD ----------
  private buildVillageHud(): void {
    const v = this.village;
    // resources
    const stack = el('div', 'res-stack');
    for (const r of ['tuition', 'coffee', 'chapel'] as ResourceId[]) {
      const bar = el('div', 'resbar');
      bar.dataset.resource = r;
      bar.title = resName(r);
      const track = el('div', 'track');
      const fill = el('div', 'fill');
      fill.style.background = RES_COLORS[r];
      track.appendChild(fill);
      const ic = el('span', 'ic', ICONS[r]);
      ic.style.width = ic.style.height = '36px';
      // value and maximum sit together inside the bar, so neither can be clipped by the screen edge
      const nums = el('div', 'nums');
      const val = el('div', 'val stroke', '0');
      const cap = el('div', 'cap', '');
      nums.append(val, cap);
      bar.append(track, ic, nums);
      stack.appendChild(bar);
      this.resEls[r] = { val, fill, cap, ic };
    }
    v.appendChild(stack);

    this.buildersEl = el('div', 'builders stroke');
    this.buildersEl.title = 'Facilities Crew (builders). Click to see new buildings, upgrades and research.';
    this.buildersEl.setAttribute('role', 'button');
    this.buildersEl.tabIndex = 0;
    const openList = (): void => {
      sfx('click');
      this.openUpgrades();
    };
    this.buildersEl.onclick = openList;
    this.buildersEl.onkeydown = (e) => {
      if (e.key === 'Enter') openList();
    };
    v.appendChild(this.buildersEl);

    const prof = el('div', 'profile');
    this.profileCard = el('button', 'player-hud-card');
    this.profileCard.setAttribute('aria-label', 'Open player profile');
    this.profileCard.onclick = () => { sfx('click'); this.openProfile(); };
    this.trophyEl = el('button', 'trophy-box');
    this.trophyEl.setAttribute('aria-label', 'Open League Ladder');
    this.trophyEl.onclick = () => this.openLeagues();
    this.chipsEl = el('div', 'event-chips');
    prof.append(this.profileCard, this.trophyEl, this.chipsEl);
    v.appendChild(prof);

    this.bottomLeft = el('div', 'bottom-left');
    const atk = el('button', 'btn campus-control attack-btn', campusControlArt('attack'));
    atk.setAttribute('aria-label', 'Attack!');
    atk.onclick = () => {
      sfx('click');
      this.openAttack();
    };
    this.bottomLeft.appendChild(atk);
    v.appendChild(this.bottomLeft);

    this.bottomRight = el('div', 'bottom-right');
    const army = el('button', 'btn campus-control army-control', campusControlArt('army'));
    army.setAttribute('aria-label', 'Army');
    army.appendChild(armyControlPortraits());
    army.onclick = () => {
      sfx('click');
      this.openArmy();
    };
    const shop = el('button', 'btn campus-control shop-control', campusControlArt('shop'));
    shop.setAttribute('aria-label', 'Shop');
    shop.onclick = () => {
      sfx('click');
      this.openShop();
    };
    this.bottomRight.append(army, shop);
    v.appendChild(this.bottomRight);

    this.sideRight = el('div', 'side-right');
    const mk = (ic: string, title: string, fn: () => void, cls = 'blue', parent = this.sideRight): HTMLButtonElement => {
      const b = el('button', `btn round ${cls}`, icon(ic, 32));
      b.title = title;
      b.onclick = () => {
        sfx('click');
        fn();
      };
      parent.appendChild(b);
      return b;
    };
    mk('gear', 'Settings & Debug', () => this.openSettings(), 'gray');
    const collectAll = mk('tuition', 'Collect all', () => this.game.village.collectAll(), 'green');
    collectAll.classList.remove('green');
    const shortcuts = el('div', 'side-shortcuts-menu');
    shortcuts.id = 'campus-shortcuts';
    shortcuts.hidden = true;
    shortcuts.setAttribute('role', 'group');
    shortcuts.setAttribute('aria-label', 'Additional campus shortcuts');
    const toggle = mk('chevronDown', 'Expand campus shortcuts', () => {
      shortcuts.hidden = !shortcuts.hidden;
      toggle.setAttribute('aria-expanded', String(!shortcuts.hidden));
      toggle.title = shortcuts.hidden ? 'Expand campus shortcuts' : 'Collapse campus shortcuts';
      toggle.setAttribute('aria-label', toggle.title);
    });
    toggle.classList.add('side-shortcuts-toggle');
    toggle.setAttribute('aria-controls', shortcuts.id);
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', toggle.title);
    this.sideRight.appendChild(shortcuts);
    mk('medal', 'Achievements', () => this.openAchievements(), 'gold', shortcuts);
    // The leaderboard lives on the server, so it only exists when playing online.
    if (this.game.online) mk('trophy', 'Leaderboard', () => void this.openLeaderboard(), 'blue', shortcuts);
    if (this.game.online) {
      const log = mk('', 'Raid log & replays', () => void this.openReplays(), 'blue', shortcuts);
      log.innerHTML = '<span style="font-size:26px">🎬</span>';
    }
    mk('chapel', 'Chapel', () => this.openChapel(), 'blue chapel-control', shortcuts);
    const lay = mk('', 'Base layouts', () => this.openLayouts(), 'blue', shortcuts);
    lay.innerHTML = '<span style="font-size:26px">🗺️</span>';
    const snd = mk(isMuted() ? 'mute' : 'sound', 'Toggle sound', () => {
      setMuted(!isMuted());
      this.state.settings.muted = isMuted();
      snd.innerHTML = icon(isMuted() ? 'mute' : 'sound', 32);
    }, 'gray', shortcuts);
    v.appendChild(this.sideRight);

    this.selPanel = el('div', 'sel-panel hidden');
    v.appendChild(this.selPanel);
    this.placePanel = el('div', 'place-panel hidden');
    v.appendChild(this.placePanel);
    this.buildPlaceFloat();
  }

  showVillage(show: boolean): void {
    this.village.classList.toggle('hidden', !show);
  }

  resourceAnchor(r: ResourceId): { x: number; y: number } {
    const rect = this.resEls[r].ic.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  bumpResource(r: ResourceId): void {
    const ic = this.resEls[r].ic;
    ic.classList.add('bump');
    setTimeout(() => ic.classList.remove('bump'), 150);
  }

  update(): void {
    this.updatePlaceFloat();
    this.tick++;
    if (this.tick % 6 !== 0) return; // ~10 Hz
    const s = this.state;
    const cp = caps(s);
    for (const r of ['tuition', 'coffee', 'chapel'] as ResourceId[]) {
      const e = this.resEls[r];
      e.val.textContent = fmt(s.resources[r]);
      e.cap.textContent = `/ ${fmt(cp[r])}`;
      e.fill.style.width = `${Math.min(100, (s.resources[r] / Math.max(1, cp[r])) * 100)}%`;
    }
    const bl = builders(s);
    // Rewritten only when it changes, so a click on it is never lost to a re-render.
    const ups = listUpgrades(s).count;
    const bsig = `${bl.total - bl.busy}/${bl.total}:${ups}`;
    if (bsig !== this.buildersSig) {
      this.buildersSig = bsig;
      this.buildersEl.innerHTML = `${icon('builder', 30)}<div>${bl.total - bl.busy}/${bl.total}<small>Facilities Crew</small></div>${ups > 0 ? `<span class="up-badge" title="${ups} upgrade${ups === 1 ? '' : 's'} available">${ups}</span>` : ''}`;
    }
    this.renderPlayerHud();
    // event chips (rebuild only when the set of events changes; otherwise just update timers)
    const active = s.events.filter((e) => e.end > s.clock);
    const sig = active.map((e) => e.type).join(',');
    if (sig !== this.chipSig) {
      this.chipSig = sig;
      this.chipsEl.innerHTML = '';
      for (const e of active) {
        const info = EVENT_INFO[e.type];
        const ic = e.type === 'ringbyspring' ? icon('ring', 20) : info.icon;
        const chip = el('div', `chip stroke ${e.type === 'ringbyspring' ? 'ring' : ''}`, `${ic} ${info.name}<span class="tl"></span>`);
        chip.title = info.desc;
        this.chipsEl.appendChild(chip);
      }
    }
    active.forEach((e, i) => {
      const tl = this.chipsEl.children[i]?.querySelector('.tl');
      const left = e.end - s.clock;
      if (tl) tl.textContent = left < 3000 ? ` · ${fmtTime(left)}` : '';
    });
    this.renderSelection(false);
    if (this.refreshModal && this.tick % 12 === 0) this.refreshModal();
    // Wait for any other start-up popup (welcome back, raided, chapel) to be closed first.
    if (this.whatsNewPending && !this.isModalOpen()) {
      this.whatsNewPending = false;
      this.openWhatsNew(seenChange());
    }
  }

  // ---------- Touch placing buttons ----------
  private buildPlaceFloat(): void {
    const f = el('div', 'place-float hidden');
    const ok = el('button', 'btn round green', '✔') as HTMLButtonElement;
    ok.setAttribute('aria-label', 'Place here');
    const no = el('button', 'btn round red', '✖');
    no.setAttribute('aria-label', 'Cancel');
    const scene = (): VillageScene | null => {
      const sc = this.game.scene;
      return sc === this.game.village || sc === this.game.editor ? (sc as VillageScene) : null;
    };
    ok.onclick = () => scene()?.confirmPlace();
    no.onclick = () => {
      sfx('click');
      scene()?.cancelMode();
    };
    f.append(no, ok);
    this.root.appendChild(f);
    this.placeFloat = f;
    this.placeOkBtn = ok;
  }

  /** Runs every frame: keeps the touch ✔ / ✖ just above the placing ghost. */
  private updatePlaceFloat(): void {
    const f = this.placeFloat;
    if (!f) return;
    const sc = this.game.scene;
    const vs = sc === this.game.village || sc === this.game.editor ? (sc as VillageScene) : null;
    const box = touchMode && !this.isModalOpen() ? vs?.ghostBox() : null;
    if (!box || !vs) {
      f.classList.add('hidden');
      return;
    }
    f.classList.remove('hidden');
    const w = f.offsetWidth || 130;
    const h = f.offsetHeight || 60;
    const x = Math.min(Math.max(box.x - w / 2, 8), window.innerWidth - w - 8);
    // Above the ghost; below it when there's no room above, so it never covers it.
    let y = box.top - h - 6;
    if (y < 8) y = box.bottom + 10;
    y = Math.min(Math.max(y, 8), window.innerHeight - h - 8);
    f.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    this.placeOkBtn.classList.toggle('gray', !vs.placingOk());
  }

  // ---------- Selection panel ----------
  renderSelection(force: boolean): void {
    const vs = this.game.village;
    const mode = vs.mode.kind;
    if (mode === 'placing') {
      this.selPanel.classList.add('hidden');
      const sig = `placing:${vs.mode.kind === 'placing' ? vs.mode.type : ''}:${touchMode}`;
      if (!force && this.lastSelSig === sig) return;
      this.lastSelSig = sig;
      this.placePanel.classList.remove('hidden');
      this.placePanel.innerHTML = '';
      const type = vs.mode.kind === 'placing' ? vs.mode.type : 'wall';
      if (touchMode) {
        // The ✔ / ✖ float above the ghost; here just say how it works.
        this.placePanel.append(el('div', 'hint stroke', `Placing ${BUILDINGS[type].name}: drag it into place, then tap ✔.`));
        return;
      }
      const hint = el('div', 'hint stroke', `Placing ${BUILDINGS[type].name}: move the mouse, click to place. <kbd>Esc</kbd> cancels.`);
      const ok = el('button', 'btn', '✔ Place');
      ok.onclick = () => vs.confirmPlace();
      const no = el('button', 'btn red', '✖ Cancel');
      no.onclick = () => vs.cancelMode();
      this.placePanel.append(hint, ok, no);
      return;
    }
    this.placePanel.classList.add('hidden');
    const b = vs.selected();
    if (!b || mode === 'moving') {
      this.selPanel.classList.add('hidden');
      this.lastSelId = -1;
      this.lastSelSig = '';
      return;
    }
    const s = this.state;
    const sig = `${b.id}:${b.level}:${!!b.upgrade}:${b.upgrade ? finishNowCost(s, b) : 0}:${Math.floor(s.resources.tuition / 50)}:${Math.floor(s.resources.coffee / 50)}:${s.resources.chapel}:${builders(s).busy}:${Math.floor(b.stored ?? 0) > 0}:${b.mode ?? ''}`;
    if (!force && sig === this.lastSelSig) return;
    const animate = this.lastSelId !== b.id;
    this.lastSelId = b.id;
    this.lastSelSig = sig;
    const p = this.selPanel;
    p.innerHTML = '';
    p.classList.remove('hidden');
    if (animate) {
      p.style.animation = 'none';
      void p.offsetWidth;
      p.style.animation = '';
    }
    const def = BUILDINGS[b.type];
    p.appendChild(el('div', 'sel-title stroke', `${b.name ?? def.name} <small>${b.level === 0 ? '(under construction)' : 'Level ' + b.level}</small>`));
    const row = el('div', 'sel-buttons');
    const btn = (label: string, ic: string | HTMLElement, cls: string, fn: () => void, extra = ''): void => {
      const e = el('button', `btn square ${cls}`, `${typeof ic === 'string' ? ic : ''}<span>${label}</span>${extra}`);
      if (typeof ic !== 'string') e.prepend(ic);
      e.onclick = () => {
        sfx('click');
        fn();
      };
      row.appendChild(e);
    };
    btn('Info', buildingInfoButtonArt(), 'blue info-action', () => this.openInfo(b));
    if (b.upgrade) {
      const c = finishNowCost(s, b);
      btn('Finish', icon('clock', 30), 'purple', () => {
        const err = this.game.act({ k: 'finish', id: b.id }).err;
        if (err) {
          this.toast(err, 'bad');
          sfx('error');
        }
      }, `<span class="cost">${icon('chapel', 14)}${c}</span>`);
    } else {
      const n = nextLevelInfo(s, b);
      if (n) {
        // Walls can be paid for with either Tuition or Coffee: one button each.
        const opts = upgradeResOptions(b);
        for (const res of opts) {
          const err = upgradeCheck(s, b, res);
          btn(
            'Upgrade',
            `<span style="font-size:28px">⬆️</span>`,
            err ? 'gray' : 'gold',
            () => {
              const e2 = this.game.act(opts.length > 1 ? { k: 'upgrade', id: b.id, res } : { k: 'upgrade', id: b.id }).err;
              if (e2) {
                this.toast(e2, 'bad');
                sfx('error');
              } else {
                sfx('build');
                vs.pop(b.id);
                this.renderSelection(true);
              }
            },
            `<span class="cost">${icon(res, 14)}${fmt(n.cost)}</span>`,
          );
        }
      }
    }
    if ((b.type === 'admissions' || b.type === 'coffeecart') && b.level >= 1) {
      btn('Collect', icon(b.type === 'admissions' ? 'tuition' : 'coffee', 34), 'green', () => vs.doCollect(b));
    }
    if (['reshall', 'biblical', 'callan', 'ens', 'health', 'business', 'music'].includes(b.type)) btn('Train', this.campusMenuIcon('army'), 'blue', () => this.openArmy());
    if (b.type === 'ssc' && b.level >= 1) btn('Brew', `<span style="font-size:28px">🧪</span>`, 'purple', () => this.openArmy());
    if (b.type === 'library' && b.level >= 1) btn('Research', `<span style="font-size:28px">📚</span>`, 'blue', () => this.openLibrary());
    if (b.type === 'faculty' && b.level >= 1) btn('Prof', `<span style="font-size:28px">🎓</span>`, 'gold', () => this.openHero('prof'));
    if (b.type === 'presidents' && b.level >= 1) btn('President', `<span style="font-size:28px">🏛️</span>`, 'gold', () => this.openHero('president'));
    if (b.type === 'stinger') {
      const multi = b.mode === 'multi';
      btn(multi ? 'Multi' : 'Single', `<span style="font-size:28px">${multi ? '🔱' : '🎯'}</span>`, multi ? 'purple' : 'blue', () => {
        const next = multi ? 'single' : 'multi';
        const e2 = this.game.act({ k: 'beamMode', id: b.id, mode: next }).err;
        if (e2) {
          this.toast(e2, 'bad');
          sfx('error');
          return;
        }
        this.toast(next === 'multi' ? 'Multi mode: beams several raiders at once, no ramp-up.' : 'Single mode: one beam that ramps up the longer it holds.');
        this.renderSelection(true);
      });
    }
    if (b.type === 'dmc') btn('Chapel', icon('chapel', 34), 'blue chapel-control', () => this.openChapel());
    if (def.removable) btn('Remove', `<span style="font-size:28px">🗑️</span>`, 'red', () => vs.removeSelected());
    p.appendChild(row);
  }

  // ---------- Modals ----------
  modal(title: string, opts: { narrow?: boolean; tabs?: { id: string; label: string }[]; activeTab?: string; onTab?: (id: string) => void; headIcon?: string; headNode?: HTMLElement; className?: string; closeArt?: string } = {}): { body: HTMLElement; close: () => void; setTitle: (t: string) => void } {
    this.closeModal();
    const back = el('div', 'modal-back');
    const m = el('div', `modal ${opts.narrow ? 'narrow' : ''} ${opts.className ?? ''}`);
    const head = el('div', 'modal-head');
    const h2 = el('h2', 'stroke', title);
    if (opts.headNode) head.appendChild(opts.headNode);
    else if (opts.headIcon) head.appendChild(el('span', '', opts.headIcon));
    head.appendChild(h2);
    const x = el('button', 'btn red modal-close', opts.closeArt ?? leagueCloseArt());
    x.setAttribute('aria-label', 'Close dialog');
    head.appendChild(x);
    m.appendChild(head);
    if (opts.tabs) {
      const tabs = el('div', 'tabs');
      for (const t of opts.tabs) {
        const tb = el('button', `tab ${t.id === opts.activeTab ? 'active' : ''}`, t.label);
        tb.onclick = () => {
          sfx('click');
          tabs.querySelectorAll('.tab').forEach((q) => q.classList.remove('active'));
          tb.classList.add('active');
          opts.onTab?.(t.id);
        };
        tabs.appendChild(tb);
      }
      m.appendChild(tabs);
    }
    const body = el('div', 'modal-body');
    m.appendChild(body);
    back.appendChild(m);
    const close = (): void => this.closeModal();
    x.onclick = () => {
      sfx('click');
      close();
    };
    back.addEventListener('mousedown', (e) => {
      if (e.target === back) close();
    });
    document.body.appendChild(back);
    this.modalBack = back;
    return { body, close, setTitle: (t) => (h2.innerHTML = t) };
  }

  closeModal(): void {
    this.modalBack?.remove();
    this.modalBack = null;
    this.refreshModal = null;
  }

  isModalOpen(): boolean {
    return !!this.modalBack;
  }

  private campusMenuIcon(kind: 'army' | 'shop'): HTMLElement {
    const node = el('span', 'campus-menu-icon', campusControlArt(kind));
    node.setAttribute('aria-hidden', 'true');
    if (kind === 'army') node.appendChild(armyControlPortraits());
    return node;
  }

  // ---------- Shop ----------
  openShop(tab = 'resource'): void {
    const m = this.modal('Campus Shop', {
      tabs: SHOP_TABS.map((t) => ({ id: t.id, label: t.label })),
      activeTab: tab,
      onTab: (id) => render(id),
      headNode: this.campusMenuIcon('shop'),
    });
    const render = (id: string): void => {
      const s = this.state;
      const dl = dmcLevel(s);
      m.body.innerHTML = '';
      const grid = el('div', 'cards');
      const tabDef = SHOP_TABS.find((t) => t.id === id)!;
      for (const type of tabDef.types) {
        const def = BUILDINGS[type];
        const n = countOf(s, type);
        const max = maxCount(type, dl);
        const L = def.levels[0];
        const err = buildCheck(s, type);
        const locked = max === 0;
        const card = el('div', `card ${locked ? 'locked' : ''}`);
        card.appendChild(buildingThumb(type, 1));
        card.appendChild(el('div', 'name', def.name));
        card.appendChild(el('div', 'count', `${n}/${max}`));
        if (locked) {
          card.appendChild(el('div', 'meta', `🔒 Unlocks at DMC ${def.counts.findIndex((c) => c > 0)}`));
        } else {
          card.appendChild(el('div', 'meta', L.time > 0 ? `⏱ ${fmtTime(L.time)}` : 'Instant'));
          card.appendChild(el('div', '', costHtml(L.res, L.cost, canAfford(s, L.res, L.cost))));
        }
        card.title = `${def.desc}\n\n"${def.flavor}"`;
        card.onclick = () => {
          if (err) {
            this.toast(err, 'bad');
            sfx('error');
            return;
          }
          sfx('click');
          this.closeModal();
          this.game.village.startPlacing(type);
        };
        grid.appendChild(card);
      }
      m.body.appendChild(grid);
      m.body.appendChild(el('p', 'flavor', 'Hover a card for the official (and unofficial) description.'));
    };
    render(tab);
  }

  // ---------- Info ----------
  openInfo(b: BuildingInst): void {
    const def = BUILDINGS[b.type];
    const m = this.modal(`${b.name ?? def.name} <small>Lv ${b.level}</small>`, { narrow: true });
    const s = this.state;
    const row = el('div', 'row');
    row.appendChild(buildingThumb(b.type, Math.max(1, b.level), 160, 140));
    const col = el('div', 'col');
    col.appendChild(el('div', '', def.desc));
    col.appendChild(el('div', 'flavor', `"${def.flavor}"`));
    row.appendChild(col);
    m.body.appendChild(row);
    const cur = def.levels[Math.max(0, b.level - 1)];
    const nxt = def.levels[b.level];
    const t = el('table', 'stats-table');
    const add = (k: string, v: string | number | undefined, n?: string | number | undefined): void => {
      if (v === undefined) return;
      const nv = n !== undefined && n !== v ? ` <span class="next">→ ${n}</span>` : '';
      t.innerHTML += `<tr><td>${k}</td><td>${v}${nv}</td></tr>`;
    };
    add('Hitpoints', cur.hp, nxt?.hp);
    if (cur.rate) add('Production', `${cur.rate}/min`, nxt?.rate ? `${nxt.rate}/min` : undefined);
    if (cur.capacity) add('Capacity', fmt(cur.capacity), nxt?.capacity ? fmt(nxt.capacity) : undefined);
    if (cur.housing) add('Troop housing', cur.housing, nxt?.housing);
    if (cur.defense) {
      const d = cur.defense;
      const nd = nxt?.defense;
      if (d.ramp && b.mode === 'multi') {
        add('Mode', 'Multi (switch it from the building menu)');
        add('Beams', d.multiTargets, nd?.multiTargets);
        add('Beam dmg/sec (each)', d.multiDps, nd?.multiDps);
      } else if (d.ramp) {
        if (b.type === 'stinger') add('Mode', 'Single (switch it from the building menu)');
        add('Beam dmg/sec (ramps)', d.ramp.join(' / '), nd?.ramp?.join(' / '));
      } else if (d.lobTime) add('Damage per tray (centre)', Math.round(d.dps * d.rate), nd ? Math.round(nd.dps * nd.rate) : undefined);
      else add('Damage/sec', d.dps, nd?.dps);
      if (d.minRange) add('Range', `${d.minRange}–${d.range} tiles (blind spot up close)`, nd ? `${nd.minRange}–${nd.range} tiles` : undefined);
      else add('Range', `${d.range} tiles`, nd ? `${nd.range} tiles` : undefined);
      if (d.lobTime) add('Fires every', `${d.rate}s`, nd ? `${nd.rate}s` : undefined);
      if (d.splash) add('Splash radius', d.splash, nd?.splash);
      if (d.knockback) add('Knockback', `${d.knockback} tiles`, nd?.knockback ? `${nd.knockback} tiles` : undefined);
      if (d.chain) {
        add('Damage per summons', Math.round(d.dps * d.rate), nd ? Math.round(nd.dps * nd.rate) : undefined);
        add('Jumps to', `${d.chain} more raiders`, nd?.chain ? `${nd.chain} more` : undefined);
        add('Each jump', `${Math.round((d.chainFalloff ?? 0.75) * 100)}% of the last, up to ${d.chainRange} tiles away`);
      }
      if (d.slow) add('Slow', `${Math.round(d.slow * 100)}%`);
      if (d.freezeCharge) add('Freeze every', `${d.freezeCharge}s`, nd?.freezeCharge ? `${nd.freezeCharge}s` : undefined);
      if (d.blessHeal !== undefined) add('Wall blessing', d.blessHeal ? `${(d.blessHeal * 100).toFixed(1)}%/s` : 'Lv3+', nd?.blessHeal ? `${(nd.blessHeal * 100).toFixed(1)}%/s` : undefined);
    }
    if (cur.fans) add('Reinforcement fans', cur.fans, nxt?.fans);
    if (cur.trapDps) add('Swarm dmg/sec', cur.trapDps, nxt?.trapDps);
    if (cur.swingDmg) {
      add('Arm swing damage (once)', cur.swingDmg, nxt?.swingDmg);
      add('Knockback', `${cur.swingKnock} tiles`, nxt?.swingKnock ? `${nxt.swingKnock} tiles` : undefined);
    }
    if (cur.trapStun) {
      add('Stands raiders outside for', `${cur.trapStun}s`, nxt?.trapStun ? `${nxt.trapStun}s` : undefined);
      add('Files them out', `${cur.trapPush} tiles`, nxt?.trapPush ? `${nxt.trapPush} tiles` : undefined);
      add('Alarm radius', `${cur.trapRadius} tiles`, nxt?.trapRadius ? `${nxt.trapRadius} tiles` : undefined);
    }
    if (def.trains) add('Trains', def.trains.map((x) => TROOPS[x].name).join(', '));
    const maxL = maxLevelForDmc(b.type, dmcLevel(s));
    add('Max level (current DMC)', `${maxL} / ${def.levels.length}`);
    m.body.appendChild(t);
  }

  // ---------- Army ----------
  openArmy(): void {
    let tab = 'train';
    let editing: { slot: number; draft: SavedArmy } | null = null;
    let updateEditor: (() => void) | null = null;
    const m = this.modal('Army Training', {
      headNode: this.campusMenuIcon('army'),
      tabs: [{ id: 'train', label: 'Train & Brew' }, { id: 'quick', label: 'Quick Train' }],
      activeTab: tab,
      onTab: (id) => { stopHold(); tab = id; editing = null; m.body.scrollTop = 0; render(true); },
    });
    const heroTypes = ['prof', 'president'] as HeroType[];
    let sig = '';
    let ticks: (() => void)[] = [];
    const fail = (err: string): void => {
      this.toast(err, 'bad');
      sfx('error');
    };
    // Everything here acts on press, not on click: the screen is rebuilt whenever a troop
    // finishes, and a click whose press and release straddle a rebuild would be lost.
    const press =
      (fn: () => void) =>
      (e: PointerEvent): void => {
        if (e.button === 0) fn();
      };
    const tryTrain = (t: TroopType): boolean => {
      const err = this.game.act({ k: 'train', type: t }).err;
      if (err) fail(err);
      else sfx('deploy');
      render();
      return !err;
    };
    // Press and hold a troop to keep recruiting. The cards are rebuilt as the queue changes,
    // so the hold lives here and is ended by window-level events, not by the card's own.
    let hold: { type: TroopType; timer: number } | null = null;
    const stopHold = (): void => {
      if (hold) clearTimeout(hold.timer);
      hold = null;
      window.removeEventListener('pointerup', stopHold);
      window.removeEventListener('pointercancel', stopHold);
      window.removeEventListener('blur', stopHold);
      window.removeEventListener('pointermove', holdMove);
    };
    const holdMove = (e: PointerEvent): void => {
      const over = (e.target as Element | null)?.closest?.('[data-troop]') as HTMLElement | null;
      if (!hold || over?.dataset.troop !== hold.type) stopHold();
    };
    const startHold = (t: TroopType): void => {
      stopHold();
      if (!tryTrain(t)) return;
      const again = (): void => {
        if (!hold || !m.body.isConnected || !tryTrain(t)) return stopHold();
        hold.timer = window.setTimeout(again, 110);
      };
      hold = { type: t, timer: window.setTimeout(again, 400) };
      window.addEventListener('pointerup', stopHold);
      window.addEventListener('pointercancel', stopHold);
      window.addEventListener('blur', stopHold);
      window.addEventListener('pointermove', holdMove);
    };
    /** Cancels the last troop of a run. The run is looked up again at click time, counted from the end. */
    const cancelOne = (runFromEnd: number, type: TroopType): void => {
      const s = this.state;
      const runs = queueRuns(s);
      const r = runs[runs.length - 1 - runFromEnd];
      if (r && r.type === type) {
        const idx = r.start + r.count - 1;
        const err = this.game.act({ k: 'cancelTrain', idx, back: s.trainQueue.length - 1 - idx, type }).err;
        if (err) fail(err);
        else sfx('click');
      }
      render(true);
    };

    const editArmy = (slot: number): void => {
      const saved = this.state.savedArmies[slot];
      editing = { slot, draft: saved ? JSON.parse(JSON.stringify(saved)) : { name: `Army ${slot + 1}`, troops: {}, spells: {} } };
      m.body.scrollTop = 0;
      render(true);
    };
    const renderQuick = (): void => {
      const s = this.state;
      const button = (label: string, cls: string, fn: () => void): HTMLButtonElement => {
        const b = el('button', `btn ${cls}`, label);
        b.onclick = () => { sfx('click'); fn(); };
        return b;
      };
      const metrics = (p: SavedArmy): string => {
        const s = this.state;
        const t = savedArmyTotals(s, p);
        return `<span>🏠 ${t.housing}/${armyCapacity(s)}</span><span>🧪 ${t.spells}/${spellCapacity(s)}</span><span>⏱ ~${fmtTime(t.seconds)}</span>`;
      };
      const costs = (p: SavedArmy): string => {
        const s = this.state;
        const totals = savedArmyTotals(s, p);
        return (['tuition', 'coffee', 'chapel'] as ResourceId[]).filter((r) => totals.cost[r] > 0).map((r) => costHtml(r, totals.cost[r], canAfford(s, r, totals.cost[r]))).join(' ') || 'No cost';
      };
      m.body.appendChild(el('p', 'quick-intro', 'Your favorite armies, ready to recruit. Train queues one full copy without replacing your current troops.'));
      const availability = el('p', 'quick-availability');
      const updateAvailability = (): void => {
        const s = this.state;
        const troopRoom = Math.max(0, armyCapacity(s) * ARMIES - armyUsed(s) - queueUsed(s));
        const spellRoom = Math.max(0, spellCapacity(s) - spellsUsed(s));
        availability.textContent = `Space available now: ${troopRoom} troop housing (including reserve) · ${spellRoom} spell space. Already trained and queued units count toward these limits.`;
      };
      updateAvailability();
      m.body.appendChild(availability);
      if (editing) {
        const { slot, draft } = editing;
        const editor = el('div', 'quick-editor');
        const nameLabel = el('label', 'quick-name-label', 'Army name');
        const name = el('input', 'quick-name');
        name.value = draft.name;
        name.maxLength = MAX_NAME_LEN;
        name.oninput = () => { draft.name = name.value; update(); };
        nameLabel.appendChild(name);
        editor.appendChild(nameLabel);
        editor.appendChild(button('Copy current army', 'small gray', () => {
          draft.troops = { ...this.state.army };
          draft.spells = { ...this.state.spells };
          for (const q of this.state.spellQueue) draft.spells[q.type] = (draft.spells[q.type] ?? 0) + 1;
          render(true);
        }));
        editor.appendChild(el('p', 'flavor', 'Choose quantities below. Copy current army includes troops in the halls and brewed/queued spells; reserve troops and heroes are excluded.'));
        const picker = el('div', 'quick-picker');
        const quantities: { input: HTMLInputElement; type: TroopType | SpellType; spell: boolean; housing: number }[] = [];
        const addPicker = (type: TroopType | SpellType, spell: boolean): void => {
          const d = spell ? SPELLS[type as SpellType] : TROOPS[type as TroopType];
          const locked = spell ? !s.buildings.some((b) => b.type === 'ssc' && b.level >= SPELLS[type as SpellType].sscLevel) : !troopUnlocked(s, type as TroopType);
          const values = (spell ? draft.spells : draft.troops) as Partial<Record<string, number>>;
          if (locked && !values[type]) return;
          const row = el('div', 'quick-pick');
          row.appendChild(spell ? spellThumb(type as SpellType, 66, 60) : unitThumb(type as TroopType, 66, 60, s.troopLevels[type as TroopType]));
          const label = el('label', 'quick-pick-label', esc(d.name));
          const count = el('input', 'quick-count');
          count.type = 'number'; count.min = '0'; count.max = '500'; count.step = '1';
          count.value = String(values[type] ?? 0);
          count.setAttribute('aria-label', `${d.name} quantity`);
          count.oninput = () => { values[type] = count.value === '' ? 0 : Number(count.value); update(); };
          quantities.push({ input: count, type, spell, housing: d.housing });
          label.appendChild(count);
          row.appendChild(label);
          picker.appendChild(row);
        };
        for (const t of TROOP_ORDER) addPicker(t, false);
        for (const t of SPELL_ORDER) addPicker(t, true);
        editor.appendChild(picker);
        const summary = el('div', 'quick-metrics');
        const cost = el('div', 'quick-cost');
        const reason = el('div', 'quick-reason');
        const actions = el('div', 'quick-actions');
        const save = button('Save army', 'gold', () => {
          const err = this.game.act({ k: 'armySave', slot, army: draft }).err;
          if (err) return fail(err);
          editing = null; render(true);
          this.toast('Army saved', 'good');
        });
        const update = (): void => {
          updateAvailability();
          const valid = readSavedArmy(draft);
          const s = this.state;
          const totals = valid ? savedArmyTotals(s, valid) : null;
          for (const { input, type, spell, housing } of quantities) {
            const counts = (spell ? draft.spells : draft.troops) as Partial<Record<string, number>>;
            const own = valid ? (counts[type] ?? 0) * housing : 0;
            const used = totals ? (spell ? totals.spells : totals.housing) : 0;
            const capacity = spell ? spellCapacity(s) : armyCapacity(s);
            input.max = String(Math.min(500, Math.max(0, Math.floor((capacity - used + own) / housing))));
          }
          const err = valid ? savedArmyCompositionCheck(this.state, valid) : 'Add troops or spells, a name, and whole-number quantities.';
          summary.innerHTML = valid ? metrics(valid) : '';
          cost.innerHTML = valid ? costs(valid) : '';
          reason.textContent = err ?? 'Saved quantities use your current troop levels when trained.';
          save.disabled = !!err;
        };
        actions.append(button('Cancel', 'gray', () => { editing = null; render(true); }), save);
        editor.append(summary, cost, reason, actions);
        m.body.appendChild(editor);
        updateEditor = update;
        update();
        return;
      }
      for (let i = 0; i < SAVED_ARMY_SLOTS; i++) {
        const p = s.savedArmies[i];
        const card = el('section', 'quick-army');
        const head = el('div', 'quick-army-head');
        head.append(el('span', 'quick-slot', String(i + 1)), el('h3', '', esc(p?.name ?? `Army ${i + 1}`)));
        card.appendChild(head);
        if (p) {
          const portraits = el('div', 'quick-portraits');
          const portrait = (type: TroopType | SpellType, n: number, spell: boolean): void => {
            const d = spell ? SPELLS[type as SpellType] : TROOPS[type as TroopType];
            const unit = el('div', 'quick-unit');
            unit.title = `${n} × ${d.name}`;
            unit.appendChild(spell ? spellThumb(type as SpellType, 74, 66) : unitThumb(type as TroopType, 74, 66, s.troopLevels[type as TroopType]));
            unit.appendChild(el('b', 'quick-quantity', `×${n}`));
            unit.appendChild(el('span', 'quick-unit-name', esc(d.name)));
            portraits.appendChild(unit);
          };
          for (const t of TROOP_ORDER) if (p.troops[t]) portrait(t, p.troops[t]!, false);
          for (const t of SPELL_ORDER) if (p.spells[t]) portrait(t, p.spells[t]!, true);
          card.append(portraits, el('div', 'quick-metrics', metrics(p)), el('div', 'quick-cost', costs(p)));
          const err = savedArmyTrainCheck(s, p);
          const actions = el('div', 'quick-actions');
          const train = button('Train army', 'gold', () => {
            const err = this.game.act({ k: 'armyTrain', slot: i }).err;
            if (err) fail(err);
            else { sfx('deploy'); this.toast('Army added to training', 'good'); }
            render(true);
          });
          train.disabled = !!err;
          train.title = err ?? 'Queue one full copy of this army';
          actions.append(button('Edit', 'blue', () => editArmy(i)), button('Clear', 'gray', () => {
            if (!confirm(`Clear ${p.name}? Your trained troops will stay.`)) return;
            const err = this.game.act({ k: 'armyClear', slot: i }).err;
            if (err) fail(err);
            render(true);
          }), train);
          if (err) card.appendChild(el('div', 'quick-reason', esc(err)));
          card.appendChild(actions);
        } else {
          card.appendChild(el('p', 'flavor', 'Save a favorite combination of troops and spells here.'));
          card.appendChild(button('Create army', 'blue', () => editArmy(i)));
        }
        m.body.appendChild(card);
      }
      m.body.appendChild(el('p', 'flavor', 'Times are estimates for an empty queue. Existing training and the occasional line at Chuck’s add time. Heroes stay in the Train & Brew tab.'));
    };
    const render = (force = false): void => {
      // Refresh live limits without replacing the inputs or discarding an in-progress recipe.
      if (editing && !force) { updateEditor?.(); return; }
      updateEditor = null;
      const s = this.state;
      const cap = armyCapacity(s);
      const used = armyUsed(s);
      const q = queueUsed(s);
      const finals = hasEvent(s, 'finals');
      const runs = queueRuns(s);
      const ready = reserveReady(s);
      // the troop being trained right now: the first one that isn't already trained and waiting
      const head = s.trainQueue.find((x) => !isReady(x));
      const inLine = !!head && (head.chucks ?? 0) > 0;
      const sc = spellCapacity(s);
      const hs = heroTypes.filter((h) => heroUnlocked(s, h));
      // Everything shown except the countdowns. Unchanged: only the countdowns are updated, so
      // the cards under the pointer are not replaced several times a second.
      const nsig = JSON.stringify([
        tab, s.savedArmies, tab === 'quick' ? s.resources : null,
        cap,
        used,
        q,
        finals,
        runs.map((r) => [r.type, r.count, r.ready]),
        inLine,
        TROOP_ORDER.map((t) => [s.troopLevels[t], s.army[t] ?? 0, trainCheck(s, t)]),
        sc,
        SPELL_ORDER.map((t) => [s.spells[t] ?? 0, brewCheck(s, t)]),
        s.spellQueue.map((x) => x.type),
        hs.map((h) => [s.heroes[h].level, !!s.heroes[h].upgrade, heroAvailable(s, h)]),
      ]);
      if (!force && nsig === sig) {
        for (const t of ticks) t();
        return;
      }
      sig = nsig;
      ticks = [];
      const scroll = m.body.scrollTop;
      m.body.innerHTML = '';
      if (tab === 'quick') {
        renderQuick();
        m.body.scrollTop = scroll;
        return;
      }
      const capRow = el('div', 'row');
      capRow.innerHTML = `<b class="cap-label">Residence Halls</b><div class="capbar"><div style="width:${Math.min(100, (used / Math.max(1, cap)) * 100)}%"></div><span class="stroke">${used} / ${cap} ready to raid</span></div>`;
      m.body.appendChild(capRow);
      // The second army: trained troops waiting for room, plus whatever is still training.
      const resRow = el('div', 'row');
      resRow.style.marginTop = '6px';
      const over = Math.max(0, used + q - cap); // how much of the queue will not fit in the halls yet
      resRow.innerHTML = `<b class="cap-label">Reserve army</b><div class="capbar reserve"><div style="width:${Math.min(100, (over / Math.max(1, cap)) * 100)}%"></div><span class="stroke">${q ? `${ready} ready + ${q - ready} training` : 'empty'} · room for ${Math.max(0, cap * 2 - used - q)} more</span></div>`;
      resRow.title = 'Train a second army ahead of time. Trained troops wait here and move into the halls as soon as there is room, such as after a raid.';
      m.body.appendChild(resRow);
      if (finals) m.body.appendChild(el('div', 'flavor', '📚 Finals Week: training is 50% slower. Everyone is "studying."'));

      // queue
      const qTitle = el('div', 'section-title', 'Training queue');
      m.body.appendChild(qTitle);
      if (s.trainQueue.length) {
        const total = el('small');
        qTitle.append(` `, total);
        const upd = (): void => {
          const st = this.state;
          const rdy = st.trainQueue.filter(isReady).length;
          const training = st.trainQueue.length - rdy;
          total.textContent = `(${[training ? `${training} training · ⏱ ${fmtTime(trainQueueLeft(st))} left` : '', rdy ? `${rdy} ready, waiting for room` : ''].filter(Boolean).join(' · ')})`;
        };
        upd();
        ticks.push(upd);
      }
      const qd = el('div', 'queue');
      if (!runs.length) qd.appendChild(el('span', 'flavor', `Nobody in training. ${tapWord(true)} a troop below to recruit, or hold to recruit several. You can train a second army ahead of time; it waits here until the halls have room.`));
      const firstTraining = runs.findIndex((r) => !r.ready);
      runs.forEach((r, i) => {
        const qi = el('div', `qitem ${r.ready ? 'ready' : ''}`);
        qi.appendChild(unitThumb(r.type, 62, 62, s.troopLevels[r.type]));
        if (r.count > 1) qi.appendChild(el('div', 'n', `×${r.count}`));
        qi.appendChild(el('div', 'x', '✖'));
        if (r.ready) qi.appendChild(el('div', 't', '✓ Ready'));
        if (i === firstTraining) {
          const pr = el('div', 'prog');
          const tm = el('div', 't');
          qi.append(pr, tm);
          const upd = (): void => {
            const it = this.state.trainQueue.find((x) => !isReady(x));
            if (!it) return;
            pr.style.width = `${(1 - it.left / it.total) * 100}%`;
            tm.textContent = (it.chucks ?? 0) > 0 ? '🍽️ line' : fmtTime(trainItemLeft(this.state, it));
          };
          upd();
          ticks.push(upd);
        }
        qi.title = `${TROOPS[r.type].name}${r.count > 1 ? ` ×${r.count}` : ''}${r.ready ? ': trained, waiting for room in the halls' : ''}: click to cancel one (full refund)`;
        qi.onpointerdown = press(() => cancelOne(runs.length - 1 - i, r.type));
        qd.appendChild(qi);
      });
      if (inLine) qd.appendChild(el('div', 'chucks', `${TROOPS[head.type].name} is ${CHUCKS_LINE}`));
      m.body.appendChild(qd);

      // troop cards
      m.body.appendChild(el('div', 'section-title', `Recruit <small>(${tapWord()}, or hold to keep recruiting)</small>`));
      const grid = el('div', 'cards');
      for (const t of TROOP_ORDER) {
        const d = TROOPS[t];
        const lvl = s.troopLevels[t];
        const cost = d.levels[lvl - 1].cost;
        const unlocked = troopUnlocked(s, t);
        const err = trainCheck(s, t);
        const full = unlocked && armyUsed(s) + queueUsed(s) + d.housing > cap * ARMIES;
        const card = el('div', `card ${unlocked ? (err ? 'dim' : '') : 'locked'}`);
        card.dataset.troop = t;
        card.appendChild(unitThumb(t, 100, 90, lvl));
        card.appendChild(el('div', 'name', d.name));
        card.appendChild(el('div', 'badge', `Lv${lvl}`));
        card.appendChild(el('div', 'count', `×${s.army[t] ?? 0}`));
        if (unlocked) {
          card.appendChild(el('div', 'meta', full ? '<b class="bad">🏠 Both armies full</b>' : `🏠 ${d.housing} · ⏱ ${fmtTime(d.trainTime * (finals ? 2 : 1))}`));
          card.appendChild(el('div', '', costHtml(d.res, cost, canAfford(s, d.res, cost))));
        } else {
          card.appendChild(el('div', 'meta', `🔒 ${BUILDINGS[d.barracks].name} Lv${d.barracksLevel}`));
        }
        card.title = `${d.desc}\n\n"${d.flavor}"${err ? `\n\n${err}` : ''}`;
        card.onpointerdown = (e) => {
          if (e.button !== 0) return;
          // Touch pointers stay captured by the pressed card, which is about to be replaced;
          // let go so the release reaches the window and ends the hold.
          try {
            card.releasePointerCapture(e.pointerId);
          } catch {
            /* nothing was captured */
          }
          startHold(t);
        };
        grid.appendChild(card);
      }
      m.body.appendChild(grid);

      // spells
      if (sc > 0) {
        m.body.appendChild(el('div', 'section-title', `Spells (${spellsUsed(s)}/${sc})`));
        const sq = el('div', 'queue');
        for (const t of SPELL_ORDER) {
          for (let i = 0; i < (s.spells[t] ?? 0); i++) {
            const qi = el('div', 'qitem');
            qi.appendChild(spellThumb(t, 62, 62));
            qi.style.cursor = 'default';
            sq.appendChild(qi);
          }
        }
        s.spellQueue.forEach((it, i) => {
          const qi = el('div', 'qitem');
          qi.style.opacity = '0.7';
          qi.style.cursor = 'default';
          qi.appendChild(spellThumb(it.type, 62, 62));
          if (i === 0) {
            const tm = el('div', 't');
            qi.appendChild(tm);
            const upd = (): void => {
              const cur = this.state.spellQueue[0];
              if (cur) tm.textContent = fmtTime(cur.left);
            };
            upd();
            ticks.push(upd);
          }
          sq.appendChild(qi);
        });
        if (!sq.children.length) sq.appendChild(el('span', 'flavor', 'No spells brewed yet.'));
        m.body.appendChild(sq);
        const sg = el('div', 'cards');
        sg.style.marginTop = '10px';
        for (const t of SPELL_ORDER) {
          const d = SPELLS[t];
          const err = brewCheck(s, t);
          const locked = err?.startsWith('Requires');
          const card = el('div', `card ${locked ? 'locked' : err ? 'dim' : ''}`);
          card.appendChild(spellThumb(t, 90, 80));
          card.appendChild(el('div', 'name', d.name));
          card.appendChild(el('div', 'meta', locked ? `🔒 Brew Lab Lv${d.sscLevel}` : `⏱ ${fmtTime(d.brewTime)}`));
          if (!locked) card.appendChild(el('div', '', costHtml(d.res, d.cost, canAfford(s, d.res, d.cost))));
          card.title = `${d.desc}\n\n"${d.flavor}"${err ? `\n\n${err}` : ''}`;
          card.onpointerdown = press(() => {
            const e2 = this.game.act({ k: 'brew', type: t }).err;
            if (e2) fail(e2);
            else sfx('spell');
            render();
          });
          sg.appendChild(card);
        }
        m.body.appendChild(sg);
      }

      // heroes
      if (hs.length) {
        m.body.appendChild(el('div', 'section-title', 'Heroes'));
        const hg = el('div', 'cards');
        for (const h of hs) {
          const card = el('div', 'card');
          card.appendChild(unitThumb(h, 100, 90, s.heroes[h].level));
          card.appendChild(el('div', 'name', HEROES[h].name));
          card.appendChild(el('div', 'badge', `Lv${s.heroes[h].level}`));
          const meta = el('div', 'meta');
          const upd = (): void => {
            const st = this.state.heroes[h];
            meta.textContent = st.upgrade ? `⬆ Upgrading · ${fmtTime(st.upgrade.end - this.state.clock)}` : heroAvailable(this.state, h) ? '✅ Ready for battle' : `😴 Recovering ${Math.round(st.hpFrac * 100)}%`;
          };
          upd();
          ticks.push(upd);
          card.appendChild(meta);
          card.onpointerdown = press(() => this.openHero(h));
          hg.appendChild(card);
        }
        m.body.appendChild(hg);
      }
      m.body.scrollTop = scroll;
    };
    render(true);
    this.refreshModal = () => render();
  }

  // ---------- Upgrades list ----------
  /** Available new buildings, upgrades and research, including projects waiting on resources. */
  openUpgrades(): void {
    const m = this.modal('Facilities Crew', { headIcon: icon('builder', 36) });
    let sig = '';
    let timers: { el: HTMLElement; left: () => number }[] = [];
    const fail = (err: string): void => {
      this.toast(err, 'bad');
      sfx('error');
    };
    const goTo = (id: number): void => {
      const b = this.state.buildings.find((x) => x.id === id);
      if (!b) return;
      this.closeModal();
      const vs = this.game.village;
      vs.select(id);
      const sz = BUILDINGS[b.type].size;
      const w = toWorld(b.x + sz / 2, b.y + sz / 2);
      vs.cam.x = w.x;
      vs.cam.y = w.y;
      vs.cam.clampPos();
    };
    /** A row: [picture + text (optionally clickable)] [right-hand side]. */
    const mkRow = (cls: string, thumb: HTMLElement, title: string, sub: string, go?: () => void): { row: HTMLElement; side: HTMLElement; sub: HTMLElement } => {
      const row = el('div', `up-row ${cls}`);
      const main = el(go ? 'button' : 'div', 'up-main');
      const subEl = el('div', 'up-sub', sub);
      const txt = el('div', 'up-txt');
      txt.append(el('div', 'up-name', title), subEl);
      main.append(thumb, txt);
      if (go) {
        main.title = 'Show on campus';
        main.onclick = go;
      }
      const side = el('div', 'up-side');
      row.append(main, side);
      return { row, side, sub: subEl };
    };
    const time = (t: number): string => (t > 0 ? `⏱ ${fmtTime(t)}` : '⚡ Instant');
    const render = (force = false): void => {
      const s = this.state;
      const l = listUpgrades(s);
      const dl = dmcLevel(s);
      const newBuildings = SHOP_TABS.flatMap((tab) => tab.types).flatMap((type) => {
        const count = countOf(s, type);
        const limit = maxCount(type, dl);
        if (count >= limit) return [];
        const first = BUILDINGS[type].levels[0];
        return [{ type, count, limit, reason: buildCheck(s, type), affordable: canAfford(s, first.res, first.cost) }];
      });
      // Rebuild only when something other than a countdown changed; otherwise just tick the timers.
      const nsig = JSON.stringify([newBuildings, l.progress.map((p) => [p.id, p.to, p.finishCost, s.resources.chapel >= p.finishCost]), l.ready, l.waiting, l.extras.map((e) => ({ ...e, left: e.left !== undefined }))]);
      if (!force && nsig === sig) {
        for (const t of timers) t.el.textContent = fmtTime(t.left());
        return;
      }
      sig = nsig;
      timers = [];
      const scroll = m.body.scrollTop;
      m.body.innerHTML = '';
      const bl = builders(s);
      m.body.appendChild(el('div', 'flavor', `Facilities Crew free: ${bl.total - bl.busy}/${bl.total}. ${tapWord(true)} a name or picture to find it on campus.`));
      const section = (title: string, n: number): HTMLElement => {
        m.body.appendChild(el('div', 'section-title', `${title} <small>(${n})</small>`));
        const list = el('div', 'up-list');
        m.body.appendChild(list);
        return list;
      };

      if (l.progress.length) {
        const list = section('In progress', l.progress.length);
        for (const p of l.progress) {
          const r = mkRow('', buildingThumb(p.type, p.to, 60, 50), esc(p.name), `${p.to <= 1 ? 'Building' : `Lv ${p.to - 1} → ${p.to}`} · ⏱ <span class="up-left"></span>`, () => goTo(p.id));
          const left = r.sub.querySelector('.up-left') as HTMLElement;
          left.textContent = fmtTime(p.left);
          timers.push({ el: left, left: () => Math.max(0, (this.state.buildings.find((b) => b.id === p.id)?.upgrade?.end ?? 0) - this.state.clock) });
          const fin = el('button', 'btn small purple', `Finish ${costHtml('chapel', p.finishCost, canAfford(s, 'chapel', p.finishCost))}`);
          fin.onclick = () => {
            const err = this.game.act({ k: 'finish', id: p.id }).err;
            if (err) fail(err);
            else sfx('click');
            render(true);
          };
          r.side.appendChild(fin);
          list.appendChild(r.row);
        }
      }

      if (newBuildings.length) {
        const list = section('New buildings', newBuildings.length);
        for (const b of newBuildings) {
          const def = BUILDINGS[b.type];
          const first = def.levels[0];
          const r = mkRow(`new-building-row${b.reason ? ' waiting' : ''}`, buildingThumb(b.type, 1, 60, 50), esc(def.name),
            `${b.count}/${b.limit} on campus · ${b.limit - b.count} available · ${time(first.time)}`);
          r.side.appendChild(el('div', '', costHtml(first.res, first.cost, b.affordable)));
          const buy = el('button', `btn small ${b.reason ? 'gray' : 'gold'}`, 'Build');
          buy.disabled = !!b.reason;
          buy.title = b.reason ?? 'Choose where to place this building';
          buy.onclick = () => {
            const err = buildCheck(this.state, b.type);
            if (err) { fail(err); render(true); return; }
            sfx('click');
            this.closeModal();
            this.game.village.startPlacing(b.type);
          };
          r.side.appendChild(buy);
          if (b.reason) r.side.appendChild(el('div', 'up-why', esc(b.reason)));
          list.appendChild(r.row);
        }
      }

      const buildingRow = (u: UpgradeRow, ready: boolean): HTMLElement => {
        const title = u.type === 'wall' ? `Walls ×${u.count}` : esc(u.name);
        const r = mkRow(ready ? '' : 'waiting', buildingThumb(u.type, u.level, 60, 50), title, `Lv ${u.level} → ${u.level + 1} · ${time(u.time)}`, () => goTo(u.id));
        const multi = u.resOptions.length > 1;
        if (!multi) r.side.appendChild(el('div', '', costHtml(u.res, u.cost, canAfford(s, u.res, u.cost))));
        if (ready) {
          // Walls get one button per payment option (Tuition or Coffee), each showing its cost.
          for (const res of multi ? u.resOptions : [u.res]) {
            const ok = canAfford(s, res, u.cost);
            const up = el('button', `btn small ${ok ? 'gold' : 'gray'}`, multi ? costHtml(res, u.cost, ok) : 'Upgrade');
            if (multi) up.title = `Upgrade with ${resName(res)}`;
            up.onclick = () => {
              const err = this.game.act(multi ? { k: 'upgrade', id: u.id, res } : { k: 'upgrade', id: u.id }).err;
              if (err) fail(err);
              else {
                sfx('build');
                this.game.village.pop(u.id);
              }
              render(true);
            };
            r.side.appendChild(up);
          }
        } else if (multi) {
          for (const res of u.resOptions) r.side.appendChild(el('div', '', costHtml(res, u.cost, canAfford(s, res, u.cost))));
          if (u.reason && u.resOptions.some((res) => canAfford(s, res, u.cost))) r.side.appendChild(el('div', 'up-why', u.reason));
        } else if (u.reason && canAfford(s, u.res, u.cost)) {
          r.side.appendChild(el('div', 'up-why', u.reason));
        }
        return r.row;
      };
      if (l.ready.length) {
        const list = section('Ready to upgrade', l.ready.length);
        for (const u of l.ready) list.appendChild(buildingRow(u, true));
      }
      if (l.waiting.length) {
        const list = section('Need more resources', l.waiting.length);
        for (const u of l.waiting) list.appendChild(buildingRow(u, false));
      }

      if (l.extras.length) {
        const list = section('Library & heroes', l.extras.length);
        for (const e of l.extras) list.appendChild(extraRow(e));
      }
      if (!newBuildings.length && !l.progress.length && !l.ready.length && !l.waiting.length && !l.extras.length) {
        m.body.appendChild(el('p', 'flavor', 'Nothing left to build, upgrade or research at this DMC level. Facilities is, for once, caught up.'));
      }
      m.body.scrollTop = scroll;
    };
    const extraRow = (e: ExtraRow): HTMLElement => {
      const s = this.state;
      const running = e.left !== undefined;
      const what = e.kind === 'research' ? 'Research' : 'Hero';
      const sub = running ? `${what} · Lv ${e.level} → ${e.level + 1} · ⏱ <span class="up-left"></span>` : `${what} · Lv ${e.level} → ${e.level + 1} · ${time(e.time)}`;
      const r = mkRow(running || e.ok ? '' : 'waiting', unitThumb(e.type, 60, 50, e.level), e.name, sub);
      if (running) {
        const left = r.sub.querySelector('.up-left') as HTMLElement;
        left.textContent = fmtTime(e.left!);
        timers.push({
          el: left,
          left: () => {
            const st = this.state;
            const end = e.kind === 'research' ? st.research?.end : st.heroes[e.type as HeroType].upgrade?.end;
            return Math.max(0, (end ?? 0) - st.clock);
          },
        });
        r.side.appendChild(el('div', 'up-why', e.kind === 'research' ? 'Researching…' : 'Upgrading…'));
        return r.row;
      }
      r.side.appendChild(el('div', '', costHtml(e.res, e.cost, canAfford(s, e.res, e.cost))));
      if (e.ok) {
        const b = el('button', `btn small ${e.kind === 'research' ? 'blue' : 'purple'}`, e.kind === 'research' ? 'Research' : 'Upgrade');
        b.onclick = () => {
          const err = e.kind === 'research' ? this.game.act({ k: 'research', type: e.type as TroopType }).err : this.game.act({ k: 'heroUpgrade', type: e.type as HeroType }).err;
          if (err) fail(err);
          else sfx('build');
          render(true);
        };
        r.side.appendChild(b);
      } else if (e.reason && canAfford(s, e.res, e.cost)) {
        r.side.appendChild(el('div', 'up-why', e.reason));
      }
      return r.row;
    };
    render(true);
    this.refreshModal = () => render();
  }

  // ---------- Library ----------
  openLibrary(): void {
    const m = this.modal('Centennial Library — Research', { headIcon: '<span style="font-size:32px">📚</span>' });
    const render = (): void => {
      const s = this.state;
      m.body.innerHTML = '';
      m.body.appendChild(el('div', 'flavor', `Library Lv${libraryLevel(s)}. Shhh. Research upgrades your troops permanently.`));
      if (s.research) {
        const r = s.research;
        const left = Math.max(0, r.end - s.clock);
        const row = el('div', 'row');
        row.style.margin = '10px 0';
        row.innerHTML = `<b style="color:#1c3d7a">Researching ${TROOPS[r.troop].name} → Lv${s.troopLevels[r.troop] + 1}</b><div class="capbar"><div style="width:${(1 - left / r.total) * 100}%"></div><span class="stroke">${fmtTime(left)}</span></div>`;
        m.body.appendChild(row);
      }
      const grid = el('div', 'cards');
      for (const t of TROOP_ORDER) {
        const d = TROOPS[t];
        const lvl = s.troopLevels[t];
        const err = researchCheck(s, t);
        const maxed = lvl >= d.levels.length;
        const card = el('div', `card ${err && err !== 'Not enough Coffee' && err !== 'The Library is already researching' ? 'locked' : ''}`);
        card.appendChild(unitThumb(t, 100, 90, lvl));
        card.appendChild(el('div', 'name', d.name));
        card.appendChild(el('div', 'badge', `Lv${lvl}`));
        if (maxed) card.appendChild(el('div', 'meta', '⭐ Max level'));
        else {
          const n = d.levels[lvl];
          const c = d.levels[lvl - 1];
          card.appendChild(el('div', 'meta', `HP ${c.hp}→<b class="next">${n.hp}</b> · DPS ${c.dps}→<b class="next">${n.dps}</b>`));
          card.appendChild(el('div', 'meta', err && err.startsWith('Requires') ? `🔒 ${err}` : `⏱ ${fmtTime(n.researchTime)}`));
          card.appendChild(el('div', '', costHtml('coffee', n.researchCost, canAfford(s, 'coffee', n.researchCost))));
        }
        card.onclick = () => {
          const e2 = this.game.act({ k: 'research', type: t }).err;
          if (e2) {
            this.toast(e2, 'bad');
            sfx('error');
          } else {
            sfx('build');
            this.toast(`Researching ${d.name}. Someone check the third floor in a bit.`, 'good');
          }
          render();
        };
        grid.appendChild(card);
      }
      m.body.appendChild(grid);
    };
    render();
    this.refreshModal = render;
  }

  // ---------- Heroes ----------
  openHero(h: HeroType): void {
    const d = HEROES[h];
    const m = this.modal(d.name, { narrow: true, headIcon: '<span style="font-size:30px">🎓</span>' });
    const render = (): void => {
      const s = this.state;
      const st = s.heroes[h];
      const L = d.levels[st.level - 1];
      const N = d.levels[st.level];
      m.body.innerHTML = '';
      const row = el('div', 'row');
      row.appendChild(unitThumb(h, 140, 140, st.level));
      const col = el('div', 'col');
      col.appendChild(el('div', '', d.desc));
      col.appendChild(el('div', 'flavor', `"${d.flavor}"`));
      col.appendChild(el('div', '', `<b>Ability — ${d.ability.name}:</b> ${d.ability.desc}`));
      row.appendChild(col);
      m.body.appendChild(row);
      const t = el('table', 'stats-table');
      t.innerHTML = `<tr><td>Level</td><td>${st.level}${N ? ` <span class="next">→ ${st.level + 1}</span>` : ' (max)'}</td></tr>
        <tr><td>Hitpoints</td><td>${L.hp}${N ? ` <span class="next">→ ${N.hp}</span>` : ''}</td></tr>
        <tr><td>Damage/sec</td><td>${L.dps}${N ? ` <span class="next">→ ${N.dps}</span>` : ''}</td></tr>
        <tr><td>Status</td><td>${st.upgrade ? `Upgrading (${fmtTime(st.upgrade.end - s.clock)})` : st.hpFrac < 1 ? `Recovering: ${Math.round(st.hpFrac * 100)}%` : 'Ready!'}</td></tr>`;
      m.body.appendChild(t);
      if (N && !st.upgrade) {
        const err = heroUpgradeCheck(s, h, dmcLevel(s));
        const b = el('button', `btn ${err ? 'gray' : 'purple'}`, `Upgrade ${costHtml('chapel', N.upgradeCost, canAfford(s, 'chapel', N.upgradeCost))}`);
        b.style.marginTop = '12px';
        b.onclick = () => {
          const e2 = this.game.act({ k: 'heroUpgrade', type: h }).err;
          if (e2) {
            this.toast(e2, 'bad');
            sfx('error');
          } else sfx('build');
          render();
        };
        m.body.appendChild(b);
      }
    };
    render();
    this.refreshModal = render;
  }

  // ---------- Chapel ----------
  openChapel(): void {
    const m = this.modal('Chapel', { narrow: true, headIcon: icon('chapel', 36) });
    const render = (): void => {
      const s = this.state;
      m.body.innerHTML = '';
      m.body.appendChild(el('div', '', `Daily Chapel attendance earns <b>Chapel Credits</b> (rare resource). Keep a streak for bonus credits!`));
      m.body.appendChild(el('div', 'section-title', `Current streak: ${s.chapel.streak} day${s.chapel.streak === 1 ? '' : 's'} 🔥`));
      if (canAttendChapel(s)) {
        const r = chapelReward(s);
        const b = el('button', 'btn purple big', `Attend Chapel (+${r} ${icon('chapel', 26)})`);
        b.onclick = () => {
          const got = this.game.act({ k: 'chapel' }).got ?? 0;
          sfx('pray');
          this.toast(`${pick(CHAPEL_ATTEND_LINES)} +${got} Chapel Credits`, 'good');
          this.game.village.particles.text(0, 400, 50, `+${got} Chapel Credits`, '#d6b4ff', 24);
          render();
        };
        m.body.appendChild(b);
      } else {
        m.body.appendChild(el('div', 'flavor', "You've already attended today. The worship team thanks you for clapping on 2 and 4."));
      }
      m.body.appendChild(this.dailyCard());
      m.body.appendChild(el('p', 'flavor', 'Also earn Chapel Credits from 3-star raids and achievements. Spend them on heroes, the Chapel Announcement spell, and finishing construction instantly.'));
    };
    render();
  }

  /** Stable buttons: only their content changes when the campus name, DMC or trophies change. */
  private renderPlayerHud(): void {
    const s = this.state, level = dmcLevel(s);
    const sig = `${s.playerName}:${level}:${s.trophies}`;
    if (sig === this.profileHudSig) return;
    this.profileHudSig = sig;
    this.paintPlayerButtons({ name: s.playerName, dmc: level, trophies: s.trophies }, this.profileCard, this.trophyEl);
  }

  private paintPlayerButtons(profile: Pick<PlayerProfile, 'name' | 'dmc' | 'trophies'>, card: HTMLButtonElement, trophy: HTMLElement): void {
    const league = leagueFor(profile.trophies), leagueIndex = LEAGUES.indexOf(league);
    card.innerHTML = '';
    card.append(buildingThumb('dmc', profile.dmc, 58, 58), el('span', 'player-hud-name', esc(profile.name)));
    card.title = `${profile.name} · DMC ${profile.dmc} · View profile`;
    const [light, dark] = LEAGUE_ROW_COLORS[leagueIndex];
    trophy.style.background = `linear-gradient(125deg,transparent 55%,#ffffff17 55%,#ffffff17 66%,transparent 66%),linear-gradient(${light},${dark})`;
    trophy.style.color = leagueIndex === 5 || leagueIndex === 6 ? '#fff' : '#08152e';
    trophy.innerHTML = `<span class="hud-league-icon">${leagueBadgeArt(leagueIndex)}</span><span><span class="num">${profile.trophies}</span><span class="league">${league.name}</span></span>`;
  }

  openProfile(profile?: PlayerProfile): void {
    const view = profile ?? publicPlayerProfile(this.state), level = view.dmc, league = leagueFor(view.trophies);
    const m = this.modal('Player Profile', { className: 'player-profile-modal', headIcon: icon('trophy', 36) });
    const overview = el('div', 'player-overview');
    const campus = el('div', 'player-campus');
    const dmc = el('div', 'player-dmc');
    dmc.append(buildingThumb('dmc', level, 96, 96), el('b', '', `DMC ${level}`));
    const identity = el('div', 'player-identity');
    identity.append(el('h3', '', esc(view.name)), el('p', '', profile ? 'Campus profile' : 'Your campus profile'));
    campus.append(dmc, identity);
    const rating = el('div', 'player-rating');
    const current = el('div', 'player-current');
    current.style.background = `linear-gradient(120deg,${league.color},#18335c)`;
    current.innerHTML = `<span class="player-league-emblem">${leagueBadgeArt(LEAGUES.indexOf(league))}</span><div><b>${league.name}</b><strong>${icon('trophy', 24)} ${view.trophies}</strong><small>Current trophies</small></div>`;
    const best = el('div', 'player-best', `<span>Highest trophies</span><strong>${icon('trophy', 24)} ${view.bestTrophies}</strong>`);
    rating.append(current, best);
    overview.append(campus, rating);
    m.body.appendChild(overview);
    const section = (title: string, count: number, total: number): HTMLElement => {
      const area = el('section', 'profile-roster');
      area.appendChild(el('h3', '', `${title} <small>${count} unlocked · ${total - count} locked</small>`));
      const grid = el('div', 'profile-roster-grid');
      area.appendChild(grid); m.body.appendChild(area); return grid;
    };
    const card = (grid: HTMLElement, name: string, thumb: HTMLCanvasElement, label: string, unlocked: boolean): void => {
      const tile = el('div', `profile-unit${unlocked ? '' : ' profile-unit-locked'}`);
      tile.setAttribute('aria-label', `${name}, ${unlocked ? label : 'Locked'}`);
      const status = unlocked ? label : '<svg viewBox="0 0 16 18" aria-hidden="true"><path d="M4 8V5a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/><rect x="2" y="7" width="12" height="10" rx="2" fill="currentColor"/></svg> Locked';
      tile.append(thumb, el('b', 'profile-unit-level', status), el('span', 'profile-unit-name', esc(name)));
      grid.appendChild(tile);
    };
    const troopGrid = section('Troops', TROOP_ORDER.filter((t) => view.troopLevels[t] !== undefined).length, TROOP_ORDER.length);
    for (const t of TROOP_ORDER) {
      const unlocked = view.troopLevels[t] !== undefined;
      card(troopGrid, TROOPS[t].name, unitThumb(t, 96, 82, unlocked ? view.troopLevels[t] : 1), `Lv ${view.troopLevels[t]}`, unlocked);
    }
    const spellGrid = section('Spells', SPELL_ORDER.filter((t) => view.spells.includes(t)).length, SPELL_ORDER.length);
    for (const t of SPELL_ORDER) card(spellGrid, SPELLS[t].name, spellThumb(t, 96, 82), 'Unlocked', view.spells.includes(t));
    const heroes: HeroType[] = ['prof', 'president'];
    const heroGrid = section('Heroes', heroes.filter((h) => view.heroLevels[h] !== undefined).length, heroes.length);
    for (const h of heroes) {
      const unlocked = view.heroLevels[h] !== undefined;
      card(heroGrid, HEROES[h].name, unitThumb(h, 96, 82, unlocked ? view.heroLevels[h] : 1), `Lv ${view.heroLevels[h]}`, unlocked);
    }
  }

  // ---------- Achievements / leagues ----------
  openAchievements(): void {
    const m = this.modal('Achievements', { headIcon: icon('medal', 36) });
    const s = this.state;
    const list = el('div', 'ach-list');
    for (const a of ACHIEVEMENTS) {
      const got = !!s.achievements[a.id];
      list.appendChild(el('div', `ach ${got ? '' : 'locked'}`, `${icon('medal', 40)}<div><b>${a.name}</b><br><span style="font-size:13px">${a.desc}</span><br><span style="font-size:12px">Reward: ${a.reward} ${icon('chapel', 14)}</span></div>`));
    }
    m.body.appendChild(el('div', 'section-title', `${Object.keys(s.achievements).length}/${ACHIEVEMENTS.length} unlocked`));
    m.body.appendChild(list);
  }

  openLeagues(profile?: PlayerProfile): void {
    const m = this.modal('League Ladder', { className: 'ladder-modal', closeArt: leagueCloseArt() });
    const view = profile ?? publicPlayerProfile(this.state);
    const cur = leagueFor(view.trophies);
    const exp = expectedDmc(view.trophies);
    const dl = view.dmc;
    const lean = exp - dl > 0.5 ? 'so expect rivals a step above your campus (and bigger payouts)' : exp - dl < -0.5 ? 'so expect softer rivals until your trophies catch up' : 'so expect rivals about your size';
    const subjectLean = profile ? lean.replace('your campus', 'their campus').replace('your trophies', 'their trophies') : lean;
    const matchmaking = `Matchmaking${profile ? ` for ${view.name}` : ''}: the ladder expects a DMC ${Math.min(MAX_DMC, Math.floor(exp))} campus at ${view.trophies} trophies and ${profile ? 'theirs' : 'yours'} is DMC ${dl}, ${subjectLean}. Tougher rivals pay more trophies and loot.`;
    m.body.innerHTML = leagueLadderArt({ trophies: view.trophies, best: view.bestTrophies, currentMin: cur.min, leagues: LEAGUES, matchmaking });
  }

  // ---------- Attack ----------
  openAttack(): void {
    const s = this.state;
    const m = this.modal('Choose your rival', { narrow: true, headIcon: icon('sword', 36) });
    const troops = Object.values(s.army).reduce((a, n) => a + (n ?? 0), 0);
    const heroes = (['prof', 'president'] as HeroType[]).filter((h) => heroAvailable(s, h)).length;
    m.body.appendChild(el('div', '', `Your army: <b>${troops}</b> troops${heroes ? ` + ${heroes} hero${heroes > 1 ? 'es' : ''}` : ''}. Spells: ${Object.values(s.spells).reduce((a, n) => a + (n ?? 0), 0)}.`));
    if (troops === 0 && heroes === 0) m.body.appendChild(el('div', 'flavor', 'You have no troops! Train some in the Army menu first. (Your Freshmen are still at orientation.)'));
    const col = el('div', 'col');
    col.style.marginTop = '12px';
    if (!s.campaignDone) {
      const b = el('button', 'btn big', '🏈 Raid "Rival State U"');
      b.title = 'A hand-built rival campus. A great first raid!';
      b.onclick = () => {
        this.closeModal();
        this.game.startRaid({ kind: 'campaign' });
      };
      col.appendChild(b);
      col.appendChild(el('div', 'flavor', 'Tutorial raid: a hand-built rival campus. Beat it to unlock random rivals.'));
    }
    const cost = SCOUT_COST_PER_DMC * dmcLevel(s);
    const f = el('button', `btn big ${s.campaignDone ? '' : 'gray'}`, `🔍 Find a Rival ${costHtml('tuition', cost, canAfford(s, 'tuition', cost))}`);
    f.onclick = () => {
      if (!s.campaignDone) {
        this.toast('Beat Rival State U first!', 'bad');
        sfx('error');
        return;
      }
      if (!canAfford(s, 'tuition', cost)) {
        this.toast('Not enough Tuition to scout.', 'bad');
        sfx('error');
        return;
      }
      this.closeModal();
      this.game.startRaid({ kind: 'random' });
    };
    col.appendChild(f);
    const who = this.game.online ? 'Real players near your trophy count first; otherwise a computer campus matched' : 'Rival campuses are matched';
    col.appendChild(el('div', 'flavor', `${who} to your <b>${s.trophies}</b> trophies (${leagueFor(s.trophies).name}). Win and the next one is tougher and pays more; lose and it eases off.`));
    if (hasEvent(s, 'elephantrun')) {
      const e = el('button', 'btn big purple', '🐘 Elephant Run (event!)');
      e.onclick = () => {
        this.closeModal();
        this.game.startRaid({ kind: 'elephant' });
      };
      col.appendChild(e);
      col.appendChild(el('div', 'flavor', EVENT_INFO.elephantrun.desc + ' Uses up to 30 free event Freshmen — your army is not consumed.'));
    }
    col.appendChild(this.dailyCard());
    m.body.appendChild(col);
  }

  /** The Daily Challenge card, shared by the Chapel and Attack menus. */
  dailyCard(): HTMLElement {
    const s = this.state;
    const day = dayKey();
    const c = dailyFor(day, dmcLevel(s));
    const o = OBJECTIVES[c.objectiveId];
    const p = dailyProgress(s, day);
    const troops = TROOP_ORDER.filter((t) => c.army[t]).map((t) => `${c.army[t]} ${TROOPS[t].name}`);
    const spells = SPELL_ORDER.filter((t) => c.spells[t]).map((t) => `${c.spells[t]} ${SPELLS[t].name}`);
    const box = el('div', `daily-card ${p.done ? 'done' : ''}`);
    box.appendChild(el('div', 'daily-title', `🎯 Daily Challenge: ${c.title}`));
    box.appendChild(el('div', '', `<b>${o.name}.</b> ${o.desc}`));
    box.appendChild(el('div', 'flavor', `Lent army (Lv${c.troopLevel}): ${troops.join(', ')}${spells.length ? ` + ${spells.join(', ')}` : ''}. Your own troops are not used, and you can retry as often as you like.`));
    const b = el('button', `btn ${p.done ? 'gray' : 'purple'}`, p.done ? '✅ Cleared today · Play again for fun' : `Start (+${c.reward} ${icon('chapel', 22)})`);
    b.onclick = () => {
      sfx('click');
      this.closeModal();
      void this.game.startRaid({ kind: 'daily' });
    };
    box.appendChild(b);
    const meta: string[] = [];
    if (p.attempts > 0 && !p.done) meta.push(`Attempts today: ${p.attempts}, best ${p.bestStars} star${p.bestStars === 1 ? '' : 's'}`);
    meta.push(`New challenge in ${fmtTime(msUntilNextDaily() / 1000)}`);
    box.appendChild(el('div', 'flavor', meta.join(' · ')));
    return box;
  }

  // ---------- Settings / debug ----------
  openSettings(): void {
    const m = this.modal('Settings', { narrow: true, headIcon: icon('gear', 36) });
    const s = this.state;
    const render = (): void => {
      m.body.innerHTML = '';
      const row1 = el('div', 'row');
      const mute = el('button', 'btn blue', isMuted() ? '🔇 Sound: Off' : '🔊 Sound: On');
      mute.onclick = () => {
        setMuted(!isMuted());
        s.settings.muted = isMuted();
        render();
      };
      const online = this.game.online;
      const news = el('button', 'btn gold', "🎉 What's new");
      news.onclick = () => {
        sfx('click');
        this.openWhatsNew();
      };
      const save = el('button', 'btn', online ? '🔄 Sync now' : '💾 Save now');
      save.onclick = () => {
        this.game.save();
        if (online) this.toast('Synced with the server.', 'good');
        else if (!staleSave) this.toast('Saved!', 'good');
      };
      const plates = el('button', 'btn blue', namePlatesOn() ? '🏷️ Name plates: On' : '🏷️ Name plates: Off');
      plates.onclick = () => {
        sfx('click');
        setNamePlates(!namePlatesOn());
        render();
      };
      row1.append(mute, plates);
      if (hapticsSupported()) {
        const vib = el('button', 'btn blue', hapticsOn() ? '📳 Vibration: On' : '📳 Vibration: Off');
        vib.onclick = () => {
          setHaptics(!hapticsOn());
          sfx('click');
          render();
        };
        row1.append(vib);
      }
      const gfx = el('button', 'btn blue', `🎨 Graphics: ${QUALITY_LABEL[this.game.quality]}`);
      gfx.title = 'Auto lowers sharpness if the game runs slowly. Battery saver: lower sharpness and 30 frames a second.';
      gfx.onclick = () => {
        sfx('click');
        this.game.setQuality(nextQuality(this.game.quality));
        render();
      };
      row1.append(gfx, save, news);
      const inst = installOption();
      if (inst) {
        const ib = el('button', 'btn gold', '📲 Add to Home Screen');
        ib.onclick = () => {
          sfx('click');
          if (inst === 'prompt') {
            void promptInstall().then((ok) => {
              if (ok) this.toast('Installed! Cedarville Clash is on your home screen.', 'good');
              render();
            });
          } else {
            this.popup(
              'Add to Home Screen',
              'In <b>Safari</b>, tap the <b>Share</b> button (the square with an arrow), then <b>Add to Home Screen</b>. The game then opens full screen from its own icon, like an app.',
              'Got it',
            );
          }
        };
        row1.append(ib);
      }
      row1.style.flexWrap = 'wrap';
      m.body.appendChild(row1);

      if (online) {
        m.body.appendChild(el('div', 'section-title', 'Account'));
        const shield = online.shieldUntil > Date.now() ? ` · 🛡️ Shield for ${fmtTime((online.shieldUntil - Date.now()) / 1000)}` : '';
        m.body.appendChild(el('div', '', `Playing online as <b>${esc(online.user.name)}</b>${shield}`));
        const nameRow = el('div', 'row');
        const nameIn = el('input');
        nameIn.type = 'text';
        nameIn.maxLength = 20;
        nameIn.value = online.user.name;
        nameIn.disabled = !!s.nameChanged;
        nameIn.style.flex = '1';
        const nameBtn = el('button', 'btn small', s.nameChanged ? '🔒 Name locked' : '✏️ Rename (once!)');
        nameBtn.disabled = !!s.nameChanged;
        nameBtn.onclick = async () => {
          const name = nameIn.value.trim();
          if (!validCampusName(name)) return this.toast(NAME_RULES, 'bad');
          if (!confirm(`Rename your campus to "${name}"? Other players will see it, and you can only do this once.`)) return;
          nameBtn.disabled = true;
          try {
            await online.rename(name);
            s.playerName = name;
            s.nameChanged = true;
            this.toast('Name updated!', 'good');
          } catch (e) {
            this.toast((e as Error).message, 'bad');
          }
          render();
        };
        nameRow.append(nameIn, nameBtn);
        m.body.appendChild(nameRow);
        if (!s.nameChanged) m.body.appendChild(el('div', 'flavor', 'You get one rename. Choose wisely.'));
        const r2 = el('div', 'row');
        const out = el('button', 'btn small red', 'Log out');
        out.onclick = async () => {
          await online.flush();
          await online.logout().catch(() => undefined);
          this.game.resetting = true;
          location.reload();
        };
        r2.append(out);
        m.body.appendChild(r2);
        m.body.appendChild(el('p', 'flavor', 'Your campus is saved on the server. Other players can raid it while you are away; a shield protects you for a while after a big raid.'));
        appendControls();
        return;
      }

      if (this.game.serverAvailable) {
        m.body.appendChild(el('div', 'section-title', 'Online play'));
        const go = el('button', 'btn small blue', '🌐 Log in / sign up to play online');
        go.onclick = () => {
          saveGame(s);
          setPrefersOffline(false);
          this.game.resetting = true;
          location.reload();
        };
        m.body.appendChild(go);
        m.body.appendChild(el('p', 'flavor', 'Online campuses are separate from this offline save, and real players can raid them.'));
      }

      m.body.appendChild(el('div', 'section-title', 'Campus name'));
      const nameRow = el('div', 'row');
      const nameIn = el('input');
      nameIn.type = 'text';
      nameIn.maxLength = MAX_NAME_LEN;
      nameIn.value = s.playerName;
      nameIn.disabled = !!s.nameChanged;
      nameIn.style.flex = '1';
      const nameBtn = el('button', 'btn small', s.nameChanged ? '🔒 Name locked' : '✏️ Rename (once!)');
      nameBtn.disabled = !!s.nameChanged;
      nameBtn.onclick = () => {
        const name = cleanName(nameIn.value);
        if (!confirm(`Rename your campus to "${name}"? You can only do this once.`)) return;
        const err = renamePlayer(s, nameIn.value);
        if (err) this.toast(err, 'bad');
        else {
          saveGame(s);
          this.toast('Name updated!', 'good');
          render();
        }
      };
      nameRow.append(nameIn, nameBtn);
      m.body.appendChild(nameRow);
      if (!s.nameChanged) m.body.appendChild(el('div', 'flavor', 'You get one rename. Choose wisely.'));

      m.body.appendChild(el('div', 'section-title', 'Debug'));
      const dr = el('div', 'debug-row');
      const sp = el('button', 'btn gold', `⏩ Speed: ${DEBUG_SPEEDS[s.settings.speedIdx]}x`);
      sp.onclick = () => {
        s.settings.speedIdx = (s.settings.speedIdx + 1) % DEBUG_SPEEDS.length;
        render();
      };
      const res = el('button', 'btn small', '+ Resources');
      res.onclick = () => {
        const c = caps(s);
        s.resources.tuition = c.tuition;
        s.resources.coffee = c.coffee;
        s.resources.chapel = Math.min(c.chapel, s.resources.chapel + 100);
        this.toast('Financial aid has been approved.', 'good');
      };
      const fin = el('button', 'btn small', '⚡ Finish builds');
      fin.onclick = () => {
        for (const b of s.buildings) if (b.upgrade) b.upgrade.end = s.clock;
        if (s.research) s.research.end = s.clock;
        for (const q of s.trainQueue) {
          q.left = 0.01;
          q.chucks = 0;
        }
        for (const q of s.spellQueue) q.left = 0.01;
        for (const h of Object.values(s.heroes)) {
          if (h.upgrade) h.upgrade.end = s.clock;
          h.hpFrac = 1;
        }
      };
      dr.append(sp, res, fin);
      for (const ev of ['ringbyspring', 'finals', 'construction', 'elephantrun'] as const) {
        const b = el('button', 'btn small purple', `${EVENT_INFO[ev].icon} ${EVENT_INFO[ev].name}`);
        b.onclick = () => startEvent(s, ev);
        dr.appendChild(b);
      }
      const tk = el('button', 'btn small purple', '🚓 Ticket');
      tk.onclick = () => {
        s.nextTicketCheck = s.clock;
        s.lastRaidClock = -9999;
        this.toast('Campus Safety is on patrol (needs a mostly-full army)...');
      };
      dr.appendChild(tk);
      m.body.appendChild(dr);

      m.body.appendChild(el('div', 'section-title', 'Save data'));
      const r3 = el('div', 'row');
      const exp = el('button', 'btn small blue', '📋 Copy save to clipboard');
      exp.onclick = () => {
        void navigator.clipboard?.writeText(exportSave(s));
        this.toast('Save copied (base64).', 'good');
      };
      const reset = el('button', 'btn small red', '🗑️ Reset save');
      reset.onclick = () => {
        if (confirm('Really reset? Your whole campus will be expelled.')) {
          resetSave();
          this.game.resetting = true;
          location.reload();
        }
      };
      const imp = el('button', 'btn small blue', '📥 Import save');
      imp.onclick = () => {
        const text = prompt('Paste a save copied with "Copy save to clipboard". This replaces your current campus.');
        if (!text) return;
        try {
          importSave(text);
        } catch {
          this.toast('That does not look like a Cedarville Clash save.', 'bad');
          return;
        }
        this.game.resetting = true; // don't let the unload handler write the old campus back
        location.reload();
      };
      r3.append(exp, imp, reset);
      m.body.appendChild(r3);
      appendControls();
    };
    const appendControls = (): void => {
      m.body.appendChild(el('div', 'section-title', 'Controls'));
      m.body.appendChild(
        el(
          'div',
          '',
          touchMode
            ? 'Drag with one finger to pan · Pinch to zoom · Tap a building to select it · Long-press a building to pick it up and move it · Placing: drag the outline, then tap ✔. In raids: pick a card, tap or hold on open grass to deploy (the ring turns green where troops can land); drag with two fingers to look around; tap a deployed hero\'s card for its ability.'
            : `Drag or <kbd>WASD</kbd>/arrows to pan · Wheel or <kbd>+</kbd>/<kbd>-</kbd> to zoom · Click a building to select · Drag a selected building to move it · <kbd>Esc</kbd> cancel · <kbd>Del</kbd> remove decor · <kbd>\`</kbd> toggle speed. In raids: pick a card, click/hold on green grass to deploy; <kbd>1</kbd>-<kbd>9</kbd> pick cards; <kbd>Space</kbd> uses the hero ability.`,
        ),
      );
      m.body.appendChild(el('div', 'section-title', 'About'));
      m.body.appendChild(el('p', '', 'Made by <b>Timothy Wax</b> and <b>Noah Lukinovich</b>. This game was made with AI.'));
      m.body.appendChild(el('p', 'flavor', 'Cedarville Clash is an unofficial, affectionate fan parody. Not affiliated with or endorsed by any university or game studio. All art is procedurally drawn.'));
    };
    render();
  }

  // ---------- Base layouts ----------
  openLayouts(): void {
    const m = this.modal('Base Layouts', { narrow: true, headIcon: '<span style="font-size:30px">🗺️</span>' });
    const s = this.state;
    const render = (): void => {
      m.body.innerHTML = '';
      m.body.appendChild(el('p', 'flavor', 'Save up to three campus layouts and switch between them any time. Moving buildings on campus updates the active layout.'));
      const list = el('div', 'layout-list');
      for (let i = 0; i < s.layouts.length; i++) {
        const l = s.layouts[i];
        const active = i === s.activeLayout;
        const complete = !!l && isComplete(s, i);
        const row = el('div', `layout-row ${active ? 'active' : ''}`);
        const status = active ? 'Active' : !l ? 'Empty' : complete ? 'Saved' : 'Needs new buildings placed';
        const info = el('div', 'layout-info');
        info.append(el('div', 'name', ''), el('div', 'meta', status));
        info.firstElementChild!.textContent = l?.name ?? defaultName(i);
        const btns = el('div', 'layout-btns');
        const btn = (label: string, cls: string, fn: () => void): void => {
          const b = el('button', `btn small ${cls}`, label);
          b.onclick = () => {
            sfx('click');
            fn();
          };
          btns.appendChild(b);
        };
        btn('✏️ Edit', 'gold', () => this.game.startEditor(i));
        if (!active && l) {
          btn('✔ Use', '', () => {
            if (!this.game.act({ k: 'layoutUse', slot: i }).err) {
              this.game.village.syncWanderers();
              this.game.save();
              this.toast(`${l.name} is now your campus.`, 'good');
              sfx('place');
              render();
            } else {
              this.toast('Place your new buildings first.', 'info');
              this.game.startEditor(i);
            }
          });
        }
        if (l) {
          btn('Rename', 'blue', () => {
            const n = prompt('Layout name', l.name);
            if (n && !this.game.act({ k: 'layoutName', slot: i, name: n }).err) render();
          });
        }
        if (!active) {
          btn('Copy current', 'blue', () => {
            if (l && !confirm(`Overwrite ${l.name} with your current campus?`)) return;
            this.game.act({ k: 'layoutSave', slot: i, pos: snapshot(s.buildings) });
            render();
          });
          if (l) {
            btn('Clear', 'red', () => {
              if (!confirm(`Clear ${l.name}?`)) return;
              this.game.act({ k: 'layoutClear', slot: i });
              render();
            });
          }
        }
        row.append(info, btns);
        list.appendChild(row);
      }
      m.body.appendChild(list);
    };
    render();
  }

  showEditor(show: boolean): void {
    this.editorHud.classList.toggle('hidden', !show);
    if (show) this.renderEditor();
  }

  renderEditor(): void {
    const ed = this.game.editor;
    if (!ed || this.game.scene !== ed) return;
    const h = this.editorHud;
    h.innerHTML = '';
    const top = el('div', 'editor-top');
    const title = el('div', 'hint stroke');
    title.textContent = `✏️ Editing: ${ed.slotName}`;
    const mkBtn = (label: string, cls: string, fn: () => void): HTMLButtonElement => {
      const b = el('button', `btn ${cls}`, label);
      b.onclick = () => {
        sfx('click');
        fn();
      };
      return b;
    };
    const removeAll = mkBtn('Remove all', 'small blue', () => ed.removeAll());
    const cancel = mkBtn('✖ Cancel', 'small red', () => {
      if (ed.dirty && !confirm('Discard your changes to this layout?')) return;
      this.game.endEditor(false);
    });
    const save = mkBtn('✔ Save', 'small', () => {
      if (this.game.endEditor(true)) this.toast(`${ed.slotName} saved.`, 'good');
    });
    save.disabled = ed.tray.length > 0;
    if (save.disabled) save.title = 'Place every building from the tray first';
    top.append(title, removeAll, cancel, save);
    h.appendChild(top);

    const bottom = el('div', 'editor-bottom');
    const sel = ed.selected();
    const placing = ed.mode.kind === 'placing' ? ed.mode.type : null;
    let hint = touchMode ? 'Long-press a building to move it. Pinch to zoom, drag the ground to pan.' : 'Drag a selected building to move it. Wheel to zoom, drag the ground to pan.';
    if (placing) hint = touchMode ? `Placing ${BUILDINGS[placing].name}: drag it into place, then tap ✔.` : `Placing ${BUILDINGS[placing].name}: click to place. <kbd>Esc</kbd> cancels.`;
    else if (ed.tray.length) hint = 'Pick a building from the tray to place it.';
    const hintRow = el('div', 'editor-hint');
    hintRow.appendChild(el('div', 'hint stroke', hint));
    if (sel && !placing) hintRow.appendChild(mkBtn(`To tray: ${sel.name ?? BUILDINGS[sel.type].name}`, 'small blue', () => ed.removeSelected()));
    if (placing) hintRow.appendChild(mkBtn('✖ Stop', 'small red', () => ed.cancelMode()));
    bottom.appendChild(hintRow);
    if (ed.tray.length) {
      const tray = el('div', 'editor-tray');
      const groups = new Map<BuildingType, BuildingInst[]>();
      for (const b of ed.tray) groups.set(b.type, [...(groups.get(b.type) ?? []), b]);
      for (const [type, list] of groups) {
        const card = el('div', `tray-card ${type === placing ? 'active' : ''}`);
        card.title = BUILDINGS[type].name;
        card.appendChild(buildingThumb(type, Math.max(1, list[0].level), 60, 50));
        card.appendChild(el('div', 'count', `×${list.length}`));
        card.onclick = () => {
          sfx('click');
          ed.startPlacing(type);
        };
        tray.appendChild(card);
      }
      bottom.appendChild(tray);
    }
    h.appendChild(bottom);
  }

  async openLeaderboard(): Promise<void> {
    const online = this.game.online;
    if (!online) return;
    let rows;
    try {
      rows = await online.leaderboard();
    } catch (e) {
      this.toast((e as Error).message, 'bad');
      return;
    }
    const m = this.modal('Leaderboard', { narrow: true, headIcon: icon('trophy', 36) });
    const list = el('div', 'league-list');
    rows.forEach((r, i) => {
      const me = r.name === online.user.name;
      const row = el('div', `league-row ${me ? 'me' : ''}`, `<span>${i + 1}. ${esc(r.name)} <small>DMC ${r.dmc}</small></span><span class="lb-side">${icon('trophy', 18)} ${r.trophies}</span>`);
      if (!me) {
        const go = el('button', 'btn small blue', 'Visit');
        go.title = 'Look around this campus';
        go.onclick = () => {
          sfx('click');
          void this.game.startVisit(r.name);
        };
        row.lastElementChild!.appendChild(go);
      }
      list.appendChild(row);
    });
    if (!rows.length) list.appendChild(el('div', 'flavor', 'Nobody here yet.'));
    m.body.appendChild(list);
  }

  /** The raid log: recent raids you made and raids on you, each with a replay. */
  async openReplays(): Promise<void> {
    const online = this.game.online;
    if (!online) return;
    let rows;
    try {
      rows = await online.replays();
    } catch (e) {
      this.toast((e as Error).message, 'bad');
      return;
    }
    const m = this.modal('Raid Log', { headIcon: '<span style="font-size:30px">🎬</span>' });
    const list = el('div', 'league-list');
    for (const r of rows) {
      const atk = r.role === 'attack';
      const sign = atk ? '+' : '−';
      const row = el(
        'div',
        'league-row replay-row',
        `<span>${atk ? '⚔️ You raided' : '🛡️ Raided by'} <b>${esc(r.opponent)}</b><br><small>${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)} ${Math.floor(r.destruction * 100)}% · ${sign}${fmt(r.tuition)} Tuition · ${sign}${fmt(r.coffee)} Coffee · ${r.trophies >= 0 ? '+' : ''}${r.trophies} trophies · ${fmtTime(Math.max(0, (Date.now() - r.at) / 1000))} ago</small></span><span class="lb-side"></span>`,
      );
      const go = el('button', 'btn small gold', '🎬 Watch');
      go.title = 'Watch this raid again';
      go.onclick = () => {
        sfx('click');
        void this.game.watchReplay(r.id);
      };
      if (r.outdated) {
        go.setAttribute('disabled', '');
        go.title = 'Recorded before a game update changed the raid rules, so it can no longer be played back';
      }
      row.lastElementChild!.appendChild(go);
      if (r.revenge) {
        const rv = el('button', 'btn small red', '⚔️ Revenge');
        rv.title = `Raid ${r.opponent} back (free, once)`;
        rv.onclick = () => {
          sfx('click');
          void this.game.startRaid({ kind: 'revenge', raidId: r.id });
        };
        row.lastElementChild!.appendChild(rv);
      }
      list.appendChild(row);
    }
    if (!rows.length) list.appendChild(el('div', 'flavor', 'No raids yet. Go pick a fight, or wait for someone to pick one with you.'));
    m.body.appendChild(list);
  }

  // ---------- Visiting another campus ----------
  showVisit(v: VisitResponse): void {
    this.hideVisit();
    const hud = el('div', 'hud visit-hud');
    const buttons = el('div', 'profile visit-profile');
    const player = el('button', 'player-hud-card');
    player.setAttribute('aria-label', `Open ${v.name}'s profile`);
    player.onclick = () => { sfx('click'); this.openProfile(v.profile); };
    const league = el('button', 'trophy-box');
    league.setAttribute('aria-label', `Open ${v.name}'s League Ladder`);
    league.onclick = () => { sfx('click'); this.openLeagues(v.profile); };
    this.paintPlayerButtons(v.profile, player, league);
    buttons.append(player, league);
    hud.appendChild(buttons);
    const bar = el('div', 'visit-bar');
    bar.appendChild(el('span', '', '👀 Visiting campus'));
    const home = el('button', 'btn small gold', '🏠 Go home');
    home.onclick = () => {
      sfx('click');
      this.game.endVisit();
    };
    bar.appendChild(home);
    this.visitSel = el('div', 'sel-panel hidden');
    hud.append(bar, this.visitSel);
    this.root.appendChild(hud);
    this.visitHud = hud;
  }

  /** Name, level and description of the building clicked while visiting (look, don't touch). */
  visitSelect(b: VisitBuilding | null): void {
    const p = this.visitSel;
    if (!p) return;
    p.classList.toggle('hidden', !b);
    if (!b) return;
    const def = BUILDINGS[b.type];
    p.innerHTML = '';
    p.style.animation = 'none';
    void p.offsetWidth;
    p.style.animation = '';
    p.appendChild(el('div', 'sel-title stroke', `${esc(b.name ?? def.name)} <small>${b.level === 0 ? '(under construction)' : 'Level ' + b.level}${b.upgrading && b.level > 0 ? ' · upgrading' : ''}</small>`));
    p.appendChild(el('div', 'visit-desc stroke', def.desc));
  }

  hideVisit(): void {
    if (this.visitHud) this.closeModal();
    this.visitHud?.remove();
    this.visitHud = null;
    this.visitSel = null;
  }

  // ---------- What's new ----------
  /** Called once at start-up: queue the popup if there is something this browser hasn't seen. */
  checkWhatsNew(freshPlayer: boolean): void {
    if (freshPlayer) markChangeSeen(); // a brand-new player has nothing to catch up on
    else if (seenChange() < LATEST_CHANGE) this.whatsNewPending = true;
  }

  /** The update notes. Entries newer than `seen` get a NEW tag; from Settings nothing is tagged. */
  openWhatsNew(seen = LATEST_CHANGE): void {
    const m = this.modal("What's New", { narrow: true, headIcon: '<span style="font-size:30px">🎉</span>' });
    markChangeSeen();
    const days = new Map<string, typeof CHANGELOG>();
    for (const entry of CHANGELOG) days.set(entry.date, [...(days.get(entry.date) ?? []), entry]);
    m.body.appendChild(el('p', 'news-intro', 'Campus updates, grouped by day. Open a date to read all the details.'));
    let index = 0;
    for (const [date, entries] of days) {
      const isNew = entries.some((e) => e.v > seen);
      const box = el('section', `news news-day ${isNew ? 'new' : ''}`);
      box.appendChild(el('div', 'news-head', `<h3>${esc(date)}</h3>${isNew ? '<span class="news-tag">NEW</span>' : ''}<small>${entries.length} update${entries.length === 1 ? '' : 's'}</small>`));
      const preview = el('p', 'news-preview');
      preview.textContent = entries.map((e) => e.title).join(' · ');
      const more = el('button', 'news-toggle', 'Read More…');
      more.setAttribute('aria-label', `Read More… ${date}`);
      more.setAttribute('aria-expanded', 'false');
      const details = el('div', 'news-day-body');
      details.id = `news-day-${index++}`;
      details.hidden = true;
      details.tabIndex = -1;
      details.setAttribute('role', 'region');
      details.setAttribute('aria-label', `All updates for ${date}`);
      more.setAttribute('aria-controls', details.id);
      for (const e of entries) {
        const entry = el('div', 'news-entry');
        entry.appendChild(el('h4', '', esc(e.title)));
        const ul = el('ul');
        for (const it of e.items) ul.appendChild(el('li', '', esc(it)));
        entry.appendChild(ul);
        details.appendChild(entry);
      }
      const less = el('button', 'news-toggle', 'See Less…');
      less.setAttribute('aria-label', `See Less… ${date}`);
      less.setAttribute('aria-controls', details.id);
      less.setAttribute('aria-expanded', 'true');
      more.onclick = () => {
        sfx('click');
        preview.hidden = more.hidden = true;
        details.hidden = false;
        more.setAttribute('aria-expanded', 'true');
        details.focus({ preventScroll: true });
      };
      less.onclick = () => {
        sfx('click');
        details.hidden = true;
        preview.hidden = more.hidden = false;
        more.setAttribute('aria-expanded', 'false');
        more.focus({ preventScroll: true });
        box.scrollIntoView({ block: 'nearest' });
      };
      details.appendChild(less);
      box.append(preview, more, details);
      m.body.appendChild(box);
    }
    const ok = el('button', 'btn big', 'Got it');
    ok.style.marginTop = '4px';
    ok.onclick = () => {
      sfx('click');
      m.close();
    };
    m.body.appendChild(ok);
  }

  // ---------- Loading ----------
  showLoading(): Promise<void> {
    const l = el('div');
    l.id = 'loading';
    l.setAttribute('role', 'progressbar');
    l.setAttribute('aria-label', 'Loading Cedarville Clash');
    l.setAttribute('aria-valuemin', '0');
    l.setAttribute('aria-valuemax', '100');
    l.setAttribute('aria-valuenow', '0');
    l.textContent = 'Loading Cedarville Clash…';
    document.body.appendChild(l);
    const artwork = mountLoadingArtwork(l);
    return new Promise((res) => {
      // Startup is already complete here; animate this presentation at display
      // refresh speed instead of adding random percentage chunks on a timer.
      const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 900;
      const start = performance.now();
      const advance = (now: number): void => {
        const p = duration === 0 ? 1 : Math.max(0, Math.min(1, (now - start) / duration));
        artwork.setProgress(p);
        l.setAttribute('aria-valuenow', String(Math.round(p * 100)));
        if (p < 1) requestAnimationFrame(advance);
        else {
          setTimeout(() => {
            l.style.opacity = '0';
            setTimeout(() => { artwork.dispose(); l.remove(); }, 500);
            res();
          }, 600);
        }
      };
      requestAnimationFrame(advance);
    });
  }

  /**
   * Persistent bar asking the player to reload.
   * 'update': a new version was deployed. 'stale': a newer version is open in
   * another tab, so this tab has stopped saving to protect that progress.
   */
  showUpdateBar(kind: 'update' | 'stale'): void {
    const existing = document.getElementById('update-bar');
    if (existing) {
      if (existing.dataset.kind === 'stale' || kind === 'update') return; // stale wins
      existing.remove();
    }
    const bar = el('div', `update-bar ${kind}`);
    bar.id = 'update-bar';
    bar.dataset.kind = kind;
    const msg =
      kind === 'update'
        ? '🎉 A new version of Cedarville Clash is out! Reload to get it. Your progress is saved.'
        : '⚠️ A newer version of the game is open in another tab, so this tab has stopped saving to protect that progress. Reload to continue here.';
    bar.appendChild(el('span', 'stroke', msg));
    const reload = el('button', 'btn small gold', 'Reload');
    reload.onclick = async () => {
      // Save first if we're allowed to (an 'update' tab still owns the save).
      if (this.game.online) await this.game.online.flush();
      else if (kind === 'update') saveGame(this.state);
      this.game.resetting = true; // skip the beforeunload save; we just saved
      location.reload();
    };
    bar.appendChild(reload);
    if (kind === 'update') {
      const later = el('button', 'btn small gray', 'Later');
      later.onclick = () => bar.remove();
      bar.appendChild(later);
    }
    document.body.appendChild(bar);
  }

  /** Popup with a stern/cute message and an OK button. */
  popup(title: string, text: string, okLabel = 'OK'): void {
    const m = this.modal(title, { narrow: true });
    m.body.appendChild(el('div', 'popup-text', `<p>${text}</p>`));
    const b = el('button', 'btn big popup-ok', okLabel);
    b.onclick = () => m.close();
    m.body.appendChild(b);
  }
}

export type { BuildingType, TroopType };
