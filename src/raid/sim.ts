// Raid simulation: buildings, troops, defenses, projectiles, spells, events.
// Pure game logic; the scene turns `events` into particles & sounds.
import { BUILDINGS, blocksPath } from '../config/buildings';
import { GRID } from '../config/balance';
import { FAN_DEF, GO_MEMBER_DEF, HEROES, TROOPS } from '../config/troops';
import { SPELLS } from '../config/spells';
import type { BuildingType, DefenseStats, HeroType, SpellType, TroopDef, TroopType, UnitType } from '../config/types';
import { dist, distToRect } from '../core/iso';
import { Rng } from '../core/rng';
import { BLOCKED, FREE, WALL_COST, findPath } from './pathfind';
import type { BaseLayout } from './basegen';

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
const WANDER_DIRS: [number, number][] = [
  [1, 0], [0.9238795325, 0.3826834324], [0.7071067812, 0.7071067812], [0.3826834324, 0.9238795325],
  [0, 1], [-0.3826834324, 0.9238795325], [-0.7071067812, 0.7071067812], [-0.9238795325, 0.3826834324],
  [-1, 0], [-0.9238795325, -0.3826834324], [-0.7071067812, -0.7071067812], [-0.3826834324, -0.9238795325],
  [0, -1], [0.3826834324, -0.9238795325], [0.7071067812, -0.7071067812], [0.9238795325, -0.3826834324],
];

/** Aleph to tav. */
export const HEBREW_LETTERS = 22;

/** What a Business Major goes for first. */
const RESOURCE_TYPES: BuildingType[] = ['registrar', 'rinnova', 'admissions', 'coffeecart'];

export class RaidSim {
  buildings: RB[] = [];
  units: RU[] = [];
  projectiles: Projectile[] = [];
  zones: Zone[] = [];
  events: SimEvent[] = [];
  cost = new Uint8Array(GRID * GRID);
  /** Same grid for troops that go over walls and lakes: only real buildings block. */
  costJump = new Uint8Array(GRID * GRID);
  tileB: (RB | null)[] = new Array(GRID * GRID).fill(null);
  forbid = new Uint8Array(GRID * GRID); // deploy forbidden
  time = 0;
  stars = 0;
  dmcDead = false;
  pctStar = false;
  fullStar = false;
  totalCount = 0;
  destroyedCount = 0;
  loot = { tuition: 0, coffee: 0 };
  /** Extra loot earned by Business Majors. Paid to the attacker on top of `loot`; the defender does not lose it. */
  bonusLoot = { tuition: 0, coffee: 0 };
  lootAvail = { tuition: 0, coffee: 0 };
  wallsByEngineers = 0;
  buildingsDestroyed = 0;
  windStart = -1;
  windDir = 1;
  windOn = false;
  windSurvived = false;
  /** Gameplay RNG. Cosmetic-only rolls (event flourishes) use Math.random so they never desync a replay. */
  rng: Rng;
  private uid = 1;
  private pathBudget = 0;
  private pairT = 0;
  private dirtyCost = true;

  constructor(public base: BaseLayout, public opts: RaidOptions) {
    this.rng = new Rng(opts.seed);
    for (const p of base.pieces) {
      const def = BUILDINGS[p.type];
      const L = def.levels[Math.min(def.levels.length, p.level) - 1];
      const size = def.size;
      const b: RB = {
        uid: this.uid++,
        type: p.type,
        level: p.level,
        x: p.x,
        y: p.y,
        size,
        cx: p.x + size / 2,
        cy: p.y + size / 2,
        hp: L.hp,
        maxHp: L.hp,
        dead: false,
        isWall: p.type === 'wall',
        isTrap: p.type === 'nest',
        isDefense: !!L.defense,
        counts: p.type !== 'wall' && p.type !== 'nest' && p.type !== 'lake',
        def: L.defense,
        cd: 0.5,
        target: null,
        aim: 0,
        firing: 0,
        charge: 0,
        prayT: 0,
        prayTarget: null,
        frozenUntil: 0,
        stunUntil: 0,
        hidden: p.type === 'nest',
        loot: { tuition: 0, coffee: 0 },
        lootTaken: { tuition: 0, coffee: 0 },
        fansLeft: L.fans ?? 0,
        fanTimer: 0,
        hitT: 0,
      };
      if (p.type === 'lake') {
        b.hp = b.maxHp = 1e9;
      }
      this.buildings.push(b);
    }
    this.distributeLoot();
    this.totalCount = this.buildings.filter((b) => b.counts).length;
    this.rebuildCost();
    // deploy-forbidden zone: within 1 tile of any building (except traps)
    for (const b of this.buildings) {
      if (b.isTrap) continue;
      for (let y = b.y - 1; y < b.y + b.size + 1; y++)
        for (let x = b.x - 1; x < b.x + b.size + 1; x++) if (x >= 0 && y >= 0 && x < GRID && y < GRID) this.forbid[y * GRID + x] = 1;
    }
    if (opts.wind) {
      this.windStart = 18 + this.rng.next() * 50;
      this.windDir = this.rng.next() < 0.5 ? 1 : -1;
    }
  }

  private distributeLoot(): void {
    const L = this.base.loot;
    const share = (types: BuildingType[], frac: number, res: 'tuition' | 'coffee'): void => {
      const bs = this.buildings.filter((b) => types.includes(b.type));
      if (!bs.length) return;
      for (const b of bs) b.loot[res] += (L[res] * frac) / bs.length;
    };
    share(['registrar'], 0.6, 'tuition');
    share(['rinnova'], 0.6, 'coffee');
    share(['admissions'], 0.25, 'tuition');
    share(['coffeecart'], 0.25, 'coffee');
    share(['dmc'], 0.15, 'tuition');
    share(['dmc'], 0.15, 'coffee');
    for (const b of this.buildings) {
      this.lootAvail.tuition += b.loot.tuition;
      this.lootAvail.coffee += b.loot.coffee;
    }
  }

  rebuildCost(): void {
    this.cost.fill(FREE);
    this.costJump.fill(FREE);
    this.tileB.fill(null);
    for (const b of this.buildings) {
      if (b.dead) continue;
      if (!blocksPath(b.type)) continue;
      const jumpable = b.isWall || b.type === 'lake';
      for (let y = b.y; y < b.y + b.size; y++)
        for (let x = b.x; x < b.x + b.size; x++) {
          this.cost[y * GRID + x] = b.isWall ? WALL_COST : BLOCKED;
          if (!jumpable) this.costJump[y * GRID + x] = BLOCKED;
          this.tileB[y * GRID + x] = b;
        }
    }
    this.dirtyCost = false;
  }

  get destruction(): number {
    return this.totalCount ? this.destroyedCount / this.totalCount : 0;
  }

  canDeploy(x: number, y: number): boolean {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= GRID || iy >= GRID) return false;
    return !this.forbid[iy * GRID + ix];
  }

  // ---------- Spawning ----------
  spawnTroop(type: TroopType, x: number, y: number): RU {
    const d = TROOPS[type];
    const lvl = this.opts.troopLevels[type];
    const L = d.levels[lvl - 1];
    const u = this.addUnit({ type, side: 'atk', level: lvl, x, y, hp: L.hp, dps: L.dps, speed: d.speed * (this.opts.elephant ? 1.5 : 1), range: d.range, rate: d.attackRate });
    u.def = d;
    return u;
  }

  /** A GO Team van parks (or is wrecked) and its team piles out. The van itself is gone either way. */
  private unloadVan(u: RU): void {
    const un = u.def?.unload;
    if (!un || u.expireAt < 0) return;
    u.expireAt = -1; // unloaded: never twice
    u.dead = true;
    const d = GO_MEMBER_DEF;
    const lvl = Math.min(d.levels.length, u.level);
    const L = d.levels[lvl - 1];
    for (let i = 0; i < un.count; i++) {
      const [dx, dy] = WANDER_DIRS[(i * 3 + 1) % WANDER_DIRS.length];
      const m = this.addUnit({ type: 'gomember', side: 'atk', level: lvl, x: u.x + dx * 0.45, y: u.y + dy * 0.45, hp: L.hp, dps: L.dps, speed: d.speed, range: d.range, rate: d.attackRate });
      m.expireAt = this.time + un.life;
    }
    this.events.push({ e: 'unload', x: u.x, y: u.y });
  }

  spawnHero(h: HeroType, x: number, y: number, hpFrac = 1): RU {
    const d = HEROES[h];
    const lvl = this.opts.heroLevels[h];
    const L = d.levels[lvl - 1];
    const u = this.addUnit({ type: h, side: 'atk', level: lvl, x, y, hp: L.hp, dps: L.dps, speed: d.speed, range: d.range, rate: d.attackRate });
    u.hero = h;
    u.hp = L.hp * hpFrac;
    return u;
  }

  private spawnFan(b: RB): void {
    const lvl = Math.min(FAN_DEF.levels.length, b.level);
    const L = FAN_DEF.levels[lvl - 1];
    this.addUnit({
      type: 'fan',
      side: 'def',
      level: lvl,
      x: b.cx + (this.rng.next() - 0.5),
      y: b.y + b.size + 0.3,
      hp: L.hp,
      dps: L.dps,
      speed: FAN_DEF.speed,
      range: FAN_DEF.range,
      rate: FAN_DEF.attackRate,
    });
  }

  private addUnit(p: { type: UnitType; side: 'atk' | 'def'; level: number; x: number; y: number; hp: number; dps: number; speed: number; range: number; rate: number }): RU {
    const u: RU = {
      uid: this.uid++,
      ...p,
      maxHp: p.hp,
      cd: this.rng.next() * 0.3,
      tb: null,
      tu: null,
      path: [],
      pathI: 0,
      needsPath: true,
      wall: null,
      frozenUntil: 0,
      slowUntil: 0,
      slowMul: 1,
      stunUntil: 0,
      rageUntil: 0,
      convoUntil: 0,
      auraUntil: 0,
      pairedUntil: 0,
      ignoreTrapsUntil: 0,
      wanderUntil: 0,
      wdx: 0,
      wdy: 0,
      face: 1,
      t: this.rng.next() * 10,
      attackT: 0,
      moving: false,
      dead: false,
      flash: 0,
      abilityUsed: false,
      idleT: 0,
      hits: 0,
      runT: 0,
      expireAt: 0,
    };
    this.units.push(u);
    return u;
  }

  // ---------- Spells & abilities ----------
  castSpell(kind: SpellType, x: number, y: number): void {
    const d = SPELLS[kind];
    this.events.push({ e: 'spell', kind, x, y, r: d.radius });
    if (kind === 'snowday') {
      for (const b of this.buildings) {
        if (b.dead || !b.isDefense) continue;
        if (distToRect(x, y, b.x, b.y, b.size, b.size) <= d.radius) b.frozenUntil = this.time + d.duration;
      }
      for (const u of this.units) if (u.side === 'def' && dist(u.x, u.y, x, y) <= d.radius) u.frozenUntil = this.time + d.duration;
    }
    this.zones.push({ kind, x, y, r: d.radius, until: this.time + d.duration, start: this.time, dps: 0 });
  }

  useAbility(u: RU): void {
    if (!u.hero || u.abilityUsed || u.dead) return;
    u.abilityUsed = true;
    const d = HEROES[u.hero];
    if (u.hero === 'prof') {
      for (const b of this.buildings) {
        if (b.dead || !b.isDefense) continue;
        if (distToRect(u.x, u.y, b.x, b.y, b.size, b.size) <= d.ability.radius) b.stunUntil = this.time + d.ability.duration;
      }
      for (const o of this.units) if (o.side === 'def' && dist(o.x, o.y, u.x, u.y) <= d.ability.radius) o.stunUntil = this.time + d.ability.duration;
      u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.3);
      this.zones.push({ kind: 'quiz', x: u.x, y: u.y, r: d.ability.radius, until: this.time + 0.8, start: this.time, dps: 0 });
      this.events.push({ e: 'ability', kind: 'quiz', u });
    } else {
      for (const o of this.units) {
        if (o.side !== 'atk' || o.dead) continue;
        o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.3);
        o.convoUntil = this.time + d.ability.duration;
      }
      this.zones.push({ kind: 'convo', x: u.x, y: u.y, r: 12, until: this.time + 1.2, start: this.time, dps: 0 });
      this.events.push({ e: 'ability', kind: 'convo', u });
    }
  }

  // ---------- Main tick ----------
  update(dt: number): void {
    this.time += dt;
    this.pathBudget = 30;
    if (this.dirtyCost) this.rebuildCost();

    // Ohio wind
    if (this.windStart > 0) {
      const on = this.time >= this.windStart && this.time < this.windStart + 4;
      if (on !== this.windOn) {
        this.windOn = on;
        this.events.push({ e: 'wind', on, dir: this.windDir });
        if (!on) {
          for (const u of this.units) if (u.side === 'atk') u.needsPath = true;
          if (this.units.some((u) => u.side === 'atk' && !u.dead)) this.windSurvived = true;
        }
      }
    }

    // Auras: theology, ring by spring, zones
    for (const u of this.units) {
      if (u.dead || u.side !== 'atk') continue;
      if (u.type === 'theology') {
        const a = TROOPS.theology.aura!;
        for (const o of this.units) if (o.side === 'atk' && !o.dead && o !== u && dist(o.x, o.y, u.x, u.y) <= a.radius) o.auraUntil = this.time + 0.3;
      }
    }
    if (this.opts.ringBySpring) {
      this.pairT -= dt;
      if (this.pairT <= 0) {
        this.pairT = 0.5;
        const atk = this.units.filter((u) => u.side === 'atk' && !u.dead);
        for (const u of atk) {
          for (const o of atk) {
            if (o !== u && dist(o.x, o.y, u.x, u.y) < 1.3) {
              u.pairedUntil = this.time + 0.6;
              break;
            }
          }
        }
      }
    }
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      if (this.time >= z.until) {
        this.zones.splice(i, 1);
        continue;
      }
      for (const u of this.units) {
        if (u.dead || dist(u.x, u.y, z.x, z.y) > z.r) continue;
        if (z.kind === 'allnighter' && u.side === 'atk') u.rageUntil = this.time + 0.3;
        if (z.kind === 'announcement' && u.side === 'atk') u.ignoreTrapsUntil = this.time + 0.4;
        if (z.kind === 'swarm' && u.side === 'atk') this.damageUnit(u, z.dps * dt * (u.def?.taunt?.trapDmg ?? 1), 'sting');
      }
    }

    // Buildings / defenses
    for (const b of this.buildings) {
      if (b.dead) continue;
      b.firing = Math.max(0, b.firing - dt * 4);
      b.hitT = Math.max(0, b.hitT - dt);
      if (b.type === 'hive') this.updateHive(b, dt);
      if (b.isTrap) this.updateTrap(b);
      if (!b.def) continue;
      if (b.frozenUntil > this.time || b.stunUntil > this.time) {
        b.prayT = 0;
        continue;
      }
      if (b.type === 'sprayer') this.updateSprayer(b, dt);
      else if (b.type === 'bibleprof') this.updateBibleProf(b, dt);
      else this.updateShooter(b, dt);
    }

    // Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      if (p.target && !p.target.dead) {
        p.tx = p.target.x;
        p.ty = p.target.y;
      }
      p.x = p.sx + (p.tx - p.sx) * k;
      p.y = p.sy + (p.ty - p.sy) * k;
      p.z = p.sz * (1 - k) + Math.sin(k * Math.PI) * 18;
      if (k >= 1) {
        if (p.target && !p.target.dead) this.damageUnit(p.target, p.dmg, p.kind);
        this.projectiles.splice(i, 1);
      }
    }

    // Units
    for (const u of this.units) {
      if (u.dead) continue;
      u.t += dt;
      u.flash = Math.max(0, u.flash - dt * 5);
      u.attackT = Math.max(0, u.attackT - dt * 3);
      u.moving = false;
      if (u.expireAt > 0 && this.time >= u.expireAt) {
        // GO Team members head home when their trip is over
        u.dead = true;
        this.events.push({ e: 'death', u });
        continue;
      }
      if (u.frozenUntil > this.time || u.stunUntil > this.time) continue;
      if (this.windOn && u.side === 'atk') {
        // push sideways (screen-wise): along +gx/-gy
        const nx = u.x + this.windDir * 1.3 * dt;
        const ny = u.y - this.windDir * 1.3 * dt;
        if (this.walkable(nx, ny)) {
          u.x = nx;
          u.y = ny;
        }
      }
      if (u.side === 'atk') this.updateAttacker(u, dt);
      else this.updateDefender(u, dt);
    }
    this.separate(dt);
    // cleanup dead units occasionally
    if (this.units.length > 300) this.units = this.units.filter((u) => !u.dead);
  }

  // ---------- Defense behaviours ----------
  /** Nearest attacker in range. With `taunted`, an RA in range is picked ahead of anyone closer. */
  private nearestAttacker(x: number, y: number, range: number, b?: RB, taunted = false): RU | null {
    let best: RU | null = null;
    let bd = Infinity;
    for (const u of this.units) {
      if (u.dead || u.side !== 'atk') continue;
      let d = b ? distToRect(u.x, u.y, b.x, b.y, b.size, b.size) : dist(u.x, u.y, x, y);
      if (d > range) continue;
      if (taunted && u.def?.taunt) d -= 1000;
      if (d < bd) {
        bd = d;
        best = u;
      }
    }
    return best;
  }

  private updateShooter(b: RB, dt: number): void {
    const d = b.def!;
    const inRange = (u: RU): boolean => !u.dead && distToRect(u.x, u.y, b.x, b.y, b.size, b.size) <= d.range;
    if (!b.target || !inRange(b.target)) b.target = this.nearestAttacker(b.cx, b.cy, d.range, b, true);
    else if (!b.target.def?.taunt) {
      // an RA walking into range pulls fire off whoever was being shot at
      const ra = this.nearestAttacker(b.cx, b.cy, d.range, b, true);
      if (ra?.def?.taunt) b.target = ra;
    }
    b.cd -= dt;
    if (b.target) {
      b.aim = Math.atan2(b.target.y - b.cy, b.target.x - b.cx);
      if (b.cd <= 0) {
        b.cd = d.rate;
        b.firing = 1;
        const kind = b.type === 'ratower' ? 'writeup' : 'ticket';
        const dd = dist(b.cx, b.cy, b.target.x, b.target.y);
        const sz = b.type === 'ratower' ? 75 + b.level * 5 : 40;
        this.projectiles.push({
          x: b.cx,
          y: b.cy,
          z: sz,
          sx: b.cx,
          sy: b.cy,
          sz,
          tx: b.target.x,
          ty: b.target.y,
          target: b.target,
          dmg: d.dps * d.rate,
          t: 0,
          dur: Math.max(0.12, dd / (d.projectileSpeed ?? 12)),
          kind,
        });
        this.events.push({ e: 'shoot', b, kind });
      }
    }
  }

  private updateSprayer(b: RB, dt: number): void {
    const d = b.def!;
    let any = false;
    for (const u of this.units) {
      if (u.dead || u.side !== 'atk') continue;
      if (distToRect(u.x, u.y, b.x, b.y, b.size, b.size) > d.range) continue;
      any = true;
      u.slowUntil = this.time + 0.25;
      u.slowMul = 1 - (d.slow ?? 0.4);
      this.damageUnit(u, d.dps * dt, 'spray', true);
    }
    b.charge = Math.min(1, b.charge + dt / (d.freezeCharge ?? 6));
    if (b.charge >= 1 && any) {
      b.charge = 0;
      for (const u of this.units) {
        if (u.dead || u.side !== 'atk') continue;
        if (distToRect(u.x, u.y, b.x, b.y, b.size, b.size) <= d.range) u.frozenUntil = this.time + (d.freezeTime ?? 2);
      }
      this.events.push({ e: 'freeze', b });
    }
  }

  private updateBibleProf(b: RB, dt: number): void {
    const d = b.def!;
    // blessing: heal nearby walls
    if (d.blessHeal) {
      for (const w of this.buildings) {
        if (!w.isWall || w.dead || w.hp >= w.maxHp) continue;
        if (dist(w.cx, w.cy, b.cx, b.cy) <= 4.5) {
          w.hp = Math.min(w.maxHp, w.hp + w.maxHp * d.blessHeal * dt);
          if (Math.random() < dt * 2) this.events.push({ e: 'bless', b: w });
        }
      }
    }
    b.cd -= dt;
    if (b.prayT > 0) {
      b.prayT -= dt;
      if (b.prayT <= 0 && b.prayTarget) {
        const r = d.splash ?? 1.5;
        const { x, y } = b.prayTarget;
        for (const u of this.units) {
          if (u.dead || u.side !== 'atk') continue;
          if (dist(u.x, u.y, x, y) <= r) this.damageUnit(u, d.dps * d.rate, 'pray');
        }
        this.events.push({ e: 'pray', b, x, y, r });
        b.prayTarget = null;
      }
      return;
    }
    if (b.cd > 0) return;
    // pick the densest clump in range (frozen clumps are juicy)
    let best: RU | null = null;
    let bestScore = -1;
    const r = d.splash ?? 1.5;
    for (const u of this.units) {
      if (u.dead || u.side !== 'atk') continue;
      if (distToRect(u.x, u.y, b.x, b.y, b.size, b.size) > d.range) continue;
      let score = 0;
      for (const o of this.units) if (!o.dead && o.side === 'atk' && dist(o.x, o.y, u.x, u.y) <= r) score += o.frozenUntil > this.time ? 1.5 : 1;
      if (score > bestScore) {
        bestScore = score;
        best = u;
      }
    }
    if (best) {
      b.cd = d.rate;
      b.prayT = 0.45;
      b.prayTarget = { x: best.x, y: best.y };
      b.aim = Math.atan2(best.y - b.cy, best.x - b.cx);
    }
  }

  private updateTrap(b: RB): void {
    if (!b.hidden) return;
    for (const u of this.units) {
      if (u.dead || u.side !== 'atk' || u.ignoreTrapsUntil > this.time) continue;
      const roomCheck = u.def?.taunt;
      if (dist(u.x, u.y, b.cx, b.cy) < (roomCheck ? roomCheck.trapRange : 1.2)) {
        if (roomCheck) this.events.push({ e: 'roomcheck', u });
        const L = BUILDINGS.nest.levels[b.level - 1];
        b.hidden = false;
        b.dead = true;
        this.zones.push({ kind: 'swarm', x: b.cx, y: b.cy, r: L.trapRadius ?? 2, until: this.time + (L.trapDuration ?? 5), start: this.time, dps: L.trapDps ?? 20 });
        this.events.push({ e: 'swarm', x: b.cx, y: b.cy, r: L.trapRadius ?? 2 });
        return;
      }
    }
  }

  private updateHive(b: RB, dt: number): void {
    if (b.fansLeft <= 0) return;
    if (b.fanTimer > 0) {
      b.fanTimer -= dt;
      if (b.fanTimer <= 0) {
        this.spawnFan(b);
        b.fansLeft--;
        if (b.fansLeft > 0) b.fanTimer = 0.35;
      }
      return;
    }
    if (this.nearestAttacker(b.cx, b.cy, 7, b)) {
      b.fanTimer = 0.05;
      this.events.push({ e: 'fans', b });
    }
  }

  // ---------- Damage ----------
  damageUnit(u: RU, dmg: number, kind: string, silent = false): void {
    if (u.dead) return;
    u.hp -= dmg;
    if (!silent) {
      u.flash = 1;
      this.events.push({ e: 'hit', x: u.x, y: u.y, dmg, kind });
    }
    if (u.hp <= 0) {
      u.dead = true;
      this.events.push({ e: 'death', u });
      if (u.def?.unload) this.unloadVan(u); // wrecked on the way: the team still gets out
    }
  }

  damageBuilding(b: RB, dmg: number, by?: RU): void {
    if (b.dead || b.type === 'lake') return;
    const before = b.hp;
    b.hp = Math.max(0, b.hp - dmg);
    b.hitT = 0.12;
    const frac = (before - b.hp) / b.maxHp;
    for (const res of ['tuition', 'coffee'] as const) {
      if (b.loot[res] <= 0) continue;
      const amt = b.loot[res] * frac;
      b.lootTaken[res] += amt;
      this.loot[res] += amt;
      if (Math.random() < 0.15 && amt > 0) this.events.push({ e: 'loot', res, amt: b.loot[res] * 0.1, x: b.cx, y: b.cy });
    }
    if (b.hp <= 0) {
      b.dead = true;
      this.dirtyCost = true;
      const bonus = by?.def?.lootBonus;
      if (bonus) for (const res of ['tuition', 'coffee'] as const) this.bonusLoot[res] += b.loot[res] * bonus;
      this.events.push({ e: 'destroyed', b });
      if (b.isWall && by?.type === 'engineer') this.wallsByEngineers++;
      if (b.counts) {
        this.destroyedCount++;
        this.buildingsDestroyed++;
        if (b.type === 'dmc' && !this.dmcDead) {
          this.dmcDead = true;
          this.stars++;
          this.events.push({ e: 'star', n: this.stars, why: 'DMC destroyed!' });
        }
        if (!this.pctStar && this.destruction >= 0.5) {
          this.pctStar = true;
          this.stars++;
          this.events.push({ e: 'star', n: this.stars, why: '50% destruction!' });
        }
        if (!this.fullStar && this.destroyedCount >= this.totalCount) {
          this.fullStar = true;
          this.stars++;
          this.events.push({ e: 'star', n: this.stars, why: '100%! Total victory!' });
        }
      }
      // anyone targeting this re-targets
      for (const u of this.units) {
        if (u.tb === b) {
          u.tb = null;
          u.needsPath = true;
        }
        if (u.wall === b) {
          u.wall = null;
          u.needsPath = true;
        }
      }
      if (!b.isWall) for (const u of this.units) if (u.side === 'atk') u.needsPath = true;
    }
  }

  // ---------- Units ----------
  private walkable(x: number, y: number): boolean {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= GRID || iy >= GRID) return false;
    return this.cost[iy * GRID + ix] === FREE;
  }

  private mulDmg(u: RU): number {
    let m = 1;
    if (u.rageUntil > this.time) m *= 1.6;
    if (u.convoUntil > this.time) m *= 1.5;
    if (u.auraUntil > this.time) m *= 1 + TROOPS.theology.aura!.dmg;
    if (u.pairedUntil > this.time) m *= 1.2;
    return m;
  }

  private mulSpeed(u: RU): number {
    let m = 1;
    const j = u.def?.jumps;
    if (j) m *= 1 + Math.min(u.runT, j.maxRun) * j.speed;
    if (u.slowUntil > this.time) m *= u.slowMul;
    if (u.rageUntil > this.time) m *= 1.4;
    if (u.convoUntil > this.time) m *= 1.3;
    if (u.auraUntil > this.time) m *= 1 + TROOPS.theology.aura!.speed;
    if (u.pairedUntil > this.time) m *= 1.2;
    return m;
  }

  private pickTarget(u: RU): RB | null {
    const pref = u.def?.prefers ?? 'any';
    const choose = (filter: (b: RB) => boolean): RB | null => {
      let best: RB | null = null;
      let bd = Infinity;
      for (const b of this.buildings) {
        if (b.dead || b.isTrap || b.type === 'lake' || !filter(b)) continue;
        const d = distToRect(u.x, u.y, b.x, b.y, b.size, b.size);
        if (d < bd) {
          bd = d;
          best = b;
        }
      }
      return best;
    };
    if (pref === 'defense') return choose((b) => b.isDefense) ?? choose((b) => !b.isWall);
    if (pref === 'resource') return choose((b) => RESOURCE_TYPES.includes(b.type)) ?? choose((b) => !b.isWall);
    if (pref === 'wall') {
      // nearest wall that stands between us and the nearest non-wall building
      const goal = choose((b) => !b.isWall);
      if (!goal) return choose((b) => b.isWall);
      let best: RB | null = null;
      let bd = Infinity;
      for (const b of this.buildings) {
        if (b.dead || !b.isWall) continue;
        const d1 = dist(u.x, u.y, b.cx, b.cy);
        const d2 = dist(b.cx, b.cy, goal.cx, goal.cy);
        const score = d1 + d2 * 0.8;
        if (score < bd && d2 < dist(u.x, u.y, goal.cx, goal.cy) + 2) {
          bd = score;
          best = b;
        }
      }
      return best ?? goal;
    }
    return choose((b) => !b.isWall);
  }

  private updateAttacker(u: RU, dt: number): void {
    const j = u.def?.jumps;
    if (j && u.slowUntil > this.time) u.runT = 0; // soaked by a Cedar Sprayer: momentum gone
    const sp = u.speed * this.mulSpeed(u);
    // engage nearby defenders first
    if (!u.tu || u.tu.dead) {
      u.tu = null;
      for (const o of this.units) {
        if (o.dead || o.side !== 'def') continue;
        if (dist(o.x, o.y, u.x, u.y) < 2.2 + u.range) {
          u.tu = o;
          break;
        }
      }
    }
    if (u.type === 'nurse') return this.updateHealer(u, dt, sp);
    if (u.tu && u.def?.unload) return this.unloadVan(u); // fans in the way: everybody out
    if (u.tu) {
      this.fightUnit(u, u.tu, dt, sp);
      if (u.tu?.dead) {
        u.tu = null;
        u.needsPath = true;
      }
      return;
    }
    // Freshmen get lost
    if (u.wanderUntil > this.time) {
      const nx = u.x + u.wdx * sp * 0.6 * dt;
      const ny = u.y + u.wdy * sp * 0.6 * dt;
      if (this.walkable(nx, ny)) {
        u.x = nx;
        u.y = ny;
        u.moving = true;
        u.face = u.wdx - u.wdy >= 0 ? 1 : -1;
      }
      return;
    }
    if (!u.tb || u.tb.dead) {
      u.tb = this.pickTarget(u);
      u.needsPath = true;
      if (!u.tb) {
        u.idleT += dt;
        return;
      }
      if (u.type === 'freshman' && this.rng.next() < 0.18) {
        u.wanderUntil = this.time + 1.2 + this.rng.next();
        const [wx, wy] = WANDER_DIRS[Math.floor(this.rng.next() * WANDER_DIRS.length)];
        u.wdx = wx;
        u.wdy = wy;
        this.events.push({ e: 'wander', u });
        return;
      }
    }
    const tgt = u.wall ?? u.tb;
    const inRange = distToRect(u.x, u.y, tgt.x, tgt.y, tgt.size, tgt.size) <= u.range + 0.15;
    if (inRange) {
      if (u.def?.unload) return this.unloadVan(u);
      this.attackBuilding(u, tgt, dt);
      return;
    }
    if (j && u.slowUntil <= this.time) u.runT += dt;
    if (u.needsPath) {
      if (this.pathBudget <= 0) return;
      this.pathBudget--;
      this.computePath(u);
    }
    this.followPath(u, dt, sp);
  }

  private computePath(u: RU): void {
    u.needsPath = false;
    u.wall = null;
    const t = u.tb;
    if (!t) return;
    const jumps = !!u.def?.jumps;
    const p = findPath(jumps ? this.costJump : this.cost, Math.floor(u.x), Math.floor(u.y), { x: t.x, y: t.y, w: t.size, h: t.size }, Math.max(0.5, u.range - 0.2));
    u.path = p ?? [];
    u.pathI = 0;
    if (jumps) return; // walls are not in the way
    // does the path go through a wall? then attack that wall first
    for (let i = 0; i < u.path.length; i++) {
      const b = this.tileB[u.path[i]];
      if (b && b.isWall && !b.dead) {
        u.wall = b;
        u.path = u.path.slice(0, i);
        break;
      }
    }
  }

  private followPath(u: RU, dt: number, sp: number): void {
    if (u.pathI >= u.path.length) {
      // reached end of path but not in range: walk straight at target
      const t = u.wall ?? u.tb;
      if (!t) return;
      const tx = Math.max(t.x, Math.min(t.x + t.size, u.x));
      const ty = Math.max(t.y, Math.min(t.y + t.size, u.y));
      this.stepToward(u, tx, ty, sp * dt, true);
      u.idleT += dt;
      if (u.idleT > 1.5) {
        u.idleT = 0;
        u.needsPath = true;
      }
      return;
    }
    const idx = u.path[u.pathI];
    const tx = (idx % GRID) + 0.5;
    const ty = Math.floor(idx / GRID) + 0.5;
    const d = dist(u.x, u.y, tx, ty);
    if (d < 0.15) {
      u.pathI++;
      return;
    }
    this.stepToward(u, tx, ty, sp * dt, true);
  }

  private stepToward(u: RU, tx: number, ty: number, step: number, loose: boolean): void {
    const dx = tx - u.x;
    const dy = ty - u.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.001) return;
    const k = Math.min(step, d) / d;
    const nx = u.x + dx * k;
    const ny = u.y + dy * k;
    if (loose || u.side === 'def' || this.walkable(nx, ny) || !this.walkable(u.x, u.y)) {
      u.x = nx;
      u.y = ny;
    }
    u.moving = true;
    const sxDir = dx - dy;
    if (Math.abs(sxDir) > 0.01) u.face = sxDir > 0 ? 1 : -1;
  }

  private attackBuilding(u: RU, b: RB, dt: number): void {
    u.idleT = 0;
    const sxDir = b.cx - u.x - (b.cy - u.y);
    if (Math.abs(sxDir) > 0.01) u.face = sxDir > 0 ? 1 : -1;
    u.cd -= dt;
    if (u.cd > 0) return;
    u.cd = u.rate;
    u.attackT = 1;
    let dmg = u.dps * u.rate * this.mulDmg(u);
    if (b.isWall && u.type === 'engineer') dmg *= TROOPS.engineer.wallMul ?? 1;
    const j = u.def?.jumps;
    if (j) {
      // the first hit after a run carries the momentum
      dmg *= 1 + Math.min(u.runT, j.maxRun) * j.dmg;
      u.runT = 0;
    }
    const ch = u.def?.chorus;
    u.hits++;
    if (ch && u.hits % ch.every === 0) {
      dmg *= ch.mul;
      this.events.push({ e: 'chorus', x: b.cx, y: b.cy });
    }
    if (u.hero === 'prof') {
      dmg *= this.letterShot(u, b.cx, b.cy);
    } else if (u.range > 1.5 && u.type !== 'nurse') {
      // ranged: thrown book (visual only, damage applies instantly)
      this.events.push({ e: 'hit', x: b.cx, y: b.cy, dmg, kind: 'pen' });
    } else {
      this.events.push({ e: 'hit', x: (u.x + b.cx) / 2, y: (u.y + b.cy) / 2, dmg, kind: 'melee' });
    }
    this.damageBuilding(b, dmg, u);
  }

  private fightUnit(u: RU, o: RU, dt: number, sp: number): void {
    const d = dist(u.x, u.y, o.x, o.y);
    if (d > u.range + 0.3) {
      this.stepToward(u, o.x, o.y, sp * dt, true);
      return;
    }
    const sxDir = o.x - u.x - (o.y - u.y);
    if (Math.abs(sxDir) > 0.01) u.face = sxDir > 0 ? 1 : -1;
    u.cd -= dt;
    if (u.cd > 0) return;
    u.cd = u.rate;
    u.attackT = 1;
    let dmg = u.dps * u.rate * (u.side === 'atk' ? this.mulDmg(u) : 1);
    if (u.hero === 'prof') {
      u.hits++;
      dmg *= this.letterShot(u, o.x, o.y);
    }
    this.damageUnit(o, dmg, 'melee');
  }

  /**
   * The Bible Prof's crossbow. Shot number `u.hits` (already counted) fires the next Hebrew
   * letter; every Nth is a big one. Returns the damage multiplier. The flying letter is drawn
   * by the scene and damage still lands instantly, so raid timing is unchanged.
   */
  private letterShot(u: RU, tx: number, ty: number): number {
    const bolt = HEROES.prof.bolt;
    const big = !!bolt && u.hits % bolt.every === 0;
    this.events.push({ e: 'bolt', fx: u.x, fy: u.y, tx, ty, n: (u.hits - 1) % HEBREW_LETTERS, big });
    return big ? bolt.mul : 1;
  }

  private updateHealer(u: RU, dt: number, sp: number): void {
    const d = TROOPS.nurse;
    const healPerSec = u.dps; // nurses use dps as heal/sec
    // find most hurt ally nearby, else follow nearest ally
    let best: RU | null = null;
    let bestScore = Infinity;
    for (const o of this.units) {
      if (o.dead || o.side !== 'atk' || o === u || o.type === 'nurse') continue;
      const dd = dist(o.x, o.y, u.x, u.y);
      const score = dd + (o.hp / o.maxHp) * 6;
      if (score < bestScore) {
        bestScore = score;
        best = o;
      }
    }
    if (!best) return;
    const dd = dist(best.x, best.y, u.x, u.y);
    if (dd > 1.6) this.stepToward(u, best.x, best.y, sp * dt, true);
    u.cd -= dt;
    if (u.cd <= 0) {
      u.cd = 1;
      let healed = false;
      for (const o of this.units) {
        if (o.dead || o.side !== 'atk' || o.type === 'nurse') continue;
        if (dist(o.x, o.y, best.x, best.y) <= (d.healRadius ?? 2) && o.hp < o.maxHp) {
          o.hp = Math.min(o.maxHp, o.hp + healPerSec);
          healed = true;
          this.events.push({ e: 'heal', u: o });
        }
      }
      if (healed) u.attackT = 1;
    }
  }

  private updateDefender(u: RU, dt: number): void {
    if (!u.tu || u.tu.dead) {
      u.tu = this.nearestAttacker(u.x, u.y, 14);
    }
    if (!u.tu) return;
    this.fightUnit(u, u.tu, dt, u.speed);
  }

  private separate(dt: number): void {
    const us = this.units;
    for (let i = 0; i < us.length; i++) {
      const a = us[i];
      if (a.dead) continue;
      for (let j = i + 1; j < us.length; j++) {
        const b = us[j];
        if (b.dead) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        const min = 0.38;
        if (d2 > 0 && d2 < min * min) {
          const d = Math.sqrt(d2);
          const push = ((min - d) / d) * 0.5 * Math.min(1, dt * 8);
          const ax = a.x - dx * push;
          const ay = a.y - dy * push;
          const bx = b.x + dx * push;
          const by = b.y + dy * push;
          if (this.walkable(ax, ay)) {
            a.x = ax;
            a.y = ay;
          }
          if (this.walkable(bx, by)) {
            b.x = bx;
            b.y = by;
          }
        }
      }
    }
  }

  aliveAttackers(): number {
    return this.units.filter((u) => u.side === 'atk' && !u.dead).length;
  }
}
