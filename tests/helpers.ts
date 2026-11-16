// Headless raid helpers shared by the tests.
import { GRID, RAID_TIME } from '../src/config/balance';
import { BUILDINGS } from '../src/config/buildings';
import type { SpellType, TroopType } from '../src/config/types';
import type { BaseLayout } from '../src/raid/basegen';
import { RaidSim, type RaidOptions } from '../src/raid/sim';

export const LEVEL1 = { freshman: 1, engineer: 1, nurse: 1, theology: 1, athlete: 1 };

export function simOptions(over: Partial<RaidOptions> = {}): RaidOptions {
  return { troopLevels: LEVEL1, heroLevels: { prof: 1, president: 1 }, ringBySpring: false, wind: false, elephant: false, seed: 12345, ...over };
}

/** First deployable tile walking outward from the base toward compass direction `dir` (0..7). */
export function deployPoint(sim: RaidSim, dir: number): { x: number; y: number } {
  const a = (dir * Math.PI) / 4;
  for (let r = 1; r < GRID; r += 0.5) {
    const x = GRID / 2 + Math.cos(a) * r;
    const y = GRID / 2 + Math.sin(a) * r;
    if (x < 0.5 || y < 0.5 || x > GRID - 0.5 || y > GRID - 0.5) break;
    // deployable and beyond everything in that direction
    if (sim.canDeploy(x, y) && !sim.buildings.some((b) => Math.hypot(b.cx - GRID / 2, b.cy - GRID / 2) > r && Math.abs(Math.atan2(b.cy - GRID / 2, b.cx - GRID / 2) - a) < 0.5)) return { x, y };
  }
  return { x: 1, y: 1 };
}

/** A simple bot: drop the whole army at one point (tanks first), cast spells on the DMC, and run the clock out. */
export function playRaid(base: BaseLayout, opts: RaidOptions, army: Partial<Record<TroopType, number>>, dir = 0, spells: Partial<Record<SpellType, number>> = {}): RaidSim {
  const sim = new RaidSim(base, opts);
  const p = deployPoint(sim, dir);
  const order: TroopType[] = ['athlete', 'engineer', 'freshman', 'theology', 'nurse'];
  let i = 0;
  for (const t of order) {
    for (let n = army[t] ?? 0; n > 0; n--) {
      // deterministic little spread so they don't all stand on one spot
      sim.spawnTroop(t, p.x + ((i % 5) - 2) * 0.12, p.y + ((Math.floor(i / 5) % 5) - 2) * 0.12);
      i++;
    }
    sim.run(0.5);
  }
  const dmc = sim.buildings.find((b) => b.type === 'dmc')!;
  sim.run(8);
  for (const [k, n] of Object.entries(spells) as [SpellType, number][]) for (let j = 0; j < n; j++) sim.castSpell(k, (p.x + dmc.cx) / 2, (p.y + dmc.cy) / 2);
  while (sim.time < RAID_TIME && !sim.fullStar && sim.aliveAttackers() > 0) {
    sim.run(1);
    sim.events.length = 0;
  }
  return sim;
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
