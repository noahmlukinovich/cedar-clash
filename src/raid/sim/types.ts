// Data shapes and constants shared by the raid simulation modules.
import type { BuildingType, DefenseStats, HeroType, SpellType, TroopDef, TroopType, UnitType } from '../../config/types';

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
  beamT: number; // stinger: seconds locked on the current target
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
  /** Config for trainable troops (undefined for heroes, fans and GO Team members). */
  def?: TroopDef;
  /** Hits landed (Music Major chorus). */
  hits: number;
  /** Seconds of uninterrupted running (Cross Country Runner momentum). */
  runT: number;
  /** GO Team members go home at this time (0 = never). */
  expireAt: number;
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

/** Lock-on stage (0-based) of a ramping beam defense after `beamT` seconds on one target. */
export function beamStage(d: DefenseStats, beamT: number): number {
  let s = 0;
  for (const t of d.rampTimes ?? []) if (beamT >= t) s++;
  return Math.min(s, (d.ramp?.length ?? 1) - 1);
}

export type SimEvent =
  | { e: 'hit'; x: number; y: number; dmg: number; kind: string }
  | { e: 'death'; u: RU }
  | { e: 'destroyed'; b: RB }
  | { e: 'shoot'; b: RB; kind: string }
  | { e: 'freeze'; b: RB }
  | { e: 'pray'; b: RB; x: number; y: number; r: number }
  | { e: 'ramp'; b: RB; stage: number }
  | { e: 'swarm'; x: number; y: number; r: number }
  | { e: 'heal'; u: RU }
  | { e: 'loot'; res: 'tuition' | 'coffee'; amt: number; x: number; y: number }
  | { e: 'star'; n: number; why: string }
  | { e: 'fans'; b: RB }
  | { e: 'bless'; b: RB }
  | { e: 'wind'; on: boolean; dir: number }
  | { e: 'wander'; u: RU }
  | { e: 'spell'; kind: SpellType; x: number; y: number; r: number }
  | { e: 'ability'; kind: 'quiz' | 'convo'; u: RU }
  | { e: 'unload'; x: number; y: number }
  | { e: 'chorus'; x: number; y: number }
  | { e: 'roomcheck'; u: RU }
  /** The Bible Prof's crossbow: letter `n` of the Hebrew alphabet flies from (fx, fy) to (tx, ty). Visual only. */
  | { e: 'bolt'; fx: number; fy: number; tx: number; ty: number; n: number; big: boolean };

export interface RaidOptions {
  troopLevels: Record<TroopType, number>;
  heroLevels: Record<HeroType, number>;
  ringBySpring: boolean;
  wind: boolean;
  elephant: boolean;
  /** Seeds every gameplay-affecting random roll, so a raid replays identically from its inputs. */
  seed: number;
}

/** Fixed unit vectors for "lost freshman" wandering (avoids cos/sin, which can differ across JS engines). */
export const WANDER_DIRS: [number, number][] = [
  [1, 0], [0.9238795325, 0.3826834324], [0.7071067812, 0.7071067812], [0.3826834324, 0.9238795325],
  [0, 1], [-0.3826834324, 0.9238795325], [-0.7071067812, 0.7071067812], [-0.9238795325, 0.3826834324],
  [-1, 0], [-0.9238795325, -0.3826834324], [-0.7071067812, -0.7071067812], [-0.3826834324, -0.9238795325],
  [0, -1], [0.3826834324, -0.9238795325], [0.7071067812, -0.7071067812], [0.9238795325, -0.3826834324],
];

/** Aleph to tav. */
export const HEBREW_LETTERS = 22;

/** What a Business Major goes for first. */
export const RESOURCE_TYPES: BuildingType[] = ['registrar', 'rinnova', 'admissions', 'coffeecart'];
