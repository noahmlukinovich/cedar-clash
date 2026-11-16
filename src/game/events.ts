import {
  CHAPEL_DAILY_BASE,
  CHAPEL_STREAK_BONUS,
  CHAPEL_STREAK_CAP,
  EVENT_CHANCE,
  EVENT_CHECK_INTERVAL,
  GRID,
} from '../config/balance';
import { ACHIEVEMENTS, type AchievementId, CHAPEL_SKIP_LINES, CONSTRUCTION_LINES, EVENT_INFO, TICKET_LINES } from '../config/humor';
import type { EventType } from '../config/types';
import { bus, toast } from '../core/bus';
import { pick } from '../core/rng';
import { armyCapacity, armyUsed } from './army';
import { bump, checkAchievements } from './achievements';
import { dayKey } from './daily';
import { BORDER, addRes, hasEvent, occupancy } from './economy';
import type { ActiveEvent, GameState } from './state';

export function startEvent(s: GameState, type: EventType, duration?: number): void {
  s.events = s.events.filter((e) => e.type !== type);
  const ev: ActiveEvent = { type, end: s.clock + (duration ?? defaultDuration(type)) };
  if (type === 'construction') {
    const occ = occupancy(s);
    for (let tries = 0; tries < 200; tries++) {
      const x = BORDER + Math.floor(Math.random() * (GRID - 2 * BORDER - 2));
      const y = BORDER + Math.floor(Math.random() * (GRID - 2 * BORDER - 2));
      if (!occ[y * GRID + x] && !occ[y * GRID + x + 1] && !occ[(y + 1) * GRID + x] && !occ[(y + 1) * GRID + x + 1]) {
        ev.x = x;
        ev.y = y;
        break;
      }
    }
    if (ev.x === undefined) return;
    toast(pick(CONSTRUCTION_LINES), 'event');
  } else {
    const info = EVENT_INFO[type];
    toast(`${info.icon} ${info.name}! ${info.desc}`, 'event');
  }
  s.events.push(ev);
  bus.emit('eventStart', ev);
}

function defaultDuration(type: EventType): number {
  switch (type) {
    case 'finals':
      return 180;
    case 'construction':
      return 240;
    case 'elephantrun':
      return 300;
    case 'ringbyspring':
      return 300;
  }
}

export function isSpring(): boolean {
  const m = new Date().getMonth();
  return m >= 2 && m <= 4;
}

export function tickEvents(s: GameState, _dt: number): void {
  // Rules that are not driven by a counter (DMC level, trophies, chapel streak).
  checkAchievements(s);
  const before = s.events.length;
  s.events = s.events.filter((e) => e.end > s.clock);
  if (s.events.length !== before) bus.emit('eventsChanged');

  // Real-world spring = Ring by Spring season is always on.
  if (isSpring() && !hasEvent(s, 'ringbyspring')) {
    s.events.push({ type: 'ringbyspring', end: s.clock + 3600 });
  }

  if (s.clock >= s.nextEventCheck) {
    s.nextEventCheck = s.clock + EVENT_CHECK_INTERVAL;
    if (Math.random() < EVENT_CHANCE) {
      const options: EventType[] = ['finals', 'construction', 'elephantrun', 'ringbyspring'];
      const avail = options.filter((o) => !hasEvent(s, o));
      if (avail.length) startEvent(s, pick(avail));
    }
  }

  if (s.clock >= s.nextTicketCheck) {
    s.nextTicketCheck = s.clock + 200 + Math.random() * 120;
    const cap = armyCapacity(s);
    if (cap > 0 && armyUsed(s) >= cap * 0.75 && s.clock - s.lastRaidClock > 150) {
      const fine = Math.min(400, Math.max(25, Math.floor(s.resources.tuition * 0.03)));
      s.resources.tuition = Math.max(0, s.resources.tuition - fine);
      bump(s, 'tickets');
      bus.emit('ticket', { text: pick(TICKET_LINES), fine });
    }
  }
}

// ---------- Chapel ----------

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000);
}

export function canAttendChapel(s: GameState): boolean {
  return s.chapel.lastDay !== dayKey();
}

export function chapelReward(s: GameState): number {
  const streak = Math.min(CHAPEL_STREAK_CAP, s.chapel.streak + 1);
  return CHAPEL_DAILY_BASE + CHAPEL_STREAK_BONUS * (streak - 1);
}

export function attendChapel(s: GameState): number {
  if (!canAttendChapel(s)) return 0;
  const today = dayKey();
  if (s.chapel.lastDay && daysBetween(s.chapel.lastDay, today) === 1) s.chapel.streak++;
  else s.chapel.streak = 1;
  const r = chapelReward({ ...s, chapel: { ...s.chapel, streak: s.chapel.streak - 1 } } as GameState);
  s.chapel.lastDay = today;
  addRes(s, 'chapel', r);
  checkAchievements(s);
  return r;
}

/** Returns a stern message if the player skipped chapel (missed at least one full day). */
export function checkChapelSkip(s: GameState): string | null {
  const today = dayKey();
  if (!s.chapel.lastDay) return null;
  if (s.chapel.skipNoticeShown === today) return null;
  const gap = daysBetween(s.chapel.lastDay, today);
  if (gap >= 2) {
    s.chapel.skipNoticeShown = today;
    s.chapel.streak = 0;
    return pick(CHAPEL_SKIP_LINES);
  }
  return null;
}

export function claimAchievementReward(s: GameState, id: AchievementId): void {
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (a) addRes(s, 'chapel', a.reward);
}

export function constructionTile(s: GameState): { x: number; y: number } | null {
  const e = s.events.find((e) => e.type === 'construction' && e.end > s.clock);
  return e && e.x !== undefined && e.y !== undefined ? { x: e.x, y: e.y } : null;
}
