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
  | 'business'
  | 'music'
  | 'ssc'
  | 'faculty'
  | 'presidents'
  | 'ratower'
  | 'safetycart'
  | 'sprayer'
  | 'bibleprof'
  | 'stinger'
  | 'catapult'
  | 'deans'
  | 'nest'
  | 'firealarm'
  | 'wall'
  | 'gate'
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
  ramp?: number[]; // beam dps per lock-on stage (stinger)
  rampTimes?: number[]; // seconds of continuous lock to reach stage 2, 3, ...
  multiDps?: number; // stinger multi mode: flat beam dps on each target (no ramp)
  multiTargets?: number; // stinger multi mode: how many raiders it beams at once
  minRange?: number; // tiles: can't fire at anything closer than this (catapult blind spot)
  lobTime?: number; // seconds a lobbed shot is in the air (it lands where it was aimed)
  falloff?: number; // splash damage at the rim, as a fraction of the centre hit
  knockback?: number; // tiles a splash hit shoves raiders away from the impact
  chain?: number; // Dean's Office: extra raiders a summons jumps to after the first hit
  chainRange?: number; // tiles: how far each jump can reach
  chainFalloff?: number; // each jump deals this fraction of the previous hit
}

/** Stinger Statue targeting: one ramping beam, or several flat beams. */
export type BeamMode = 'single' | 'multi';

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
  /** Fire Alarm: seconds raiders stand outside, and how far they file out (tiles). */
  trapStun?: number;
  trapPush?: number;
  /** Parking Gate Arm: one swing at the first raider to come close, for this damage and knockback (tiles). */
  swingDmg?: number;
  swingKnock?: number;
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

export type TroopType = 'freshman' | 'engineer' | 'nurse' | 'theology' | 'athlete' | 'business' | 'music' | 'runner' | 'ra' | 'goteam' | 'rock' | 'senior' | 'thesis';
export type HeroType = 'prof' | 'president';
/** 'gomember' is what a GO Team van unloads and 'pebble' is what The Rock breaks into; neither can be trained on its own. */
export type UnitType = TroopType | HeroType | 'fan' | 'gomember' | 'pebble';

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
  /** Extra loot (fraction of a building's loot) when this troop lands the final hit on it. */
  lootBonus?: number;
  /** Every Nth hit deals `mul` times the damage. */
  chorus?: { every: number; mul: number };
  /** Paths over walls and lakes; builds momentum while running. */
  jumps?: { maxRun: number; speed: number; dmg: number };
  /** Shooting defenses pick this troop first; sets off hidden traps from `trapRange` tiles at `trapDmg` damage. */
  taunt?: { trapRange: number; trapDmg: number };
  /** Does not fight: on reaching a target (or dying) it becomes `count` short-lived team members. */
  unload?: { count: number; life: number };
  /** When destroyed: crashes onto buildings within `radius` tiles for `dmg` damage, then breaks into `count` Pebbles. */
  crumble?: { count: number; radius: number; dmg: number[] };
  /** Senioritis: damage and speed grow with raid time, reaching +dmg and +speed (fractions) after `full` seconds. */
  senioritis?: { full: number; dmg: number; speed: number };
  /** Citation Needed: each hit in a row on the same building adds `perHit` damage (fraction), up to `maxStacks`. A new target resets it. */
  citation?: { perHit: number; maxStacks: number };
  /** Too heavy to shove: splash knockback does not move it. */
  heavy?: boolean;
  /** Short label for the raid deploy bar (defaults to the first word of the name). */
  short?: string;
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
  /** Fires letters: every `every`th shot is a big one dealing `mul` times the damage. */
  bolt?: { every: number; mul: number };
  speed: number;
  range: number;
  attackRate: number;
  levels: HeroLevel[];
  regenTime: number; // seconds to fully recover after a raid at 0 hp
}

export type SpellType = 'allnighter' | 'snowday' | 'announcement' | 'syllabus';

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
  /** Fraction of max HP healed per second for your troops in the zone. */
  heal?: number;
  color: string;
}

export type EventType = 'ringbyspring' | 'finals' | 'construction' | 'elephantrun';

/** Lifetime counters kept in the save (GameState.stats). */
export type StatKey =
  | 'built'
  | 'lakesBuilt'
  | 'tickets'
  | `trained_${TroopType}`
  | `cast_${SpellType}`
  | 'raids'
  | 'wins'
  | 'losses'
  | 'threeStars'
  | 'destroyed'
  | 'wallsByEngineers'
  | 'popQuizzes'
  | 'ringWins'
  | 'windWins'
  | 'elephantRuns'
  | 'dailies';
