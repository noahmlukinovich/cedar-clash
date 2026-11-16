// Data shapes shared by the raid simulation modules.
import type { BuildingType, DefenseStats, HeroType, SpellType, TroopType, UnitType } from '../../config/types';

export interface RB {
  uid: number;
  type: BuildingType;
  level: number;
  x: number;
  y: number;
  size: number;
  cx: number;
  cy: number;
  hp: number;
  maxHp: number;
  dead: boolean;
  isWall: boolean;
  isTrap: boolean;
  isDefense: boolean;
  counts: boolean; // counts towards destruction %
  def?: DefenseStats;
  cd: number;
  target: RU | null;
  aim: number;
  firing: number;
  charge: number;
  prayT: number;
  prayTarget: { x: number; y: number } | null;
  frozenUntil: number;
  stunUntil: number;
  hidden: boolean;
  loot: { tuition: number; coffee: number };
  lootTaken: { tuition: number; coffee: number };
  fansLeft: number;
  fanTimer: number;
  hitT: number;
}

export interface RU {
  uid: number;
  type: UnitType;
  side: 'atk' | 'def';
  hero?: HeroType;
  level: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  dps: number;
  speed: number;
  range: number;
  rate: number;
  cd: number;
  tb: RB | null; // building target
  tu: RU | null; // unit target
  path: number[];
  pathI: number;
  needsPath: boolean;
  wall: RB | null; // wall blocking the path
  frozenUntil: number;
  slowUntil: number;
  slowMul: number;
  stunUntil: number;
  rageUntil: number;
  convoUntil: number;
  auraUntil: number;
  pairedUntil: number;
  ignoreTrapsUntil: number;
  wanderUntil: number;
  wdx: number;
  wdy: number;
  face: number;
  t: number;
  attackT: number;
  moving: boolean;
  dead: boolean;
  flash: number;
  abilityUsed: boolean;
  idleT: number;
  elephant?: boolean;
  leader?: RU | null;
}

export interface Projectile {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  tx: number;
  ty: number;
  target: RU | null;
  dmg: number;
  t: number;
  dur: number;
  kind: 'writeup' | 'ticket' | 'pen' | 'fan';
}

export interface Zone {
  kind: SpellType | 'swarm' | 'quiz' | 'convo';
  x: number;
  y: number;
  r: number;
  until: number;
  start: number;
  dps: number;
}

export type SimEvent =
  | { e: 'hit'; x: number; y: number; dmg: number; kind: string }
  | { e: 'death'; u: RU }
  | { e: 'destroyed'; b: RB }
  | { e: 'shoot'; b: RB; kind: string }
  | { e: 'freeze'; b: RB }
  | { e: 'pray'; b: RB; x: number; y: number; r: number }
  | { e: 'swarm'; x: number; y: number; r: number }
  | { e: 'heal'; u: RU }
  | { e: 'loot'; res: 'tuition' | 'coffee'; amt: number; x: number; y: number }
  | { e: 'star'; n: number; why: string }
  | { e: 'fans'; b: RB }
  | { e: 'bless'; b: RB }
  | { e: 'wind'; on: boolean; dir: number }
  | { e: 'wander'; u: RU }
  | { e: 'spell'; kind: SpellType; x: number; y: number; r: number }
  | { e: 'ability'; kind: 'quiz' | 'convo'; u: RU };

export interface RaidOptions {
  troopLevels: Record<TroopType, number>;
  heroLevels: Record<HeroType, number>;
  ringBySpring: boolean;
  wind: boolean;
  elephant: boolean;
  /** Seeds every random roll in the raid. Same seed + same inputs = same raid. */
  seed: number;
}
