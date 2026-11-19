// Shared helpers for tests: a simple raid bot and base legality checks.
import { GRID } from '../src/config/balance';
import { BUILDINGS } from '../src/config/buildings';
import { SPELL_ORDER } from '../src/config/spells';
import { TROOP_ORDER } from '../src/config/troops';
import type { BaseLayout } from '../src/raid/basegen';
import { RaidEngine, type RaidInput, type RaidResult, type RaidSetup, q, replayRaid } from '../src/raid/engine';
import { RaidSim } from '../src/raid/sim';

export const LEVEL1 = Object.fromEntries(TROOP_ORDER.map((t) => [t, 1])) as RaidSetup['troopLevels'];

/** First deployable spot walking in from the map edge toward the centre, from compass direction `dir` (0..7). */
export function deployPoint(sim: RaidSim, dir: number): { x: number; y: number } {
  const DIRS = [
    [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
  ];
  const [dx, dy] = DIRS[dir % 8];
  // Walk in until the white zone, then step back a tile so a small spread still lands on grass.
  const at = (r: number): { x: number; y: number } => ({ x: q(GRID / 2 + dx * (GRID / 2 - 1 - r)), y: q(GRID / 2 + dy * (GRID / 2 - 1 - r)) });
  let r = 0;
  while (r < GRID / 2 && sim.canDeploy(at(r + 0.5).x, at(r + 0.5).y)) r += 0.5;
  return at(Math.max(0, r - 1));
}

/** Bot inputs: the whole army from one side, tanks first, then every spell between the drop and the DMC. */
export function botInputs(setup: RaidSetup, dir: number): RaidInput[] {
  const sim = new RaidSim(setup.base, { troopLevels: setup.troopLevels, heroLevels: setup.heroLevels, ringBySpring: false, wind: false, elephant: false, seed: 1 });
  const p = deployPoint(sim, dir);
  const order = ['rock', 'thesis', 'athlete', 'ra', 'senior', 'goteam', 'engineer', 'runner', 'freshman', 'business', 'music', 'theology', 'nurse'] as const;
  const inputs: RaidInput[] = [];
  let t = 1;
  let i = 0;
  for (const type of order) {
    for (let n = setup.army[type] ?? 0; n > 0; n--) {
      inputs.push({ t, k: 'troop', type, x: q(p.x + ((i % 5) - 2) * 0.1), y: q(p.y + ((Math.floor(i / 5) % 5) - 2) * 0.1) });
      i++;
      if (i % 5 === 0) t++;
    }
    t += 6;
  }
  const dmc = setup.base.pieces.find((pc) => pc.type === 'dmc')!;
  const sx = q((p.x + dmc.x + 2) / 2);
  const sy = q((p.y + dmc.y + 2) / 2);
  t += 200;
  for (const sp of SPELL_ORDER) for (let n = setup.spells[sp] ?? 0; n > 0; n--) inputs.push({ t: t++, k: 'spell', type: sp, x: sx, y: sy });
  return inputs;
}

export function playBot(setup: RaidSetup, dir: number): { inputs: RaidInput[]; result: RaidResult } {
  const inputs = botInputs(setup, dir);
  return { inputs, result: replayRaid(setup, inputs) };
}

/** Run an engine to the end, deploying nothing (used to check setups construct). */
export function idle(setup: RaidSetup): RaidEngine {
  const e = new RaidEngine(setup, true);
  e.apply({ t: 0, k: 'end' });
  return e;
}

/** Tiles covered by every piece; throws on overlap or out-of-bounds. */
export function footprint(base: BaseLayout): Set<number> {
  const seen = new Set<number>();
  for (const pc of base.pieces) {
    const s = BUILDINGS[pc.type].size;
    for (let y = pc.y; y < pc.y + s; y++)
      for (let x = pc.x; x < pc.x + s; x++) {
        if (x < 0 || y < 0 || x >= GRID || y >= GRID) throw new Error(`${pc.type} out of bounds at ${x},${y}`);
        const k = y * GRID + x;
        if (seen.has(k)) throw new Error(`${pc.type} overlaps at ${x},${y}`);
        seen.add(k);
      }
  }
  return seen;
}
