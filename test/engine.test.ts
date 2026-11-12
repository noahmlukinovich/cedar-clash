import { describe, expect, it } from 'vitest';
import { newGame } from '../src/game/state';
import { RaidEngine, type RaidInput, type RaidSetup, TICK, replayRaid } from '../src/raid/engine';
import { localSetup } from '../src/raid/outcome';
import { Rng } from '../src/core/rng';

function setupFor(seed: number, kind: 'campaign' | 'random' = 'random'): RaidSetup {
  const s = newGame();
  s.army = { freshman: 40, engineer: 10, athlete: 8 };
  s.troopLevels = { freshman: 2, engineer: 1, nurse: 1, theology: 1, athlete: 1 };
  const r = new Rng(seed);
  const setup = localSetup(s, kind, () => r.next());
  return { ...setup, wind: true };
}

/** Plays a raid the way the browser does: variable frame times, deploys between frames. */
function playLikeClient(setup: RaidSetup, seed: number): { engine: RaidEngine; inputs: RaidInput[] } {
  const eng = new RaidEngine(setup);
  const r = new Rng(seed);
  let acc = 0;
  let t = 0;
  const spots = [
    [1.5, 1.5],
    [38.2, 2.1],
    [2.3, 37.7],
    [37.9, 38.4],
  ];
  while (!eng.ended && t < 400) {
    const frame = 0.008 + r.next() * 0.03;
    t += frame;
    if (t > 2 && t < 25 && r.next() < 0.3) {
      const [x, y] = spots[Math.floor(r.next() * spots.length)];
      const types = ['freshman', 'engineer', 'athlete'] as const;
      eng.apply({ t: 0, k: 'troop', type: types[Math.floor(r.next() * 3)], x: x + r.int(0, 2) * 0.25, y });
    }
    acc = Math.min(acc + frame, TICK * 10);
    while (acc >= TICK && !eng.ended) {
      acc -= TICK;
      eng.step();
    }
    eng.sim.events.length = 0;
  }
  return { engine: eng, inputs: JSON.parse(JSON.stringify(eng.inputs)) };
}

describe('raid engine determinism', () => {
  for (const seed of [1, 7, 42, 1234]) {
    it(`replays a client-played raid identically (seed ${seed})`, () => {
      const setup = setupFor(seed);
      const played = playLikeClient(JSON.parse(JSON.stringify(setup)), seed + 99);
      expect(played.inputs.length).toBeGreaterThan(5);
      const live = played.engine.result();
      const replay = replayRaid(JSON.parse(JSON.stringify(setup)), played.inputs);
      expect(replay).toEqual(live);
    });
  }

  it('beats the tutorial base with a big army', () => {
    const setup = setupFor(5, 'campaign');
    setup.army = { freshman: 60, athlete: 20, engineer: 20 };
    const inputs: RaidInput[] = [];
    for (let i = 0; i < 100; i++) {
      const type = i < 60 ? 'freshman' : i < 80 ? 'athlete' : 'engineer';
      inputs.push({ t: i, k: 'troop', type, x: 3 + (i % 10) * 0.5, y: 3 });
    }
    const r = replayRaid(setup, inputs);
    expect(r.stars).toBeGreaterThan(0);
    expect(r.usedTroops.freshman).toBe(60);
  });

  it('ignores deploys beyond the army or inside the base', () => {
    const setup = setupFor(3);
    setup.army = { freshman: 2 };
    const r = replayRaid(setup, [
      { t: 0, k: 'troop', type: 'freshman', x: 1, y: 1 },
      { t: 0, k: 'troop', type: 'freshman', x: 1, y: 1 },
      { t: 1, k: 'troop', type: 'freshman', x: 1, y: 1 },
      { t: 1, k: 'troop', type: 'athlete', x: 1, y: 1 },
      { t: 2, k: 'spell', type: 'snowday', x: 20, y: 20 },
      { t: 2, k: 'troop', type: 'freshman', x: 20, y: 20 },
    ]);
    expect(r.usedTroops).toEqual({ freshman: 2 });
    expect(r.usedSpells).toEqual({});
  });

  it('ending before deploying anything is a free cancel', () => {
    const r = replayRaid(setupFor(9), [{ t: 50, k: 'end' }]);
    expect(r.deployedAny).toBe(false);
    expect(r.ticks).toBe(50);
  });
});
