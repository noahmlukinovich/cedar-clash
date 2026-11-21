// Request/response shapes shared by the browser client and the game server.
import type { Action } from '../game/actions';
import type { HeroType, SpellType, TroopType, BuildingType } from '../config/types';
import type { GameState } from '../game/state';
import type { RaidInput, RaidSetup } from '../raid/engine';
import type { RaidOutcome } from '../raid/outcome';

export interface UserInfo {
  id: number;
  name: string;
}

/** Things that happened on the server that the client should show (toasts, popups). */
export type Note =
  | { ev: 'ticket'; data: { text: string; fine: number } }
  | { ev: 'eventStart'; data: { type: string } }
  | { ev: 'chapelSkip'; data: string }
  | { ev: 'achievement'; data: string }
  /** A raid was called off because the game was updated mid-raid; any scouting fee was refunded. */
  | { ev: 'raidVoided'; data: { refund: number } };

export interface DefenseEntry {
  id: number;
  /** The raid's id, for watching its replay or taking revenge. */
  raidId: string;
  /** True while you can still raid this attacker back. */
  revenge: boolean;
  attacker: string;
  stars: number;
  destruction: number;
  tuition: number;
  coffee: number;
  trophies: number;
  at: number;
}

export interface StateMsg {
  state: GameState;
  /** Last action sequence number the server has applied for this client (0 if none). */
  seq: number;
  shieldUntil: number;
  notes: Note[];
  defenses: DefenseEntry[];
}

export interface MeResponse extends StateMsg {
  user: UserInfo;
}

export interface SyncRequest {
  /** Random id for this open copy of the game (one per device/tab). */
  client: string;
  /** Sequence number of the first action; actions the server already applied are skipped. */
  seq: number;
  actions: Action[];
}

export interface SyncResponse extends StateMsg {
  errors: string[];
}

export interface RaidStartRequest {
  kind: 'campaign' | 'random' | 'elephant' | 'revenge' | 'daily';
  /** For 'revenge': the raid on you to answer. */
  raidId?: string;
  /** The client's SIM_VERSION; the server refuses to start a raid the client would play differently. */
  sim?: number;
}

export interface RaidStartResponse {
  raidId: string;
  setup: RaidSetup;
}

export interface RaidInputsRequest {
  raidId: string;
  inputs: RaidInput[];
}

export interface RaidFinishResponse extends StateMsg {
  outcome: RaidOutcome;
}

export interface LeaderRow {
  name: string;
  trophies: number;
  dmc: number;
}

/** A building as other players may see it: where it is and what level, nothing else. */
export interface VisitBuilding {
  /** Position in the list, not the owner's real building id. */
  id: number;
  type: BuildingType;
  x: number;
  y: number;
  level: number;
  name?: string;
  upgrading?: boolean;
}

/** Public progression only: levels and unlocks, never the player's current army or resources. */
export interface PlayerProfile {
  name: string;
  trophies: number;
  bestTrophies: number;
  dmc: number;
  troopLevels: Partial<Record<TroopType, number>>;
  spells: SpellType[];
  heroLevels: Partial<Record<HeroType, number>>;
}

/** The public view of someone's campus (GET /api/visit?name=...). Hidden traps are left out. */
export interface VisitResponse {
  name: string;
  trophies: number;
  dmc: number;
  buildings: VisitBuilding[];
  profile: PlayerProfile;
}

/** One line of the raid log (GET /api/replays): a finished raid you made or defended against. */
export interface ReplayRow {
  id: string;
  role: 'attack' | 'defense';
  /** The other side: the campus you raided, or the player who raided you. */
  opponent: string;
  stars: number;
  destruction: number;
  /** Loot you gained (attack) or lost (defense). */
  tuition: number;
  coffee: number;
  /** Your trophy change. */
  trophies: number;
  at: number;
  /** Defenses only: true while you can still raid this attacker back. */
  revenge?: boolean;
  /** Recorded under older raid rules, so it can no longer be played back. */
  outdated?: boolean;
}

/** Everything needed to play a finished raid back (GET /api/replay?id=...). */
export interface ReplayResponse {
  id: string;
  attacker: string;
  setup: RaidSetup;
  inputs: RaidInput[];
  /** What the server scored when the raid happened. */
  stars: number;
  destruction: number;
  at: number;
}

export const NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9_ .'-]{1,18}[A-Za-z0-9_.]$/;

export const NAME_RULES = "Campus names are 3–20 letters, numbers, spaces, or _ . ' - (no leading/trailing spaces)";

/** A name the server will accept for sign-up or the one-time rename. */
export function validCampusName(n: unknown): n is string {
  return typeof n === 'string' && NAME_RE.test(n) && !/\s{2,}/.test(n);
}

export interface RenameResponse {
  name: string;
}
