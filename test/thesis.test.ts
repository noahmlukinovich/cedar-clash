// Thesis Defender: a DMC 8 heavy hitter whose hits stack on one building (Citation Needed).
import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/config/buildings';
import { TROOPS, TROOP_ORDER } from '../src/config/troops';
import { troopUnlocked } from '../src/game/army';
import { newGame } from '../src/game/state';
import type { BasePiece } from '../src/raid/basegen';
import { TICK } from '../src/raid/engine';
import { RaidSim, type SimEvent } from '../src/raid/sim';

const CN = TROOPS.thesis.citation!;

function sim(pieces: BasePiece[], seed = 4): RaidSim {
  return new RaidSim(
    { name: 'Test U', tagline: '', dmc: 8, pieces: [{ type: 'dmc', x: 34, y: 34, level: 1 }, ...pieces], loot: { tuition: 0, coffee: 0 }, trophiesWin: 30, trophiesLose: 10 },
    { troopLevels: newGame().troopLevels, heroLevels: { prof: 1, president: 1 }, ringBySpring: false, wind: false, elephant: false, seed },
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

type CitationEvent = Extract<SimEvent, { e: 'citation' }>;
const citations = (seen: SimEvent[]): number[] => seen.filter((e): e is CitationEvent => e.e === 'citation').map((e) => e.n);

/** Damage of each hit a Thesis Defender lands on one unbreakable shed. */
function hitsOnShed(seconds: number): number[] {
  const s = sim([{ type: 'shed', x: 10, y: 10, level: 1 }]);
  const shed = s.buildings.find((b) => b.type === 'shed')!;
  shed.hp = shed.maxHp = 1e9;
  s.spawnTroop('thesis', 12.6, 11);
  const out: number[] = [];
  for (let t = 0; t < seconds; t += TICK) {
    const before = shed.hp;
    s.update(TICK);
    s.events.length = 0;
    if (shed.hp < before) out.push(before - shed.hp);
  }
  return out;
}

describe('Thesis Defender', () => {
  it('is trained at the DMC once it reaches Lv8', () => {
    const d = TROOPS.thesis;
    expect(TROOP_ORDER).toContain('thesis');
    expect(d.barracks).toBe('dmc');
    expect(d.barracksLevel).toBe(8);
    expect(BUILDINGS.dmc.trains).toContain('thesis');
    const g = newGame();
    const dmc = g.buildings.find((b) => b.type === 'dmc')!;
    dmc.level = 7;
    expect(troopUnlocked(g, 'thesis')).toBe(false);
    dmc.level = 8;
    expect(troopUnlocked(g, 'thesis')).toBe(true);
  });

  it('stacks Citation Needed on the same building, then holds at the cap', () => {
    const hits = hitsOnShed(30);
    expect(hits.length).toBeGreaterThan(CN.maxStacks + 2);
    const first = hits[0];
    for (let i = 0; i < hits.length; i++) {
      const stacks = Math.min(i, CN.maxStacks);
      expect(hits[i]).toBeCloseTo(first * (1 + stacks * CN.perHit), 3);
    }
  });

  it('starts over on a new target', () => {
    const s = sim([
      { type: 'shed', x: 10, y: 10, level: 1 },
      { type: 'shed', x: 10, y: 14, level: 1 },
    ]);
    const [a, b] = s.buildings.filter((x) => x.type === 'shed');
    a.hp = a.maxHp = 1e9;
    b.hp = b.maxHp = 1e9;
    const u = s.spawnTroop('thesis', 12.6, 11);
    expect(citations(tick(s, 15)).slice(0, CN.maxStacks + 1)).toEqual([1, 2, 3, 4, 4]);
    expect(u.citeB).toBe(a);
    // the first shed gives out: the next one is a fresh argument
    a.hp = 1;
    const seen = tick(s, 30);
    expect(u.citeB).toBe(b);
    // the finishing blow on the first shed still has full stacks; the first hit on the new one has none
    expect(citations(seen).slice(0, 4)).toEqual([4, 1, 2, 3]);
  });

  it('plays out the same way twice', () => {
    const play = (): string => {
      const s = sim(
        [
          { type: 'shed', x: 10, y: 10, level: 1 },
          { type: 'shed', x: 16, y: 10, level: 1 },
        ],
        11,
      );
      s.spawnTroop('thesis', 12.6, 11);
      s.spawnTroop('thesis', 15, 13);
      tick(s, 60);
      return JSON.stringify(s.buildings.map((b) => b.hp)) + JSON.stringify(s.units.map((u) => [u.x, u.y, u.hp, u.cite]));
    };
    expect(play()).toBe(play());
  });
});
