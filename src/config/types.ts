// Shared config types. All balancing numbers live in src/config/*.ts.

export type ResourceId = 'tuition' | 'coffee' | 'chapel';

export type BuildingCategory =
  | 'core'
  | 'resource'
  | 'army'
  | 'defense'
  | 'trap'
  | 'wall'
  | 'deco';

export type BuildingType =
  | 'dmc'
  | 'shed'
  | 'library'
  | 'hive'
  | 'admissions'
  | 'coffeecart'
  | 'registrar'
  | 'rinnova'
  | 'reshall'
  | 'ens'
  | 'health'
  | 'biblical'
  | 'callan'
  | 'ssc'
  | 'faculty'
  | 'presidents'
  | 'ratower'
  | 'safetycart'
  | 'sprayer'
  | 'bibleprof'
  | 'nest'
  | 'wall'
  | 'lake';

export interface DefenseStats {
  range: number; // tiles
  dps: number; // damage per second (single target) or per hit / rate
  rate: number; // seconds between shots
  splash?: number; // splash radius in tiles
  projectileSpeed?: number; // tiles per second, 0 = instant
  slow?: number; // fraction removed from speed (sprayer)
  freezeCharge?: number; // seconds to charge freeze
  freezeTime?: number;
  blessHeal?: number; // walls healed per second (fraction of max)
}

export interface BuildingLevel {
  cost: number;
  res: ResourceId;
  time: number; // seconds
  dmc: number; // required DMC level
  hp: number;
  // resource
  rate?: number; // per minute production
  capacity?: number; // collector internal cap or storage cap
  // army
  housing?: number; // residence halls
  // defense
  defense?: DefenseStats;
  // hive
  fans?: number;
  // trap
  trapDps?: number;
  trapRadius?: number;
  trapDuration?: number;
}

export interface BuildingDef {
  type: BuildingType;
  name: string;
  category: BuildingCategory;
  size: number;
  desc: string;
  flavor: string;
  /** max count indexed by DMC level (index 0 unused). */
  counts: number[];
  levels: BuildingLevel[]; // levels[0] is level 1
  /** Optional rotating names for multiple instances (residence halls). */
  instanceNames?: string[];
  blocksPath?: boolean; // default true
  /** troops trained here */
  trains?: TroopType[];
  movable?: boolean;
  removable?: boolean;
}

export type TroopType = 'freshman' | 'engineer' | 'nurse' | 'theology' | 'athlete';
export type HeroType = 'prof' | 'president';
export type UnitType = TroopType | HeroType | 'fan';

export interface TroopLevel {
  hp: number;
  dps: number;
  cost: number; // training cost
  researchCost: number; // cost to research to THIS level (level 1 = 0)
  researchTime: number; // seconds
  libraryLevel: number; // required library level to research
}

export interface TroopDef {
  type: UnitType;
  name: string;
  desc: string;
  flavor: string;
  housing: number;
  res: ResourceId;
  trainTime: number; // seconds
  barracks: BuildingType;
  barracksLevel: number;
  speed: number; // tiles per second
  range: number; // tiles
  attackRate: number; // seconds
  prefers: 'any' | 'defense' | 'wall' | 'heal' | 'resource';
  wallMul?: number;
  splash?: number;
  heal?: number; // heal per second (healers)
  healRadius?: number;
  aura?: { radius: number; dmg: number; speed: number };
  levels: TroopLevel[];
  color: string;
  size: number; // render scale
}

export interface HeroLevel {
  hp: number;
  dps: number;
  upgradeCost: number; // chapel credits to reach this level
  upgradeTime: number;
  dmc: number;
}

export interface HeroDef {
  type: HeroType;
  name: string;
  desc: string;
  flavor: string;
  building: BuildingType;
  ability: { name: string; desc: string; radius: number; duration: number };
  speed: number;
  range: number;
  attackRate: number;
  levels: HeroLevel[];
  regenTime: number; // seconds to fully recover after a raid at 0 hp
}

export type SpellType = 'allnighter' | 'snowday' | 'announcement';

export interface SpellDef {
  type: SpellType;
  name: string;
  desc: string;
  flavor: string;
  res: ResourceId;
  cost: number;
  brewTime: number;
  housing: number;
  sscLevel: number;
  radius: number;
  duration: number;
  color: string;
}
