// Guards SIM_VERSION. The server refuses to settle or replay a raid under different raid rules
// than the ones it was started with, which only works if SIM_VERSION changes whenever the rules
// do. This test plays a fixed set of raids that use every troop, hero, spell and DMC level and
// fingerprints how they unfold. If you changed raid behavior on purpose (sim code, stats,
// balance), bump SIM_VERSION in src/raid/engine.ts and paste the new fingerprint below.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MAX_DMC } from '../src/config/balance';
import { HEROES, TROOPS, TROOP_ORDER } from '../src/config/troops';
import { SPELL_ORDER } from '../src/config/spells';
import type { HeroType, SpellType, TroopType } from '../src/config/types';
import { generateBase, rivalStateU } from '../src/raid/basegen';
import { RaidEngine, type RaidInput, type RaidSetup, SIM_VERSION } from '../src/raid/engine';

/** The fingerprint for the current SIM_VERSION. */
const EXPECTED = { version: SIM_VERSION, fingerprint: 'ceb31528a1c0bc71' };

const HERO_TYPES = Object.keys(HEROES) as HeroType[];

function setupFor(dmc: number, wind: boolean): RaidSetup {
  const lvl = (max: number): number => Math.max(1, Math.min(max, Math.ceil((dmc / MAX_DMC) * max)));
  return {
    kind: 'random',
    simVersion: SIM_VERSION,
    base: dmc === 0 ? rivalStateU() : generateBase(dmc, 1000 + dmc * 7919),
    seed: 4242 + dmc,
    wind,
    ringBySpring: dmc % 3 === 0,
    troopLevels: Object.fromEntries(TROOP_ORDER.map((t) => [t, lvl(TROOPS[t].levels.length)])) as Record<TroopType, number>,
    heroLevels: Object.fromEntries(HERO_TYPES.map((h) => [h, lvl(HEROES[h].levels.length)])) as Record<HeroType, number>,
    heroes: Object.fromEntries(HERO_TYPES.map((h) => [h, 1])),
    army: Object.fromEntries(TROOP_ORDER.map((t) => [t, 4])),
    spells: Object.fromEntries(SPELL_ORDER.map((s) => [s, 2])) as Partial<Record<SpellType, number>>,
  };
}

/** Deploy spots around the edge of the map, where deploying is always allowed. */
const EDGE: [number, number][] = [];
for (let i = 2; i <= 38; i += 4) EDGE.push([0.5, i], [39.5, i], [i, 0.5], [i, 39.5]);

/** A scripted attack: every troop type, both heroes and their abilities, every spell. */
function script(): RaidInput[] {
  const out: RaidInput[] = [];
  let t = 30;
  let spot = 0;
  for (const type of TROOP_ORDER) {
    for (let n = 0; n < 4; n++) {
      const [x, y] = EDGE[spot++ % EDGE.length];
      out.push({ t, k: 'troop', type, x, y });
      t += 7;
    }
  }
  HERO_TYPES.forEach((type, i) => {
    const [x, y] = EDGE[(spot + i * 9) % EDGE.length];
    out.push({ t: 60 + i * 15, k: 'hero', type, x, y });
    out.push({ t: 900 + i * 60, k: 'ability', type });
  });
  SPELL_ORDER.forEach((type, i) => {
    out.push({ t: 600 + i * 120, k: 'spell', type, x: 14 + i * 3, y: 20 - i * 2 });
    out.push({ t: 1500 + i * 120, k: 'spell', type, x: 24 - i * 2, y: 16 + i * 3 });
  });
  return out.sort((a, b) => a.t - b.t);
}

const r3 = (v: number): number => Math.round(v * 1000) / 1000;

/** Plays one raid and records a compact trace of its state every second. */
function trace(setup: RaidSetup): unknown[] {
  const eng = new RaidEngine(setup, true);
  const inputs = script();
  const out: unknown[] = [];
  let i = 0;
  while (!eng.ended) {
    while (i < inputs.length && inputs[i].t <= eng.tick) eng.apply(inputs[i++]);
    if (eng.ended) break;
    eng.step();
    if (eng.tick % 30 === 0) {
      const s = eng.sim;
      out.push([
        eng.tick,
        s.units.map((u) => [u.type, u.side, r3(u.x), r3(u.y), r3(u.hp)]),
        s.buildings.map((b) => (b.dead ? 0 : r3(b.hp))),
        s.stars,
        r3(s.loot.tuition),
        r3(s.loot.coffee),
      ]);
    }
  }
  out.push(eng.result());
  return out;
}

describe('SIM_VERSION', () => {
  it('matches how raids currently play out', () => {
    const h = createHash('sha256');
    for (let dmc = 0; dmc <= MAX_DMC; dmc++) {
      for (const wind of [false, true]) h.update(JSON.stringify(trace(setupFor(dmc, wind))));
    }
    const fingerprint = h.digest('hex').slice(0, 16);
    expect(
      { version: SIM_VERSION, fingerprint },
      'Raids now play out differently. If that is intended, bump SIM_VERSION in src/raid/engine.ts and update EXPECTED in this test.',
    ).toEqual(EXPECTED);
  });
});
