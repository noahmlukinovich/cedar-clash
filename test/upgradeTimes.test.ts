import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/config/buildings';
import { HEROES, TROOPS } from '../src/config/troops';

/** Each timed level should take much longer than the one before it. */
function checkSteep(name: string, times: number[]): void {
  for (let i = 1; i < times.length; i++) {
    if (times[i - 1] <= 0 || times[i] <= 0) continue;
    expect(times[i], `${name} Lv${i + 1} vs Lv${i}`).toBeGreaterThanOrEqual(times[i - 1] * 2);
  }
}

describe('upgrade timers', () => {
  it('building upgrades grow steeply per level', () => {
    for (const d of Object.values(BUILDINGS)) checkSteep(d.type, d.levels.map((l) => l.time));
  });
  it('troop research grows steeply per level', () => {
    for (const d of Object.values(TROOPS)) checkSteep(d.type, d.levels.map((l) => l.researchTime));
  });
  it('hero upgrades grow steeply per level', () => {
    for (const d of Object.values(HEROES)) checkSteep(d.type, d.levels.map((l) => l.upgradeTime));
  });
  it('the top DMC upgrade takes hours, not minutes', () => {
    const t = BUILDINGS.dmc.levels.at(-1)!.time;
    expect(t).toBeGreaterThanOrEqual(2 * 3600);
  });
});
