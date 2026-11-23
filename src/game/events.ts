import { BUILDINGS } from '../config/buildings';
import {
  CHAPEL_DAILY_BASE,
  CHAPEL_STREAK_BONUS,
  CHAPEL_STREAK_CAP,
  EVENT_CHANCE,
  EVENT_CHECK_INTERVAL,
} from '../config/balance';
import { CHAPEL_SKIP_LINES, EVENT_INFO } from '../config/humor';
import { bus, toast } from '../core/bus';
import { pick } from '../core/rng';
import { checkAchievements } from './achievements';
import { addRes, hasEvent } from './economy';
import type { ActiveEvent, GameState } from './state';

export function startEvent(s: GameState, type: ActiveEvent['type'], duration?: number): void {
  const info = EVENT_INFO[type];
  // Ignore retired event values from old clients without bringing their fences back.
  if (!info) return;
  s.events = s.events.filter((e) => e.type !== type);
  const ev: ActiveEvent = { type, end: s.clock + (duration ?? defaultDuration(type)) };
  toast(`${info.icon} ${info.name}! ${info.desc}`, 'event');
  s.events.push(ev);
  bus.emit('eventStart', ev);
}

function defaultDuration(type: ActiveEvent['type']): number {
  switch (type) {
    case 'finals':
      return 180;
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

export function tickEvents(s: GameState, dt: number): void {
  const before = s.events.length;
  s.events = s.events.filter((e) => EVENT_INFO[e.type] && e.end > s.clock);
  if (s.events.length !== before) bus.emit('eventsChanged');

  // Real-world spring = Ring by Spring season is always on.
  if (isSpring() && !hasEvent(s, 'ringbyspring')) {
    s.events.push({ type: 'ringbyspring', end: s.clock + 3600 });
  }

  if (s.clock >= s.nextEventCheck) {
    s.nextEventCheck = s.clock + EVENT_CHECK_INTERVAL;
    if (Math.random() < EVENT_CHANCE) {
      const options: ActiveEvent['type'][] = ['finals', 'elephantrun', 'ringbyspring'];
      const avail = options.filter((o) => !hasEvent(s, o));
      if (avail.length) startEvent(s, pick(avail));
    }
  }


}

// ---------- Chapel ----------

export function dayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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

export { BUILDINGS };
