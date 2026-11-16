// Turns the simulation's event list into particles, sounds, banners and camera shake.
// Purely cosmetic: nothing here feeds back into the raid.
import { STINGER_TIP_Z } from '../render/buildingSprites';
import { WIND_LINES } from '../config/humor';
import { HEROES } from '../config/troops';
import { SPELLS } from '../config/spells';
import { sfx } from '../core/audio';
import { toWorld } from '../core/iso';
import { pick } from '../core/rng';
import { C } from '../render/draw';
import type { RaidScene } from './raidScene';

/** Aleph to tav: the Bible Prof's ammunition, fired in order. */
export const HEBREW = 'אבגדהוזחטיכלמנסעפצקרשת';
/** Seconds a letter takes to reach its target. */
export const LETTER_FLIGHT = 0.18;

export function playSimEvents(sc: RaidScene): void {
  const P2 = sc.particles;
  for (const ev of sc.sim.events) {
    switch (ev.e) {
      case 'hit': {
        const p = toWorld(ev.x, ev.y);
        if (ev.kind === 'melee') {
          P2.burst(p.x, p.y, 14, 3, { kind: 'spark', color: '#fff3b0', size: 3, speed: 70, max: 0.25 });
          sfx('hit');
        } else if (ev.kind === 'pen') {
          P2.burst(p.x, p.y, 20, 4, { kind: 'spark', color: C.red, size: 4, speed: 80, max: 0.3 });
          sfx('hit');
        } else if (ev.kind === 'writeup') {
          P2.burst(p.x, p.y, 16, 3, { kind: 'confetti', color: '#fff', size: 6, speed: 60, max: 0.5, gravity: 100 });
        } else if (ev.kind === 'ticket') {
          P2.burst(p.x, p.y, 16, 5, { kind: 'confetti', color: '#ff8fb8', size: 7, speed: 90, max: 0.6, gravity: 150 });
        }
        break;
      }
      case 'death': {
        const p = toWorld(ev.u.x, ev.u.y);
        P2.poof(p.x, p.y, ev.u.hero ? 2 : 1);
        // GO Team members whose trip is over just head home: no gravestone
        if (ev.u.side === 'atk' && !(ev.u.expireAt > 0 && sc.sim.time >= ev.u.expireAt)) sc.graves.push({ x: ev.u.x, y: ev.u.y, t: 0 });
        if (ev.u.hero) {
          sc.game.ui.toast(`${HEROES[ev.u.hero].name} has been knocked out! (They'll recover back home.)`, 'bad');
          sc.hud.renderCards();
        }
        sfx('pop');
        break;
      }
      case 'destroyed': {
        const b = ev.b;
        const p = toWorld(b.cx, b.cy);
        if (b.isWall) {
          P2.burst(p.x, p.y, 8, 8, { kind: 'shard', color: '#b5523b', size: 6, speed: 90, max: 0.8, gravity: 400, vz: 150 });
          P2.poof(p.x, p.y, 0.8);
          sfx('hit');
        } else {
          P2.explosion(p.x, p.y, b.size / 2.5);
          sc.cam.shake(b.type === 'dmc' ? 14 : 6, b.type === 'dmc' ? 0.6 : 0.3);
          sfx('boom');
          if (b.type === 'dmc') P2.text(p.x, p.y - 60, 40, 'DMC DOWN!', '#ffe066', 28);
          if (b.type === 'safetycart') P2.text(p.x, p.y - 40, 30, 'Ticket voided!', '#ff8fb8', 16);
          if (b.type === 'ratower') P2.text(p.x, p.y - 40, 30, 'Quiet hours over!', '#fff', 16);
          if (b.type === 'stinger') P2.text(p.x, p.y - 40, 30, 'Stinger un-stung!', '#9fd4ff', 16);
        }
        break;
      }
      case 'shoot':
        sfx(ev.kind === 'ticket' ? 'cannon' : 'shoot');
        break;
      case 'freeze': {
        const b = ev.b;
        const p = toWorld(b.cx, b.cy);
        const r = b.def?.range ?? 5;
        P2.add({ kind: 'ring', x: p.x, y: p.y, z: 0, max: 0.6, size: 10, grow: r * 45 * 1.6, color: 'rgba(170,230,255,0.9)' });
        P2.burst(p.x, p.y, 30, 30, { kind: 'shard', color: '#d8f3ff', size: 6, speed: r * 30, max: 1, gravity: 200, vz: 100 });
        P2.text(p.x, p.y - 60, 40, 'FREEZE!', '#bfeaff', 22);
        sfx('freeze');
        break;
      }
      case 'pray': {
        const b = ev.b;
        const from = toWorld(b.cx, b.cy);
        const to = toWorld(ev.x, ev.y);
        const top = 48 + b.level * 6 + 30;
        sc.beams.push({ x1: from.x, y1: from.y - top, x2: to.x, y2: to.y, t: 0.35, color: 'rgba(255,236,150,0.9)' });
        P2.add({ kind: 'ring', x: to.x, y: to.y, z: 0, max: 0.5, size: 8, grow: ev.r * 45 * 2, color: 'rgba(255,225,120,0.95)' });
        P2.burst(to.x, to.y, 10, 18, { kind: 'glow', color: 'rgba(255,240,170,0.9)', size: 5, speed: ev.r * 50, max: 0.6, vz: 60 });
        sfx('pray');
        break;
      }
      case 'ramp': {
        const b = ev.b;
        const p = toWorld(b.cx, b.cy);
        P2.add({ kind: 'ring', x: p.x, y: p.y - STINGER_TIP_Z, z: 0, max: 0.4, size: 4, grow: 60 + ev.stage * 40, color: 'rgba(120,200,255,0.9)' });
        if (ev.stage >= (b.def?.ramp?.length ?? 1) - 1) P2.text(p.x, p.y - 70, 40, 'SMITE!', '#9fd4ff', 22);
        sfx('ramp');
        break;
      }
      case 'swarm': {
        const p = toWorld(ev.x, ev.y);
        for (let i = 0; i < 16; i++) {
          P2.add({ kind: 'bee', x: p.x, y: p.y, ox: p.x + (Math.random() - 0.5) * ev.r * 50, oy: p.y + (Math.random() - 0.5) * ev.r * 25, size: 3 + Math.random() * ev.r * 4, max: 5, vr: Math.random() * 3 });
        }
        P2.text(p.x, p.y - 40, 30, 'BZZZT! Yellow Jackets!', C.gold, 18);
        sfx('buzz');
        setTimeout(() => sfx('buzz'), 900);
        break;
      }
      case 'heal': {
        const p = toWorld(ev.u.x, ev.u.y);
        P2.add({ kind: 'text', x: p.x + (Math.random() - 0.5) * 10, y: p.y, z: 30, vz: 30, max: 0.7, text: '+', color: '#5ef08a', size: 14 });
        sfx('heal');
        break;
      }
      case 'loot': {
        const p = toWorld(ev.x, ev.y);
        P2.text(p.x + (Math.random() - 0.5) * 30, p.y, 40, `+${Math.round(ev.amt)}`, ev.res === 'tuition' ? '#ffe066' : '#e0b08a', 14);
        P2.burst(p.x, p.y, 30, 3, { kind: 'spark', color: ev.res === 'tuition' ? C.gold : '#7a4520', size: 5, speed: 60, max: 0.6, gravity: 300, vz: 150 });
        if (Math.random() < 0.5) sfx('coin');
        break;
      }
      case 'star':
        sc.game.ui.banner(`★ ${ev.why}`, '#ffe066');
        sfx('star');
        break;
      case 'fans': {
        const p = toWorld(ev.b.cx, ev.b.cy);
        P2.text(p.x, p.y - 70, 40, 'DE-FENSE! DE-FENSE!', C.gold, 18);
        sfx('whistle');
        break;
      }
      case 'bless': {
        const p = toWorld(ev.b.cx, ev.b.cy);
        P2.add({ kind: 'glow', x: p.x + (Math.random() - 0.5) * 16, y: p.y, z: 14, vz: 25, max: 0.8, size: 3, color: 'rgba(255,230,120,0.9)' });
        break;
      }
      case 'wind':
        if (ev.on) {
          sc.game.ui.banner(`🌬️ ${pick(WIND_LINES)}`, '#cfe9ff');
          sfx('wind');
          sc.cam.shake(4, 0.5);
        }
        break;
      case 'unload': {
        const p = toWorld(ev.x, ev.y);
        P2.burst(p.x, p.y, 10, 14, { kind: 'puff', color: '#fff', size: 7, speed: 80, max: 0.5, grow: 10 });
        P2.text(p.x, p.y - 40, 40, pick(['Everybody out!', 'GO Team, go!', 'We brought snacks!']), '#ffe58a', 16);
        sfx('deploy');
        break;
      }
      case 'bolt':
        sc.letters.push({ fx: ev.fx, fy: ev.fy, tx: ev.tx, ty: ev.ty, ch: HEBREW[ev.n % HEBREW.length], big: ev.big, t: 0 });
        sfx(ev.big ? 'cannon' : 'shoot');
        break;
      case 'chorus': {
        const p = toWorld(ev.x, ev.y);
        P2.add({ kind: 'text', x: p.x + (Math.random() - 0.5) * 20, y: p.y, z: 40, vz: 35, max: 0.9, text: '♪♫', color: '#ff9fd0', size: 18 });
        break;
      }
      case 'roomcheck': {
        const p = toWorld(ev.u.x, ev.u.y);
        P2.text(p.x, p.y - 50, 40, 'Room check!', '#cfe9ff', 16);
        break;
      }
      case 'wander': {
        const p = toWorld(ev.u.x, ev.u.y);
        P2.add({ kind: 'text', x: p.x, y: p.y, z: 40, vz: 20, max: 1.2, text: pick(['?', 'where is ENS??', 'is this the DMC?', '?!']), color: '#fff', size: 12 });
        break;
      }
      case 'spell': {
        const p = toWorld(ev.x, ev.y);
        const col = SPELLS[ev.kind].color;
        P2.add({ kind: 'ring', x: p.x, y: p.y, z: 0, max: 0.5, size: 10, grow: ev.r * 45 * 2, color: col });
        P2.burst(p.x, p.y, 40, 20, { kind: 'spark', color: col, size: 5, speed: 100, max: 0.8, gravity: 200, vz: 60 });
        if (ev.kind === 'snowday') {
          for (let i = 0; i < 40; i++)
            P2.add({ kind: 'snow', x: p.x + (Math.random() - 0.5) * ev.r * 90, y: p.y + (Math.random() - 0.5) * ev.r * 45, z: 80 + Math.random() * 60, vz: -40, max: 2.5, size: 2.5, color: '#fff' });
          sc.game.ui.banner('❄️ SNOW DAY! Classes (and defenses) cancelled!', '#cfefff');
        }
        if (ev.kind === 'allnighter') sc.game.ui.banner('⚡ ALL-NIGHTER!', '#ff9fd0');
        if (ev.kind === 'announcement') sc.game.ui.banner('📣 "Just a few quick announcements…"', '#ffe58a');
        sfx('spell');
        break;
      }
      case 'ability': {
        const p = toWorld(ev.u.x, ev.u.y);
        if (ev.kind === 'quiz') {
          sc.game.ui.banner('📝 POP QUIZ! Pencils down, defenses!', '#ffffff');
          P2.burst(p.x, p.y, 30, 30, { kind: 'confetti', color: '#fff', size: 8, speed: 220, max: 1.2, gravity: 150, vz: 120 });
          sfx('stun');
        } else {
          sc.game.ui.banner('🎓 CONVOCATION! Everybody rise!', C.gold);
          P2.burst(p.x, p.y, 30, 40, { kind: 'confetti', color: C.gold, size: 8, speed: 260, max: 1.4, gravity: 150, vz: 160 });
          P2.burst(p.x, p.y, 30, 30, { kind: 'confetti', color: C.roofBlue, size: 8, speed: 260, max: 1.4, gravity: 150, vz: 160 });
          sfx('win');
        }
        sc.cam.shake(6, 0.4);
        break;
      }
    }
  }
  sc.sim.events.length = 0;
}
