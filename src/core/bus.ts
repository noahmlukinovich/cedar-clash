// Minimal event bus for game -> UI notifications.
type Handler = (data: any) => void;
const handlers: Record<string, Handler[]> = {};

export const bus = {
  on(ev: string, h: Handler): void {
    (handlers[ev] ??= []).push(h);
  },
  emit(ev: string, data?: any): void {
    for (const h of handlers[ev] ?? []) h(data);
  },
};

export function toast(text: string, kind: 'info' | 'good' | 'bad' | 'event' = 'info'): void {
  bus.emit('toast', { text, kind });
}
