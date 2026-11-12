// What can the player upgrade right now? Pure logic behind the "upgrades list" screen and the
// badge on the Facilities Crew counter. No DOM in here: it is unit-tested under Node.
import { BUILDINGS } from '../config/buildings';
import { HEROES, TROOPS, TROOP_ORDER } from '../config/troops';
import type { BuildingType, HeroType, ResourceId, TroopType } from '../config/types';
import { heroUnlocked, heroUpgradeCheck, researchCheck, troopUnlocked } from './army';
import { dmcLevel, finishNowCost, nextLevelInfo, upgradeCheck } from './economy';
import type { BuildingInst, GameState } from './state';

export interface UpgradeRow {
  /** Building to upgrade. For walls: one of the lowest-level walls. */
  id: number;
  type: BuildingType;
  name: string;
  level: number;
  /** How many buildings the row stands for (walls at this level); 1 otherwise. */
  count: number;
  cost: number;
  res: ResourceId;
  time: number;
  /** Why it can't start yet (waiting rows only). */
  reason?: string;
}

export interface ProgressRow {
  id: number;
  type: BuildingType;
  name: string;
  /** Level being built (1 for new construction). */
  to: number;
  left: number;
  finishCost: number;
}

export interface ExtraRow {
  kind: 'research' | 'hero';
  type: TroopType | HeroType;
  name: string;
  level: number;
  cost: number;
  res: ResourceId;
  time: number;
  /** Can be started right now. */
  ok: boolean;
  reason?: string;
  /** Set while this research / hero upgrade is running: seconds left. */
  left?: number;
}

export interface UpgradeList {
  progress: ProgressRow[];
  ready: UpgradeRow[];
  waiting: UpgradeRow[];
  extras: ExtraRow[];
  /** Things that can be started right now: the badge number. */
  count: number;
}

/** Blockers that go away by themselves (collect more, wait for a builder). Anything else is hidden. */
const isWaiting = (err: string): boolean => err.startsWith('Not enough') || err.startsWith('All Facilities Crew');

const byCost = (a: UpgradeRow, b: UpgradeRow): number => a.cost - b.cost || a.id - b.id;

export function listUpgrades(s: GameState): UpgradeList {
  const progress: ProgressRow[] = [];
  const ready: UpgradeRow[] = [];
  const waiting: UpgradeRow[] = [];

  const consider = (b: BuildingInst, count: number): void => {
    const n = nextLevelInfo(s, b);
    if (!n) return; // maxed, decor, anything without another level
    const err = upgradeCheck(s, b);
    if (err && !isWaiting(err)) return; // needs a higher DMC
    const row: UpgradeRow = { id: b.id, type: b.type, name: b.name ?? BUILDINGS[b.type].name, level: b.level, count, cost: n.cost, res: n.res, time: n.time };
    if (err) {
      row.reason = err;
      waiting.push(row);
    } else ready.push(row);
  };

  // Walls collapse into one row for the lowest level, so a base with 150 walls costs one check.
  let wall: BuildingInst | undefined;
  let wallCount = 0;
  for (const b of s.buildings) {
    if (b.upgrade) {
      progress.push({ id: b.id, type: b.type, name: b.name ?? BUILDINGS[b.type].name, to: b.upgrade.to, left: Math.max(0, b.upgrade.end - s.clock), finishCost: finishNowCost(s, b) });
    } else if (b.type === 'wall') {
      if (!wall || b.level < wall.level) {
        wall = b;
        wallCount = 1;
      } else if (b.level === wall.level) wallCount++;
    } else consider(b, 1);
  }
  if (wall) consider(wall, wallCount);

  progress.sort((a, b) => a.left - b.left || a.id - b.id);
  ready.sort(byCost);
  waiting.sort(byCost);

  const extras: ExtraRow[] = [];
  const lib = s.buildings.find((b) => b.type === 'library');
  if (lib && lib.level >= 1) {
    for (const t of TROOP_ORDER) {
      const d = TROOPS[t];
      const lvl = s.troopLevels[t];
      if (lvl >= d.levels.length || !troopUnlocked(s, t)) continue;
      const n = d.levels[lvl];
      const row: ExtraRow = { kind: 'research', type: t, name: d.name, level: lvl, cost: n.researchCost, res: 'coffee', time: n.researchTime, ok: false };
      if (s.research?.troop === t) {
        row.left = Math.max(0, s.research.end - s.clock);
      } else {
        const err = researchCheck(s, t);
        if (err?.startsWith('Requires')) continue; // needs a higher Library level
        row.ok = !err;
        if (err) row.reason = err;
      }
      extras.push(row);
    }
  }
  const dl = dmcLevel(s);
  for (const h of Object.keys(HEROES) as HeroType[]) {
    const d = HEROES[h];
    const st = s.heroes[h];
    if (!heroUnlocked(s, h) || st.level >= d.levels.length) continue;
    const n = d.levels[st.level];
    const row: ExtraRow = { kind: 'hero', type: h, name: d.name, level: st.level, cost: n.upgradeCost, res: 'chapel', time: n.upgradeTime, ok: false };
    if (st.upgrade) {
      row.left = Math.max(0, st.upgrade.end - s.clock);
    } else {
      const err = heroUpgradeCheck(s, h, dl);
      if (err?.startsWith('Requires')) continue; // needs a higher DMC
      row.ok = !err;
      if (err) row.reason = err;
    }
    extras.push(row);
  }

  return { progress, ready, waiting, extras, count: ready.length + extras.filter((e) => e.ok).length };
}
