// Raid behaviour of the five newer troops. Each test builds a tiny base and runs the real
// simulation, so the rules are checked the way a raid (and the server's replay) plays them.
import { describe, expect, it } from 'vitest';
import { GO_MEMBER_DEF, TROOPS, TROOP_ORDER } from '../src/config/troops';
import { BUILDINGS } from '../src/config/buildings';
import type { BuildingType, TroopType } from '../src/config/types';
import { applyAction } from '../src/game/actions';
import { troopUnlocked } from '../src/game/army';
import { newGame } from '../src/game/state';
import type { BaseLayout, BasePiece } from '../src/raid/basegen';
import { type RaidInput, type RaidSetup, TICK, replayRaid } from '../src/raid/engine';
import { applyRaidOutcome } from '../src/raid/outcome';
import { RaidSim } from '../src/raid/sim';

const pc = (type: BuildingType, x: number, y: number, level = 1): BasePiece => ({ type, x, y, level });

function base(pieces: BasePiece[], loot = { tuition: 0, coffee: 0 }): BaseLayout {
  return { name: 'Test U', tagline: '', dmc: 3, pieces, loot, trophiesWin: 30, trophiesLose: 10 };
}

function sim(pieces: BasePiece[], loot = { tuition: 0, coffee: 0 }): RaidSim {
  return new RaidSim(base(pieces, loot), { troopLevels: newGame().troopLevels, heroLevels: { prof: 1, president: 1 }, ringBySpring: false, wind: false, elephant: false, seed: 7 });
}

/** Runs until `done` is true or `seconds` pass; returns the time taken (Infinity if never). */
function run(s: RaidSim, seconds: number, done: () => boolean = () => false): number {
  for (let t = 0; t < seconds; t += TICK) {
    s.update(TICK);
    s.events.length = 0;
    if (done()) return t;
  }
  return Infinity;
}
const B = (s: RaidSim, type: BuildingType) => s.buildings.find((b) => b.type === type)!;

describe('new troop definitions', () => {
  it('are trainable, researchable and unlocked by their buildings', () => {
    for (const t of ['business', 'music', 'runner', 'ra', 'goteam'] as TroopType[]) {
      const d = TROOPS[t];
      expect(TROOP_ORDER).toContain(t);
      expect(d.levels).toHaveLength(5);
      expect(BUILDINGS[d.barracks].trains).toContain(t);
      expect(BUILDINGS[d.barracks].levels.length).toBeGreaterThanOrEqual(d.barracksLevel);
      const s = newGame();
      s.army = {};
      s.resources.coffee = 1e6;
      if (d.barracks !== 'dmc' && d.barracks !== 'reshall') expect(troopUnlocked(s, t)).toBe(false);
      expect(applyAction(structuredClone(s), { k: 'train', type: t }).err).toMatch(/Requires/);
      const have = s.buildings.find((b) => b.type === d.barracks);
      if (have) have.level = d.barracksLevel;
      else s.buildings.push({ id: s.nextId++, type: d.barracks, x: 3, y: 3, level: d.barracksLevel });
      s.buildings.find((b) => b.type === 'reshall')!.level = 5; // room for the big ones
      expect(applyAction(s, { k: 'train', type: t }).err).toBeUndefined();
      expect(s.trainQueue[0].type).toBe(t);
    }
    expect(GO_MEMBER_DEF.levels).toHaveLength(TROOPS.goteam.levels.length);
  });

  it('old saves get a level for every new troop', async () => {
    const { migrate } = await import('../src/game/save');
    const old = JSON.parse(JSON.stringify(newGame()));
    old.troopLevels = { freshman: 3, engineer: 1, nurse: 1, theology: 1, athlete: 2 };
    const s = migrate(old);
    expect(s.troopLevels).toMatchObject({ freshman: 3, athlete: 2, business: 1, music: 1, runner: 1, ra: 1, goteam: 1 });
  });
});

describe('Business Major', () => {
  it('runs past a nearer building to hit storage first', () => {
    const s = sim([pc('shed', 6, 10), pc('registrar', 16, 10)]);
    const biz = s.spawnTroop('business', 3, 11);
    const fresh = s.spawnTroop('freshman', 3, 11.5);
    fresh.wanderUntil = 0;
    run(s, 2);
    expect(biz.tb?.type).toBe('registrar');
    expect(fresh.tb?.type).toBe('shed');
    // with the storage gone it helps with everything else
    s.damageBuilding(B(s, 'registrar'), 1e6);
    run(s, 0.5);
    expect(biz.tb?.type).toBe('shed');
  });

  it('earns 10% bonus loot from a building it finishes, paid on top without costing the defender', () => {
    const s = sim([pc('registrar', 10, 10), pc('rinnova', 20, 10)], { tuition: 1000, coffee: 1000 });
    const reg = B(s, 'registrar');
    const rin = B(s, 'rinnova');
    const biz = s.spawnTroop('business', 9, 11);
    const fresh = s.spawnTroop('freshman', 19, 11);
    s.damageBuilding(reg, reg.hp, biz);
    s.damageBuilding(rin, rin.hp, fresh);
    expect(s.loot.tuition).toBeCloseTo(reg.loot.tuition);
    expect(s.bonusLoot.tuition).toBeCloseTo(reg.loot.tuition * 0.1);
    expect(s.bonusLoot.coffee).toBe(0); // the freshman's kill earns nothing extra

    // through the whole pipeline: the attacker receives loot + bonus
    const g = newGame();
    g.resources = { tuition: 0, coffee: 0, chapel: 0 };
    g.army = { business: 6 };
    const setup: RaidSetup = { kind: 'random', base: base([pc('registrar', 10, 10)], { tuition: 1000, coffee: 0 }), seed: 5, wind: false, ringBySpring: false, troopLevels: g.troopLevels, heroLevels: { prof: 1, president: 1 }, heroes: {}, army: { business: 6 }, spells: {} };
    const inputs: RaidInput[] = Array.from({ length: 6 }, (_, i) => ({ t: i, k: 'troop', type: 'business', x: 8.5, y: 10 + i * 0.4 }));
    const r = replayRaid(setup, inputs);
    expect(r.destruction).toBe(1);
    expect(r.loot.tuition).toBeGreaterThan(0);
    expect(r.bonus!.tuition).toBe(Math.floor(r.loot.tuition * 0.1 + 1e-6));
    const out = applyRaidOutcome(g, setup, r);
    expect(out.tuition).toBe(r.loot.tuition + r.bonus!.tuition);
    expect(g.resources.tuition).toBe(out.gotT);
  });
});

describe('Music Major', () => {
  it('hits a building from behind an unbroken wall', () => {
    const walls = Array.from({ length: 9 }, (_, i) => pc('wall', 12, 6 + i));
    const s = sim([pc('shed', 14, 9), ...walls]);
    const m = s.spawnTroop('music', 6, 10);
    const shed = B(s, 'shed');
    expect(run(s, 12, () => shed.hp < shed.maxHp)).toBeLessThan(12);
    expect(m.x).toBeLessThan(12); // still on its own side
    expect(s.buildings.filter((b) => b.isWall && (b.dead || b.hp < b.maxHp))).toEqual([]);
  });

  it('doubles every fourth hit', () => {
    const s = sim([pc('dmc', 10, 10, 6)]);
    const m = s.spawnTroop('music', 8, 12);
    const dmc = B(s, 'dmc');
    const hits: number[] = [];
    let last = dmc.hp;
    run(s, 12, () => {
      if (dmc.hp < last) {
        hits.push(Math.round((last - dmc.hp) * 100) / 100);
        last = dmc.hp;
      }
      return hits.length >= 8;
    });
    const one = TROOPS.music.levels[0].dps * TROOPS.music.attackRate;
    expect(hits).toEqual([one, one, one, one * 2, one, one, one, one * 2]);
    expect(m.hits).toBe(8);
  });
});

describe('Cross Country Runner', () => {
  // A shed fully ringed by walls, with a lake on the direct line.
  const ringed = (): BasePiece[] => {
    const p = [pc('shed', 19, 19), pc('lake', 13, 19)];
    for (let i = 17; i <= 22; i++) p.push(pc('wall', i, 17), pc('wall', i, 22));
    for (let i = 18; i <= 21; i++) p.push(pc('wall', 17, i), pc('wall', 22, i));
    return p;
  };

  it('goes over walls and the lake without touching them, while a Freshman has to break in', () => {
    const s = sim(ringed());
    const shed = B(s, 'shed');
    s.spawnTroop('runner', 8, 20);
    const tRun = run(s, 30, () => shed.hp < shed.maxHp);
    expect(tRun).toBeLessThan(6);
    expect(s.buildings.filter((b) => b.isWall && b.hp < b.maxHp)).toEqual([]);

    const s2 = sim(ringed());
    const shed2 = B(s2, 'shed');
    const f = s2.spawnTroop('freshman', 8, 20);
    f.wanderUntil = 0;
    const tWalk = run(s2, 60, () => shed2.hp < shed2.maxHp);
    expect(tWalk).toBeGreaterThan(tRun);
    expect(s2.buildings.some((b) => b.isWall && b.hp < b.maxHp)).toBe(true);
  });

  it('builds momentum: faster the longer it runs, and the first hit after a run is the big one', () => {
    const s = sim([pc('dmc', 30, 18, 6)]);
    const r = s.spawnTroop('runner', 4, 20);
    const dmc = B(s, 'dmc');
    const moved = (secs: number): number => {
      const { x, y } = r;
      run(s, secs);
      return Math.hypot(r.x - x, r.y - y);
    };
    run(s, 0.5);
    const early = moved(0.5);
    run(s, 3);
    const late = moved(0.5);
    expect(late).toBeGreaterThan(early * 1.2);
    const hits: number[] = [];
    let last = dmc.hp;
    run(s, 20, () => {
      if (dmc.hp < last) {
        hits.push(last - dmc.hp);
        last = dmc.hp;
      }
      return hits.length >= 2;
    });
    const one = TROOPS.runner.levels[0].dps * TROOPS.runner.attackRate;
    expect(hits[0]).toBeCloseTo(one * 2.5); // 3s of momentum at +50%/s
    expect(hits[1]).toBeCloseTo(one);
  });

  it('loses its momentum when a Cedar Sprayer soaks it', () => {
    const s = sim([pc('dmc', 30, 18, 6)]);
    const r = s.spawnTroop('runner', 4, 20);
    run(s, 3);
    expect(r.runT).toBeGreaterThan(2.5);
    r.slowUntil = s.time + 0.3;
    r.slowMul = 0.6;
    run(s, 0.1);
    expect(r.runT).toBe(0);
  });
});

describe('RA', () => {
  it('draws tower fire away from a troop that is closer', () => {
    const s = sim([pc('ratower', 15, 15)]);
    const tower = B(s, 'ratower');
    const fresh = s.spawnTroop('freshman', 13.5, 16);
    fresh.wanderUntil = 0;
    run(s, 0.3);
    expect(tower.target).toBe(fresh);
    const ra = s.spawnTroop('ra', 11.5, 16); // farther away, still in range
    run(s, 0.2);
    expect(tower.target).toBe(ra);
    // and fire returns to the others once the RA is down
    s.damageUnit(ra, 1e6, 'test');
    run(s, 0.2);
    expect(tower.target).toBe(fresh);
  });

  it('sets off a hidden nest from 2 tiles away and takes reduced stings', () => {
    const mk = (type: TroopType): { s: RaidSim; hpLost: number; triggered: boolean; d: number } => {
      const s = sim([pc('nest', 15, 15, 1), pc('shed', 22, 14)]);
      const nest = B(s, 'nest');
      const u = s.spawnTroop(type, 15.5 - 1.9, 15.5); // 1.9 tiles from the nest
      u.wanderUntil = 0;
      u.speed = 0; // stand still so both take the same exposure
      run(s, 0.1);
      const triggered = !nest.hidden;
      const d = Math.abs(u.x - 15.5);
      run(s, 6);
      return { s, hpLost: u.maxHp - u.hp, triggered, d };
    };
    const ra = mk('ra');
    const fresh = mk('freshman');
    expect(ra.triggered).toBe(true);
    expect(fresh.triggered).toBe(false); // a normal troop has to step on it
    const L = BUILDINGS.nest.levels[0];
    expect(ra.hpLost).toBeCloseTo(L.trapDps! * L.trapDuration! * 0.4, 0);
    expect(fresh.hpLost).toBe(0);
  });

  it('respects Chapel Announcement like everyone else', () => {
    const s = sim([pc('nest', 15, 15, 1)]);
    const ra = s.spawnTroop('ra', 14, 15.5);
    ra.speed = 0;
    ra.ignoreTrapsUntil = 99;
    run(s, 1);
    expect(B(s, 'nest').hidden).toBe(true);
  });
});

describe('GO Team', () => {
  const members = (s: RaidSim) => s.units.filter((u) => u.type === 'gomember' && !u.dead);

  it('does no damage itself, then unloads five members at its first target', () => {
    const s = sim([pc('dmc', 14, 10, 6)]);
    const van = s.spawnTroop('goteam', 6, 12);
    const dmc = B(s, 'dmc');
    const t = run(s, 20, () => van.dead);
    expect(t).toBeLessThan(20);
    expect(dmc.hp).toBe(dmc.maxHp); // the van never hit anything
    expect(members(s)).toHaveLength(5);
    expect(s.aliveAttackers()).toBe(5);
    run(s, 4);
    expect(dmc.hp).toBeLessThan(dmc.maxHp);
    // the trip ends after 15 seconds
    run(s, 12);
    expect(members(s)).toHaveLength(0);
    expect(s.aliveAttackers()).toBe(0);
  });

  it('still unloads, exactly once, if the van is destroyed on the way', () => {
    const s = sim([pc('dmc', 30, 10, 6)]);
    const van = s.spawnTroop('goteam', 4, 12);
    run(s, 1);
    s.damageUnit(van, 1e6, 'test');
    s.damageUnit(van, 1e6, 'test');
    expect(van.dead).toBe(true);
    expect(members(s)).toHaveLength(5);
    for (const m of members(s)) expect(Math.hypot(m.x - van.x, m.y - van.y)).toBeLessThan(1);
  });

  it('unloads members at the van\'s research level', () => {
    const s = new RaidSim(base([pc('dmc', 14, 10, 6)]), { troopLevels: { ...newGame().troopLevels, goteam: 3 }, heroLevels: { prof: 1, president: 1 }, ringBySpring: false, wind: false, elephant: false, seed: 1 });
    const van = s.spawnTroop('goteam', 6, 12);
    s.damageUnit(van, 1e6, 'test');
    expect(members(s)[0].maxHp).toBe(GO_MEMBER_DEF.levels[2].hp);
  });

  it('a raid using only a GO Team replays identically and ends when the team goes home', () => {
    const setup: RaidSetup = { kind: 'random', base: base([pc('dmc', 14, 10, 6), pc('ratower', 20, 16)]), seed: 99, wind: false, ringBySpring: false, troopLevels: newGame().troopLevels, heroLevels: { prof: 1, president: 1 }, heroes: {}, army: { goteam: 1, ra: 1, runner: 2, music: 2, business: 2 }, spells: {} };
    const inputs: RaidInput[] = [
      { t: 0, k: 'troop', type: 'goteam', x: 6, y: 12 },
      { t: 5, k: 'troop', type: 'ra', x: 6, y: 13 },
      { t: 9, k: 'troop', type: 'runner', x: 5, y: 14 },
      { t: 12, k: 'troop', type: 'music', x: 5, y: 11 },
      { t: 15, k: 'troop', type: 'business', x: 5, y: 10 },
    ];
    const a = replayRaid(setup, inputs);
    const b = replayRaid(JSON.parse(JSON.stringify(setup)), JSON.parse(JSON.stringify(inputs)));
    expect(a).toEqual(b);
    expect(a.usedTroops).toEqual({ goteam: 1, ra: 1, runner: 1, music: 1, business: 1 });
    expect(a.ticks).toBeGreaterThan(30);
  });
});
