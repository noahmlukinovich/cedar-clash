import { BUILDINGS, blocksPath, maxCount, maxLevelForDmc } from '../config/buildings';
import { DMC_STORAGE, FINISH_NOW_PER_MIN, GRID } from '../config/balance';
import { ACHIEVEMENTS } from '../config/humor';
import type { BuildingType, ResourceId } from '../config/types';
import { bus, toast } from '../core/bus';
import type { BuildingInst, GameState } from './state';

export function dmcLevel(s: GameState): number {
  const d = s.buildings.find((b) => b.type === 'dmc');
  return d ? Math.max(1, d.level) : 1;
}

export function countOf(s: GameState, type: BuildingType): number {
  return s.buildings.filter((b) => b.type === type).length;
}

export function hasEvent(s: GameState, type: string): boolean {
  return s.events.some((e) => e.type === type && e.end > s.clock);
}

export function caps(s: GameState): Record<ResourceId, number> {
  const dl = dmcLevel(s);
  const c = { tuition: DMC_STORAGE.tuition[dl], coffee: DMC_STORAGE.coffee[dl], chapel: DMC_STORAGE.chapel[dl] };
  for (const b of s.buildings) {
    if (b.level < 1) continue;
    const L = BUILDINGS[b.type].levels[b.level - 1];
    if (b.type === 'registrar') c.tuition += L.capacity ?? 0;
    if (b.type === 'rinnova') c.coffee += L.capacity ?? 0;
  }
  return c;
}

export function addRes(s: GameState, res: ResourceId, amt: number): number {
  const cap = caps(s)[res];
  const before = s.resources[res];
  s.resources[res] = Math.max(0, Math.min(cap, before + amt));
  return s.resources[res] - before;
}

export function canAfford(s: GameState, res: ResourceId, amt: number): boolean {
  return s.resources[res] >= amt;
}

export function spend(s: GameState, res: ResourceId, amt: number): boolean {
  if (s.resources[res] < amt) return false;
  s.resources[res] -= amt;
  return true;
}

export function builders(s: GameState): { total: number; busy: number } {
  const total = s.buildings.filter((b) => b.type === 'shed' && b.level >= 1).length;
  const busy = s.buildings.filter((b) => b.upgrade && b.upgrade.total > 0).length;
  return { total, busy };
}

/** Tile occupancy map: building id per tile, -1 for event construction fencing. */
export function occupancy(s: GameState, ignoreId = -1): Int32Array {
  const occ = new Int32Array(GRID * GRID);
  for (const b of s.buildings) {
    if (b.id === ignoreId) continue;
    const sz = BUILDINGS[b.type].size;
    for (let y = b.y; y < b.y + sz; y++) for (let x = b.x; x < b.x + sz; x++) occ[y * GRID + x] = b.id;
  }
  for (const e of s.events) {
    if (e.type === 'construction' && e.end > s.clock && e.x !== undefined && e.y !== undefined) {
      for (let y = e.y; y < e.y + 2; y++) for (let x = e.x; x < e.x + 2; x++) if (!occ[y * GRID + x]) occ[y * GRID + x] = -1;
    }
  }
  return occ;
}

export const BORDER = 2; // outer tiles are forest, not buildable

export function canPlace(s: GameState, type: BuildingType, x: number, y: number, ignoreId = -1, occ?: Int32Array): boolean {
  const sz = BUILDINGS[type].size;
  if (x < BORDER || y < BORDER || x + sz > GRID - BORDER || y + sz > GRID - BORDER) return false;
  const o = occ ?? occupancy(s, ignoreId);
  for (let yy = y; yy < y + sz; yy++) for (let xx = x; xx < x + sz; xx++) if (o[yy * GRID + xx]) return false;
  return true;
}

export function buildCheck(s: GameState, type: BuildingType): string | null {
  const def = BUILDINGS[type];
  const dl = dmcLevel(s);
  const max = maxCount(type, dl);
  if (countOf(s, type) >= max) {
    if (max === 0) {
      const need = def.counts.findIndex((c) => c > 0);
      return `Requires DMC level ${need}`;
    }
    return `Limit reached (${max}). Upgrade the DMC for more.`;
  }
  const L = def.levels[0];
  if (!canAfford(s, L.res, L.cost)) return `Not enough ${resName(L.res)}`;
  if (L.time > 0) {
    const bl = builders(s);
    if (bl.busy >= bl.total) return 'All Facilities Crew are busy!';
  }
  return null;
}

export function resName(r: ResourceId): string {
  return r === 'tuition' ? 'Tuition' : r === 'coffee' ? 'Coffee' : 'Chapel Credits';
}

export function buildNew(s: GameState, type: BuildingType, x: number, y: number): BuildingInst | string {
  const err = buildCheck(s, type);
  if (err) return err;
  if (!canPlace(s, type, x, y)) return "Can't place there";
  const def = BUILDINGS[type];
  const L = def.levels[0];
  spend(s, L.res, L.cost);
  const b: BuildingInst = { id: s.nextId++, type, x, y, level: 0 };
  if (def.instanceNames) {
    const used = new Set(s.buildings.filter((o) => o.type === type).map((o) => o.name));
    b.name = def.instanceNames.find((n) => !used.has(n)) ?? def.instanceNames[0];
  }
  if (type === 'admissions' || type === 'coffeecart') b.stored = 0;
  if (L.time <= 0) {
    b.level = 1;
  } else {
    b.upgrade = { to: 1, end: s.clock + L.time, total: L.time };
  }
  s.buildings.push(b);
  bump(s, 'built');
  if (type === 'lake') unlock(s, 'lakebridge');
  return b;
}

export function nextLevelInfo(s: GameState, b: BuildingInst): { cost: number; res: ResourceId; time: number; dmc: number } | null {
  const def = BUILDINGS[b.type];
  if (b.level >= def.levels.length) return null;
  const L = def.levels[b.level]; // index = next level - 1
  return { cost: L.cost, res: L.res, time: L.time, dmc: L.dmc };
}

export function upgradeCheck(s: GameState, b: BuildingInst): string | null {
  if (b.upgrade) return 'Already upgrading';
  const n = nextLevelInfo(s, b);
  if (!n) return 'Max level!';
  if (b.type !== 'dmc' && b.level + 1 > maxLevelForDmc(b.type, dmcLevel(s))) return `Requires DMC level ${n.dmc}`;
  if (b.type === 'dmc' && b.level + 1 > n.dmc + 1) return 'Max level';
  if (!canAfford(s, n.res, n.cost)) return `Not enough ${resName(n.res)}`;
  if (n.time > 0) {
    const bl = builders(s);
    if (bl.busy >= bl.total) return 'All Facilities Crew are busy!';
  }
  return null;
}

export function startUpgrade(s: GameState, b: BuildingInst): string | null {
  const err = upgradeCheck(s, b);
  if (err) return err;
  const n = nextLevelInfo(s, b)!;
  spend(s, n.res, n.cost);
  if (n.time <= 0) {
    b.level++;
    bus.emit('buildingDone', b);
  } else {
    // collectors dump what they have when upgrading
    b.upgrade = { to: b.level + 1, end: s.clock + n.time, total: n.time };
  }
  return null;
}

export function finishNowCost(s: GameState, b: BuildingInst): number {
  if (!b.upgrade) return 0;
  return Math.max(1, Math.ceil(((b.upgrade.end - s.clock) / 60) * FINISH_NOW_PER_MIN));
}

export function finishNow(s: GameState, b: BuildingInst): string | null {
  const c = finishNowCost(s, b);
  if (!spend(s, 'chapel', c)) return 'Not enough Chapel Credits';
  if (b.upgrade) b.upgrade.end = s.clock;
  return null;
}

export function collect(s: GameState, b: BuildingInst): number {
  if (b.stored === undefined || b.stored < 1) return 0;
  const res: ResourceId = b.type === 'admissions' ? 'tuition' : 'coffee';
  const got = addRes(s, res, Math.floor(b.stored));
  b.stored -= got;
  if (got <= 0) toast(`${res === 'tuition' ? "Registrar's Office" : 'Rinnova'} is full! Upgrade or build more storage.`, 'bad');
  return got;
}

export function collectorCap(b: BuildingInst): number {
  if (b.level < 1) return 0;
  return BUILDINGS[b.type].levels[b.level - 1].capacity ?? 0;
}

export function bump(s: GameState, stat: string, n = 1): void {
  s.stats[stat] = (s.stats[stat] ?? 0) + n;
}

export function unlock(s: GameState, id: string): void {
  if (s.achievements[id]) return;
  s.achievements[id] = true;
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (a) addRes(s, 'chapel', a.reward);
  bus.emit('achievement', id);
}

export function tickEconomy(s: GameState, dt: number): void {
  const finals = hasEvent(s, 'finals');
  for (const b of s.buildings) {
    if (b.upgrade && s.clock >= b.upgrade.end) {
      b.level = b.upgrade.to;
      b.upgrade = undefined;
      bus.emit('buildingDone', b);
      if (b.type === 'dmc') {
        if (b.level >= 3) unlock(s, 'dmc3');
        if (b.level >= 5) unlock(s, 'dmc5');
      }
    }
    if ((b.type === 'admissions' || b.type === 'coffeecart') && b.level >= 1 && !b.upgrade) {
      const L = BUILDINGS[b.type].levels[b.level - 1];
      let rate = (L.rate ?? 0) / 60;
      if (finals && b.type === 'coffeecart') rate *= 2;
      b.stored = Math.min(L.capacity ?? 0, (b.stored ?? 0) + rate * dt);
    }
  }
}
