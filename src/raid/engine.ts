// Deterministic raid engine: wraps RaidSim with the raid rules (scouting, timer, deploy
// limits, end conditions) and a fixed timestep. Given the same RaidSetup and the same
// list of inputs, a raid always plays out identically, which lets the server replay a
// player's raid to verify its result. No DOM or rendering code may live here.
import { ELEPHANT_RUN_TIME, GRID, RAID_TIME } from '../config/balance';
import { TROOP_ORDER } from '../config/troops';
import { SPELL_ORDER } from '../config/spells';
import type { HeroType, SpellType, TroopType } from '../config/types';
import type { BaseLayout } from './basegen';
import { type RU, RaidSim } from './sim';

export type RaidKind = 'campaign' | 'random' | 'elephant' | 'player';

/** Everything needed to (re)play a raid. Built by the client offline, or by the server online. */
export interface RaidSetup {
  kind: RaidKind;
  base: BaseLayout;
  seed: number;
  wind: boolean;
  ringBySpring: boolean;
  troopLevels: Record<TroopType, number>;
  heroLevels: Record<HeroType, number>;
  /** Heroes that may join, with their starting health fraction. */
  heroes: Partial<Record<HeroType, number>>;
  army: Partial<Record<TroopType, number>>;
  spells: Partial<Record<SpellType, number>>;
  /** Online raids against a real player. */
  defender?: { name: string; trophies: number };
}

export type RaidInput =
  | { t: number; k: 'troop'; type: TroopType; x: number; y: number }
  | { t: number; k: 'hero'; type: HeroType; x: number; y: number }
  | { t: number; k: 'spell'; type: SpellType; x: number; y: number }
  | { t: number; k: 'ability'; type: HeroType }
  | { t: number; k: 'end' };

export interface RaidResult {
  stars: number;
  destruction: number;
  loot: { tuition: number; coffee: number };
  /** Business Major bonus: paid to the attacker on top of `loot`, not taken from the defender. */
  bonus?: { tuition: number; coffee: number };
  usedTroops: Partial<Record<TroopType, number>>;
  usedSpells: Partial<Record<SpellType, number>>;
  /** Remaining health fraction for each hero that was deployed. */
  heroHp: Partial<Record<HeroType, number>>;
  abilities: HeroType[];
  buildingsDestroyed: number;
  wallsByEngineers: number;
  windSurvived: boolean;
  deployedAny: boolean;
  ticks: number;
}

export const TICK = 1 / 30;
export const SCOUT_TIME = 30;
export const ELEPHANT_TROOPS = 30;
export const MAX_INPUTS = 2000;

/** Coordinates are rounded so they survive a JSON round trip unchanged. */
export function q(v: number): number {
  return Math.round(v * 100) / 100;
}

export class RaidEngine {
  readonly sim: RaidSim;
  tick = 0;
  scoutLeft = SCOUT_TIME;
  timeLeft: number;
  started = false;
  ended = false;
  deployedAny = false;
  endDelay = -1;
  troops: Partial<Record<TroopType, number>> = {};
  spells: Partial<Record<SpellType, number>> = {};
  heroUnits: Partial<Record<HeroType, RU>> = {};
  inputs: RaidInput[] = [];
  abilities: HeroType[] = [];
  private lastElephant: RU | null = null;
  readonly maxTicks: number;

  constructor(
    public setup: RaidSetup,
    /** Headless engines (server, tests) drop the visual event stream every tick. */
    private headless = false,
  ) {
    const elephant = setup.kind === 'elephant';
    this.sim = new RaidSim(setup.base, {
      troopLevels: setup.troopLevels,
      heroLevels: setup.heroLevels,
      ringBySpring: setup.ringBySpring,
      wind: setup.wind,
      elephant,
      seed: setup.seed,
    });
    this.timeLeft = elephant ? ELEPHANT_RUN_TIME : RAID_TIME;
    if (elephant) this.troops = { freshman: ELEPHANT_TROOPS };
    else {
      for (const t of TROOP_ORDER) if ((setup.army[t] ?? 0) > 0) this.troops[t] = setup.army[t];
      for (const s of SPELL_ORDER) if ((setup.spells[s] ?? 0) > 0) this.spells[s] = setup.spells[s];
    }
    this.maxTicks = Math.ceil((SCOUT_TIME + this.timeLeft + 3) / TICK);
  }

  get elephant(): boolean {
    return this.setup.kind === 'elephant';
  }

  availableHeroes(): HeroType[] {
    if (this.elephant) return [];
    return (Object.keys(this.setup.heroes) as HeroType[]).filter((h) => (this.setup.heroes[h] ?? 0) > 0.999);
  }

  /** Applies a player input at the current tick. Returns the spawned unit, true, or false if rejected. */
  apply(inp: RaidInput): RU | boolean {
    if (this.ended) return false;
    if (this.inputs.length >= MAX_INPUTS) return false;
    const rec = { ...inp, t: this.tick } as RaidInput;
    const r = this.applyInner(rec);
    if (r) this.inputs.push(rec);
    return r;
  }

  private applyInner(inp: RaidInput): RU | boolean {
    switch (inp.k) {
      case 'end':
        this.ended = true;
        return true;
      case 'ability': {
        const u = this.heroUnits[inp.type];
        if (!u || u.abilityUsed || u.dead) return false;
        this.sim.useAbility(u);
        this.abilities.push(inp.type);
        return true;
      }
      case 'spell': {
        if ((this.spells[inp.type] ?? 0) <= 0) return false;
        if (!inBounds(inp.x, inp.y)) return false;
        this.spells[inp.type]!--;
        this.sim.castSpell(inp.type, inp.x, inp.y);
        this.markDeployed();
        return true;
      }
      case 'troop': {
        if ((this.troops[inp.type] ?? 0) <= 0) return false;
        if (!inBounds(inp.x, inp.y) || !this.sim.canDeploy(inp.x, inp.y)) return false;
        const rng = this.sim.rng;
        const u = this.sim.spawnTroop(inp.type, inp.x + (rng.next() - 0.5) * 0.3, inp.y + (rng.next() - 0.5) * 0.3);
        this.troops[inp.type]!--;
        if (this.elephant) {
          u.elephant = true;
          u.leader = this.lastElephant;
          this.lastElephant = u;
        }
        this.markDeployed();
        return u;
      }
      case 'hero': {
        if (this.heroUnits[inp.type] || !this.availableHeroes().includes(inp.type)) return false;
        if (!inBounds(inp.x, inp.y) || !this.sim.canDeploy(inp.x, inp.y)) return false;
        const u = this.sim.spawnHero(inp.type, inp.x, inp.y, this.setup.heroes[inp.type] ?? 1);
        this.heroUnits[inp.type] = u;
        this.markDeployed();
        return u;
      }
    }
    return false;
  }

  private markDeployed(): void {
    this.deployedAny = true;
    this.started = true;
  }

  /** Advances the raid by one fixed tick. */
  step(): void {
    if (this.ended) return;
    const dt = TICK;
    this.tick++;
    if (this.started) this.timeLeft -= dt;
    else {
      this.scoutLeft -= dt;
      if (this.scoutLeft <= 0) this.started = true;
    }
    if (this.started) this.sim.update(dt);
    this.elephantConga(dt);
    if (this.headless) this.sim.events.length = 0;
    const troopsLeft = Object.values(this.troops).some((n) => (n ?? 0) > 0);
    const heroesLeft = this.availableHeroes().some((h) => !this.heroUnits[h]);
    const nothingLeft = !troopsLeft && !heroesLeft && this.sim.aliveAttackers() === 0 && this.deployedAny;
    if (this.endDelay < 0 && (this.timeLeft <= 0 || this.sim.fullStar || nothingLeft)) this.endDelay = this.sim.fullStar ? 1.5 : 1.0;
    if (this.endDelay > 0) {
      this.endDelay -= dt;
      if (this.endDelay <= 0) this.ended = true;
    }
    if (this.tick >= this.maxTicks) this.ended = true;
  }

  /** Elephant Run: each freshman follows the one deployed before it, holding hands. */
  private elephantConga(dt: number): void {
    if (!this.elephant) return;
    for (const u of this.sim.units) {
      if (!u.elephant || u.dead || !u.leader) continue;
      if (u.leader.dead) {
        u.leader = u.leader.leader ?? null;
        continue;
      }
      const dx = u.leader.x - u.x;
      const dy = u.leader.y - u.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 1.4 && d < 6) {
        u.x += (dx / d) * dt * 1.2;
        u.y += (dy / d) * dt * 1.2;
      }
    }
  }

  result(): RaidResult {
    const usedTroops: Partial<Record<TroopType, number>> = {};
    const usedSpells: Partial<Record<SpellType, number>> = {};
    if (!this.elephant) {
      for (const t of TROOP_ORDER) {
        const n = (this.setup.army[t] ?? 0) - (this.troops[t] ?? 0);
        if (n > 0) usedTroops[t] = n;
      }
      for (const s of SPELL_ORDER) {
        const n = (this.setup.spells[s] ?? 0) - (this.spells[s] ?? 0);
        if (n > 0) usedSpells[s] = n;
      }
    }
    const heroHp: Partial<Record<HeroType, number>> = {};
    for (const [h, u] of Object.entries(this.heroUnits) as [HeroType, RU][]) heroHp[h] = u.dead ? 0 : Math.max(0, u.hp / u.maxHp);
    return {
      stars: this.sim.stars,
      destruction: this.sim.destruction,
      loot: { tuition: Math.floor(this.sim.loot.tuition), coffee: Math.floor(this.sim.loot.coffee) },
      bonus: { tuition: Math.floor(this.sim.bonusLoot.tuition), coffee: Math.floor(this.sim.bonusLoot.coffee) },
      usedTroops,
      usedSpells,
      heroHp,
      abilities: [...this.abilities],
      buildingsDestroyed: this.sim.buildingsDestroyed,
      wallsByEngineers: this.sim.wallsByEngineers,
      windSurvived: this.sim.windSurvived,
      deployedAny: this.deployedAny,
      ticks: this.tick,
    };
  }
}

function inBounds(x: number, y: number): boolean {
  return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x < GRID && y < GRID;
}

/** Replays a raid from its inputs (server-side verification, tests). Invalid inputs are skipped. */
export function replayRaid(setup: RaidSetup, inputs: RaidInput[]): RaidResult {
  const eng = new RaidEngine(setup, true);
  let i = 0;
  const sorted = inputs.slice(0, MAX_INPUTS);
  while (!eng.ended) {
    while (i < sorted.length && sorted[i].t <= eng.tick) {
      const inp = sorted[i++];
      if (inp.t === eng.tick) eng.apply(inp);
    }
    if (eng.ended) break;
    eng.step();
  }
  return eng.result();
}
