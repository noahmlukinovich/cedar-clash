import type { BuildingType, HeroType, ResourceId, SpellType, TroopType } from '../config/types';
import { BUILDINGS } from '../config/buildings';
import { START_RESOURCES } from '../config/balance';

export interface Timer {
  end: number; // game clock seconds
  total: number;
}

export interface BuildingInst {
  id: number;
  type: BuildingType;
  x: number;
  y: number;
  level: number; // 0 = under initial construction
  upgrade?: Timer & { to: number };
  stored?: number; // collectors: accumulated resources
  name?: string;
}

export interface QueueItem<T> {
  type: T;
  left: number; // seconds remaining
  total: number;
  chucks?: number; // seconds stuck "in line at Chuck's"
}

export interface HeroState {
  level: number;
  hpFrac: number; // 0..1, recovers over time
  upgrade?: Timer & { to: number };
}

export interface ActiveEvent {
  type: 'ringbyspring' | 'finals' | 'construction' | 'elephantrun';
  end: number;
  x?: number;
  y?: number;
}

export interface GameState {
  version: number;
  clock: number;
  lastReal: number;
  nextId: number;
  resources: Record<ResourceId, number>;
  buildings: BuildingInst[];
  army: Partial<Record<TroopType, number>>;
  trainQueue: QueueItem<TroopType>[];
  spells: Partial<Record<SpellType, number>>;
  spellQueue: QueueItem<SpellType>[];
  troopLevels: Record<TroopType, number>;
  research?: Timer & { troop: TroopType };
  heroes: Record<HeroType, HeroState>;
  trophies: number;
  bestTrophies: number;
  stats: Record<string, number>;
  achievements: Record<string, boolean>;
  chapel: { lastDay: string | null; streak: number; skipNoticeShown?: string };
  events: ActiveEvent[];
  nextEventCheck: number;
  settings: { muted: boolean; speedIdx: number; debug: boolean };
  campaignDone: boolean;
  lastRaidClock: number;
  nextTicketCheck: number;
  playerName: string;
}

export const SAVE_VERSION = 3;

export function newGame(): GameState {
  const s: GameState = {
    version: SAVE_VERSION,
    clock: 0,
    lastReal: Date.now(),
    nextId: 1,
    resources: { ...START_RESOURCES },
    buildings: [],
    army: { freshman: 20 },
    trainQueue: [],
    spells: {},
    spellQueue: [],
    troopLevels: { freshman: 1, engineer: 1, nurse: 1, theology: 1, athlete: 1 },
    heroes: { prof: { level: 1, hpFrac: 1 }, president: { level: 1, hpFrac: 1 } },
    trophies: 0,
    bestTrophies: 0,
    stats: {},
    achievements: {},
    chapel: { lastDay: null, streak: 0 },
    events: [],
    nextEventCheck: 60,
    settings: { muted: false, speedIdx: 0, debug: false },
    campaignDone: false,
    lastRaidClock: 0,
    nextTicketCheck: 240,
    playerName: 'Your Campus',
  };
  const add = (type: BuildingType, x: number, y: number, level = 1): void => {
    const b: BuildingInst = { id: s.nextId++, type, x, y, level };
    if (BUILDINGS[type].instanceNames) b.name = BUILDINGS[type].instanceNames![0];
    if (type === 'admissions' || type === 'coffeecart') b.stored = 200;
    s.buildings.push(b);
  };
  add('dmc', 18, 18);
  add('shed', 14, 17);
  add('shed', 14, 20);
  add('admissions', 23, 17);
  add('coffeecart', 23, 21);
  add('registrar', 18, 14);
  add('rinnova', 18, 23);
  add('reshall', 26, 25);
  add('biblical', 26, 14);
  add('safetycart', 21, 14);
  add('safetycart', 15, 23);
  add('lake', 11, 27);
  return s;
}
