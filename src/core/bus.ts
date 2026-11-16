// Minimal typed event bus for game -> UI notifications.
import type { AchievementId } from '../config/humor';
import type { HeroType, TroopType } from '../config/types';
import type { ActiveEvent, BuildingInst } from '../game/state';

export type ToastKind = 'info' | 'good' | 'bad' | 'event';

/** Every event the bus carries, and its payload (`void` means none). */
export interface BusEvents {
  toast: { text: string; kind: ToastKind };
  selection: BuildingInst | null;
  mode: 'idle' | 'placing' | 'moving';
  changed: void;
  buildingDone: BuildingInst;
  achievement: AchievementId;
  eventStart: ActiveEvent;
  eventsChanged: void;
  ticket: { text: string; fine: number };
  trained: TroopType;
  researchDone: TroopType;
  heroDone: HeroType;
}

type Handler<K extends keyof BusEvents> = (data: BusEvents[K]) => void;
const handlers: { [K in keyof BusEvents]?: Handler<K>[] } = {};

export const bus = {
  on<K extends keyof BusEvents>(ev: K, h: Handler<K>): void {
    ((handlers[ev] ??= []) as Handler<K>[]).push(h);
  },
  emit<K extends keyof BusEvents>(ev: K, ...data: BusEvents[K] extends void ? [] : [BusEvents[K]]): void {
    for (const h of (handlers[ev] ?? []) as Handler<K>[]) h(data[0] as BusEvents[K]);
  },
};

export function toast(text: string, kind: ToastKind = 'info'): void {
  bus.emit('toast', { text, kind });
}
