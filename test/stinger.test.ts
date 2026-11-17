// Stinger Statue targeting modes: single (one ramping beam) and multi (several flat beams).
import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/config/buildings';
import { applyAction } from '../src/game/actions';
import { newGame } from '../src/game/state';
import type { BasePiece } from '../src/raid/basegen';
import { TICK } from '../src/raid/engine';
import { RaidSim } from '../src/raid/sim';

function sim(mode?: 'multi'): RaidSim {
  const pieces: BasePiece[] = [
    { type: 'dmc', x: 4, y: 4, level: 1 },
    { type: 'stinger', x: 20, y: 20, level: 1, ...(mode ? { mode } : {}) },
  ];
  return new RaidSim(
    { name: 'Test U', tagline: '', dmc: 5, pieces, loot: { tuition: 0, coffee: 0 }, trophiesWin: 30, trophiesLose: 10 },
    { troopLevels: newGame().troopLevels, heroLevels: { prof: 1, president: 1 }, ringBySpring: false, wind: false, elephant: false, seed: 7 },
  );
}

function tick(s: RaidSim, seconds: number): void {
  for (let t = 0; t < seconds; t += TICK) {
    s.update(TICK);
    s.events.length = 0;
  }
}

const statue = (s: RaidSim) => s.buildings.find((b) => b.type === 'stinger')!;
const D = BUILDINGS.stinger.levels[0].defense!;

describe('Stinger Statue modes', () => {
  it('single mode beams one raider', () => {
    const s = sim();
    const us = [0, 1, 2, 3].map((i) => s.spawnTroop('freshman', 24 + i * 0.3, 24));
    for (const u of us) u.speed = 0;
    tick(s, 0.5);
    expect(statue(s).multi).toBe(false);
    expect(us.filter((u) => u.hp < u.maxHp)).toHaveLength(1);
  });

  it('multi mode beams up to multiTargets raiders at the flat multi damage', () => {
    const s = sim('multi');
    const us = [0, 1, 2, 3, 4].map((i) => s.spawnTroop('freshman', 24 + i * 0.3, 24));
    for (const u of us) {
      u.speed = 0;
      u.hp = u.maxHp = 1e6;
    }
    tick(s, 5);
    const b = statue(s);
    expect(b.multi).toBe(true);
    const hit = us.filter((u) => u.hp < u.maxHp);
    expect(hit).toHaveLength(D.multiTargets!);
    // no ramp: about multiDps * 5s each, well short of the single-mode ramp
    for (const u of hit) expect(u.maxHp - u.hp).toBeCloseTo(D.multiDps! * 5, -1);
  });

  it('is switched with the beamMode action, only on stinger statues', () => {
    const s = newGame();
    const st = { id: 999, type: 'stinger' as const, x: 10, y: 10, level: 1 };
    s.buildings.push(st);
    expect(applyAction(s, { k: 'beamMode', id: 999, mode: 'multi' }).err).toBeUndefined();
    expect(st).toHaveProperty('mode', 'multi');
    expect(applyAction(s, { k: 'beamMode', id: 999, mode: 'single' }).err).toBeUndefined();
    expect(st).not.toHaveProperty('mode');
    expect(applyAction(s, { k: 'beamMode', id: 999, mode: 'bogus' as 'multi' }).err).toBeTruthy();
    const dmc = s.buildings.find((b) => b.type === 'dmc')!;
    expect(applyAction(s, { k: 'beamMode', id: dmc.id, mode: 'multi' }).err).toBeTruthy();
  });
});
