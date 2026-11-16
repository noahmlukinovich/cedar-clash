// Raid simulation: buildings, troops, defenses, projectiles, spells, events.
// Pure game logic; the scene turns `events` into particles and sounds. Unit behaviours live in
// ./units, defensive buildings in ./defenses, and the neighbour lookups in ./spatial.
//
// Determinism rules (the server replays raids to verify them): gameplay randomness comes only
// from `rng`, never Math.random (cosmetic event flourishes excepted), and no cos/sin.
import { BUILDINGS, blocksPath } from '../../config/buildings';
import { GRID } from '../../config/balance';
import { FAN_DEF, GO_MEMBER_DEF, HEROES, TROOPS } from '../../config/troops';
import { SPELLS } from '../../config/spells';
import type { BuildingType, HeroType, SpellType, TroopType, UnitType } from '../../config/types';
import { dist, distToRect } from '../../core/iso';
import { Rng } from '../../core/rng';
import { BLOCKED, FREE, WALL_COST } from '../pathfind';
import type { BaseLayout } from '../basegen';
import { updateBibleProf, updateHive, updateShooter, updateSprayer, updateStinger, updateTrap } from './defenses';
import { UnitGrid } from './spatial';
import { type Projectile, type RB, type RU, type RaidOptions, type SimEvent, WANDER_DIRS, type Zone } from './types';
import { separate, updateAttacker, updateDefender } from './units';

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
  /** The wall pieces of `buildings`, for loops that only care about walls. */
  walls: RB[] = [];
  /** Which units are near where. Rebuilt at the start of each tick and before separation. */
  grid = new UnitGrid();
  /** Paths found since the walkable map last changed, keyed by start tile, target, range and kind. */
  pathCache = new Map<string, number[]>();
  /** New path searches left this tick. */
  pathBudget = 0;
  /** Sim time when the DMC fell, or -1. */
  dmcDeadAt = -1;
  /** Troops and heroes the player has sent in (GO Team members who climb out of a van don't count). */
  deployed = 0;
  private uid = 1;
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
        beamT: 0,
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
    this.pathCache.clear();
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
    this.deployed++;
    return u;
  }

  /** A GO Team van parks (or is wrecked) and its team piles out. The van itself is gone either way. */
  unloadVan(u: RU): void {
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
    this.deployed++;
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
      hits: 0,
      runT: 0,
      expireAt: 0,
    };
    this.units.push(u);
    this.grid.add(u);
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
    this.grid.rebuild(this.units);

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
        for (const o of this.grid.near(u.x, u.y, a.radius)) if (o.side === 'atk' && o !== u && dist(o.x, o.y, u.x, u.y) <= a.radius) o.auraUntil = this.time + 0.3;
      }
    }
    if (this.opts.ringBySpring) {
      this.pairT -= dt;
      if (this.pairT <= 0) {
        this.pairT = 0.5;
        for (const u of this.units) {
          if (u.dead || u.side !== 'atk') continue;
          for (const o of this.grid.near(u.x, u.y, 1.3)) {
            if (o !== u && o.side === 'atk' && dist(o.x, o.y, u.x, u.y) < 1.3) {
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
      for (const u of this.grid.near(z.x, z.y, z.r)) {
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
      if (b.type === 'hive') updateHive(this, b, dt);
      if (b.isTrap) updateTrap(this, b);
      if (!b.def) continue;
      if (b.frozenUntil > this.time || b.stunUntil > this.time) {
        b.prayT = 0;
        if (b.type === 'stinger') {
          b.target = null;
          b.beamT = 0;
          b.charge = 0;
        }
        continue;
      }
      if (b.type === 'sprayer') updateSprayer(this, b, dt);
      else if (b.type === 'bibleprof') updateBibleProf(this, b, dt);
      else if (b.type === 'stinger') updateStinger(this, b, dt);
      else updateShooter(this, b, dt);
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
      if (u.side === 'atk') updateAttacker(this, u, dt);
      else updateDefender(this, u, dt);
    }
    this.grid.rebuild(this.units);
    separate(this, dt);
    // cleanup dead units occasionally
    if (this.units.length > 300) this.units = this.units.filter((u) => !u.dead);
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
  walkable(x: number, y: number): boolean {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= GRID || iy >= GRID) return false;
    return this.cost[iy * GRID + ix] === FREE;
  }

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
    const j = u.def?.jumps;
    if (j) m *= 1 + Math.min(u.runT, j.maxRun) * j.speed;
    if (u.slowUntil > this.time) m *= u.slowMul;
    if (u.rageUntil > this.time) m *= 1.4;
    if (u.convoUntil > this.time) m *= 1.3;
    if (u.auraUntil > this.time) m *= 1 + TROOPS.theology.aura!.speed;
    if (u.pairedUntil > this.time) m *= 1.2;
    return m;
  }

  /** Defensive buildings still standing. */
  defensesLeft(): number {
    let n = 0;
    for (const b of this.buildings) if (b.isDefense && !b.dead) n++;
    return n;
  }

  aliveAttackers(): number {
    let n = 0;
    for (const u of this.units) if (u.side === 'atk' && !u.dead) n++;
    return n;
  }
}
