// Senior: a DMC 7 troop whose damage and speed grow with the raid clock (senioritis).
import { describe, expect, it } from 'vitest';
import { BUILDINGS, maxLevelForDmc } from '../src/config/buildings';
import { TROOPS, TROOP_ORDER } from '../src/config/troops';
import { newGame } from '../src/game/state';
import type { BasePiece } from '../src/raid/basegen';
import { TICK } from '../src/raid/engine';
import { RaidSim, type SimEvent } from '../src/raid/sim';

const SN = TROOPS.senior.senioritis!;

function sim(pieces: BasePiece[]): RaidSim {
  return new RaidSim(
    { name: 'Test U', tagline: '', dmc: 8, pieces: [{ type: 'dmc', x: 34, y: 34, level: 1 }, ...pieces], loot: { tuition: 0, coffee: 0 }, trophiesWin: 30, trophiesLose: 10 },
    { troopLevels: newGame().troopLevels, heroLevels: { prof: 1, president: 1 }, ringBySpring: false, wind: false, elephant: false, seed: 4 },
  );
}

function tick(s: RaidSim, seconds: number, seen: SimEvent[] = []): SimEvent[] {
  for (let t = 0; t < seconds; t += TICK) {
    s.update(TICK);
    seen.push(...s.events);
    s.events.length = 0;
  }
  return seen;
}

/** Let the raid clock run with nobody on the field. */
const wait = (s: RaidSim, seconds: number): void => void tick(s, seconds);

/** Damage a Senior deals to a sturdy shed in `seconds`, deployed `after` seconds into the raid. */
function damageDealt(after: number, seconds = 6): number {
  const s = sim([{ type: 'shed', x: 10, y: 10, level: 1 }]);
  const shed = s.buildings.find((b) => b.type === 'shed')!;
  shed.hp = shed.maxHp = 1e9;
  wait(s, after);
  s.spawnTroop('senior', 12.6, 11);
  tick(s, seconds);
  return shed.maxHp - shed.hp;
}

/** Tiles a Senior walks in `seconds` toward a far-off building, deployed `after` seconds in. */
function walked(after: number, seconds = 3): number {
  const s = sim([{ type: 'shed', x: 30, y: 10, level: 1 }]);
  wait(s, after);
  const u = s.spawnTroop('senior', 4, 11);
  u.wanderUntil = 0;
  const x0 = u.x;
  tick(s, seconds);
  return u.x - x0;
}

describe('Senior', () => {
  it('is trained at Biblical Studies Lv4, which needs DMC 7', () => {
    const d = TROOPS.senior;
    expect(TROOP_ORDER).toContain('senior');
    expect(d.barracks).toBe('biblical');
    expect(BUILDINGS.biblical.trains).toContain('senior');
    expect(BUILDINGS.biblical.levels[d.barracksLevel - 1].dmc).toBe(7);
    expect(maxLevelForDmc('biblical', 6)).toBeLessThan(d.barracksLevel);
    expect(maxLevelForDmc('biblical', 7)).toBe(d.barracksLevel);
  });

  it('senioritis ramps from nothing to full over the first two minutes, then holds', () => {
    const s = sim([]);
    expect(s.senioritis(SN.full)).toBe(0);
    wait(s, SN.full / 2);
    expect(s.senioritis(SN.full)).toBeCloseTo(0.5, 2);
    wait(s, SN.full);
    expect(s.senioritis(SN.full)).toBe(1);
  });

  it('hits about 80% harder at full senioritis', () => {
    const early = damageDealt(0);
    const late = damageDealt(SN.full + 5);
    expect(early).toBeGreaterThan(0);
    const ratio = late / early;
    // the early Senior has a sliver of senioritis already, so a little under 1 + dmg
    expect(ratio).toBeGreaterThan(1 + SN.dmg - 0.15);
    expect(ratio).toBeLessThanOrEqual(1 + SN.dmg + 0.001);
  });

  it('walks about 50% faster at full senioritis', () => {
    const early = walked(0);
    const late = walked(SN.full + 5);
    expect(early).toBeGreaterThan(1);
    const ratio = late / early;
    expect(ratio).toBeGreaterThan(1 + SN.speed - 0.1);
    expect(ratio).toBeLessThanOrEqual(1 + SN.speed + 0.01);
  });

  it('announces full senioritis once, and only with a Senior on the field', () => {
    const s = sim([{ type: 'shed', x: 30, y: 30, level: 1 }]);
    const u = s.spawnTroop('senior', 4, 4);
    u.hp = u.maxHp = 1e9;
    u.speed = 0;
    const ev = tick(s, SN.full + 10).filter((e) => e.e === 'senioritis');
    expect(ev).toHaveLength(1);
    const none = sim([]);
    expect(tick(none, SN.full + 10).some((e) => e.e === 'senioritis')).toBe(false);
  });

  it('replays identically', () => {
    const run = (): string => {
      const s = sim([{ type: 'shed', x: 10, y: 10, level: 1 }, { type: 'ratower', x: 16, y: 10, level: 5 }]);
      for (let i = 0; i < 3; i++) s.spawnTroop('senior', 4 + i * 0.5, 12);
      tick(s, 20);
      return JSON.stringify(s.units.map((u) => [u.x.toFixed(6), u.y.toFixed(6), u.hp.toFixed(3)]));
    };
    expect(run()).toBe(run());
  });

  it("The Rock's crash damage covers every research level", () => {
    expect(TROOPS.rock.crumble!.dmg).toHaveLength(TROOPS.rock.levels.length);
  });
});
