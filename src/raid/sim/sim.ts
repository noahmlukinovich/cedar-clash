// Raid simulation: buildings, troops, defenses, projectiles, spells, events.
// Pure game logic with no DOM, canvas or wall-clock access; the scene turns
// `events` into particles and sounds. All randomness comes from a seeded Rng and
// time advances in fixed steps, so a raid replays identically from the same
// seed and the same inputs.
import { BUILDINGS, blocksPath } from '../../config/buildings';
import { GRID } from '../../config/balance';
import { SPELLS } from '../../config/spells';
import { FAN_DEF, HEROES, TROOPS } from '../../config/troops';
import type { BuildingType, HeroType, SpellType, TroopType, UnitType } from '../../config/types';
import { dist, distToRect } from '../../core/iso';
import { Rng } from '../../core/rng';
import type { BaseLayout } from '../basegen';
import { BLOCKED, FREE, WALL_COST } from '../pathfind';
import { updateBibleProf, updateHive, updateShooter, updateSprayer, updateTrap } from './defenses';
import { UnitGrid } from './spatial';
import type { Projectile, RB, RU, RaidOptions, SimEvent, Zone } from './types';
import { separate, updateAttacker, updateDefender } from './units';

/** Length of one simulation step, in seconds. */
export const SIM_STEP = 1 / 60;
/** Most simulated time one call to advance() will run, so a stalled tab can't spiral. */
const MAX_CATCH_UP = 0.25;
/** New A* searches allowed per step (cached paths are free). */
const PATHS_PER_STEP = 30;

export class RaidSim {
  buildings: RB[] = [];
  /** The wall pieces of `buildings`, for the loops that only care about walls. */
  walls: RB[] = [];
  units: RU[] = [];
  projectiles: Projectile[] = [];
  zones: Zone[] = [];
  events: SimEvent[] = [];
  cost = new Uint8Array(GRID * GRID);
  tileB: (RB | null)[] = new Array(GRID * GRID).fill(null);
  forbid = new Uint8Array(GRID * GRID); // deploy forbidden
  grid = new UnitGrid();
  rng: Rng;
  /** Paths found since the walkable map last changed, keyed by start tile + target. */
  pathCache = new Map<string, number[]>();
  pathBudget = 0;
  time = 0;
  stars = 0;
  dmcDead = false;
  /** Sim time at which the DMC fell, or -1. */
  dmcDeadAt = -1;
  pctStar = false;
  fullStar = false;
  totalCount = 0;
  destroyedCount = 0;
  loot = { tuition: 0, coffee: 0 };
  lootAvail = { tuition: 0, coffee: 0 };
  wallsByEngineers = 0;
  buildingsDestroyed = 0;
  /** Attacking troops and heroes sent in / knocked out so far. */
  deployed = 0;
  lost = 0;
  defendersAlive = 0;
  windStart = -1;
  windDir = 1;
  windOn = false;
  windSurvived = false;
  private uid = 1;
  private acc = 0;
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
      if (p.type === 'lake') b.hp = b.maxHp = 1e9;
      this.buildings.push(b);
      if (b.isWall) this.walls.push(b);
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
    this.tileB.fill(null);
    for (const b of this.buildings) {
      if (b.dead || !blocksPath(b.type)) continue;
      for (let y = b.y; y < b.y + b.size; y++)
        for (let x = b.x; x < b.x + b.size; x++) {
          this.cost[y * GRID + x] = b.isWall ? WALL_COST : BLOCKED;
          this.tileB[y * GRID + x] = b;
        }
    }
    this.pathCache.clear();
    this.dirtyCost = false;
  }

  get destruction(): number {
    return this.totalCount ? this.destroyedCount / this.totalCount : 0;
  }

  /** Defensive buildings still standing. */
  defensesLeft(): number {
    let n = 0;
    for (const b of this.buildings) if (b.isDefense && !b.dead) n++;
    return n;
  }

  canDeploy(x: number, y: number): boolean {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= GRID || iy >= GRID) return false;
    return !this.forbid[iy * GRID + ix];
  }

  walkable(x: number, y: number): boolean {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= GRID || iy >= GRID) return false;
    return this.cost[iy * GRID + ix] === FREE;
  }

  // ---------- Spawning ----------
  spawnTroop(type: TroopType, x: number, y: number): RU {
    const d = TROOPS[type];
    const lvl = this.opts.troopLevels[type];
    const L = d.levels[lvl - 1];
    return this.addUnit({ type, side: 'atk', level: lvl, x, y, hp: L.hp, dps: L.dps, speed: d.speed * (this.opts.elephant ? 1.5 : 1), range: d.range, rate: d.attackRate });
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

  spawnFan(b: RB): void {
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
    };
    this.units.push(u);
    if (u.side === 'atk') this.deployed++;
    else this.defendersAlive++;
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

  // ---------- Main loop ----------
  /** Advance by `dt` seconds of real time, in fixed steps. Returns how many steps ran. */
  advance(dt: number): number {
    this.acc = Math.min(MAX_CATCH_UP, this.acc + dt);
    let n = 0;
    while (this.acc >= SIM_STEP) {
      this.acc -= SIM_STEP;
      this.step(SIM_STEP);
      n++;
    }
    return n;
  }

  /** Run exactly `seconds` of simulation (for tests and headless runs). */
  run(seconds: number): void {
    for (let n = Math.round(seconds / SIM_STEP); n > 0; n--) this.step(SIM_STEP);
  }

  private step(dt: number): void {
    this.time += dt;
    this.pathBudget = PATHS_PER_STEP;
    if (this.dirtyCost) this.rebuildCost();
    this.grid.rebuild(this.units);

    this.stepWind();
    this.stepAuras(dt);
    this.stepZones(dt);

    // Buildings / defenses
    for (const b of this.buildings) {
      if (b.dead) continue;
      b.firing = Math.max(0, b.firing - dt * 4);
      b.hitT = Math.max(0, b.hitT - dt);
      if (b.type === 'hive') updateHive(this, b, dt);
      if (b.isTrap) updateTrap(this, b);
      if (!b.def) continue;
      if (b.frozenUntil > this.time || b.stunUntil > this.time) {
        b.prayT = 0;
        continue;
      }
      if (b.type === 'sprayer') updateSprayer(this, b, dt);
      else if (b.type === 'bibleprof') updateBibleProf(this, b, dt);
      else updateShooter(this, b, dt);
    }

    this.stepProjectiles(dt);

    // Units
    for (const u of this.units) {
      if (u.dead) continue;
      u.t += dt;
      u.flash = Math.max(0, u.flash - dt * 5);
      u.attackT = Math.max(0, u.attackT - dt * 3);
      u.moving = false;
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
      if (u.side === 'atk') updateAttacker(this, u, dt);
      else updateDefender(this, u, dt);
    }
    this.grid.rebuild(this.units);
    separate(this, dt);
    // drop the dead occasionally
    if (this.units.length > 300) this.units = this.units.filter((u) => !u.dead);
  }

  private stepWind(): void {
    if (this.windStart <= 0) return;
    const on = this.time >= this.windStart && this.time < this.windStart + 4;
    if (on === this.windOn) return;
    this.windOn = on;
    this.events.push({ e: 'wind', on, dir: this.windDir });
    if (!on) {
      for (const u of this.units) if (u.side === 'atk') u.needsPath = true;
      if (this.units.some((u) => u.side === 'atk' && !u.dead)) this.windSurvived = true;
    }
  }

  private stepAuras(dt: number): void {
    const a = TROOPS.theology.aura!;
    for (const u of this.units) {
      if (u.dead || u.type !== 'theology' || u.side !== 'atk') continue;
      this.grid.forEachNear(u.x, u.y, a.radius, (o) => {
        if (o.side === 'atk' && o !== u && dist(o.x, o.y, u.x, u.y) <= a.radius) o.auraUntil = this.time + 0.3;
      });
    }
    if (!this.opts.ringBySpring) return;
    this.pairT -= dt;
    if (this.pairT > 0) return;
    this.pairT = 0.5;
    for (const u of this.units) {
      if (u.dead || u.side !== 'atk') continue;
      this.grid.forEachNear(u.x, u.y, 1.3, (o) => {
        if (o !== u && o.side === 'atk' && dist(o.x, o.y, u.x, u.y) < 1.3) u.pairedUntil = this.time + 0.6;
      });
    }
  }

  private stepZones(dt: number): void {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      if (this.time >= z.until) {
        this.zones.splice(i, 1);
        continue;
      }
      if (z.kind !== 'allnighter' && z.kind !== 'announcement' && z.kind !== 'swarm') continue;
      const stung: RU[] = [];
      this.grid.forEachNear(z.x, z.y, z.r, (u) => {
        if (u.side !== 'atk' || dist(u.x, u.y, z.x, z.y) > z.r) return;
        if (z.kind === 'allnighter') u.rageUntil = this.time + 0.3;
        else if (z.kind === 'announcement') u.ignoreTrapsUntil = this.time + 0.4;
        else stung.push(u);
      });
      for (const u of stung) this.damageUnit(u, z.dps * dt, 'sting');
    }
  }

  private stepProjectiles(dt: number): void {
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
      if (u.side === 'atk') this.lost++;
      else this.defendersAlive--;
      this.events.push({ e: 'death', u });
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
      if (amt > 0 && this.rng.next() < 0.15) this.events.push({ e: 'loot', res, amt: b.loot[res] * 0.1, x: b.cx, y: b.cy });
    }
    if (b.hp > 0) return;
    b.dead = true;
    this.dirtyCost = true;
    this.events.push({ e: 'destroyed', b });
    if (b.isWall && by?.type === 'engineer') this.wallsByEngineers++;
    if (b.counts) {
      this.destroyedCount++;
      this.buildingsDestroyed++;
      if (b.type === 'dmc' && !this.dmcDead) {
        this.dmcDead = true;
        this.dmcDeadAt = this.time;
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
    // anyone targeting this re-targets; a fallen building also opens new routes
    for (const u of this.units) {
      if (u.tb === b) {
        u.tb = null;
        u.needsPath = true;
      }
      if (u.wall === b) {
        u.wall = null;
        u.needsPath = true;
      }
      if (!b.isWall && u.side === 'atk') u.needsPath = true;
    }
  }

  // ---------- Buffs ----------
  mulDmg(u: RU): number {
    let m = 1;
    if (u.rageUntil > this.time) m *= 1.6;
    if (u.convoUntil > this.time) m *= 1.5;
    if (u.auraUntil > this.time) m *= 1 + TROOPS.theology.aura!.dmg;
    if (u.pairedUntil > this.time) m *= 1.2;
    return m;
  }

  mulSpeed(u: RU): number {
    let m = 1;
    if (u.slowUntil > this.time) m *= u.slowMul;
    if (u.rageUntil > this.time) m *= 1.4;
    if (u.convoUntil > this.time) m *= 1.3;
    if (u.auraUntil > this.time) m *= 1 + TROOPS.theology.aura!.speed;
    if (u.pairedUntil > this.time) m *= 1.2;
    return m;
  }

  aliveAttackers(): number {
    return this.deployed - this.lost;
  }
}
