// Request/response shapes shared by the browser client and the game server.
import type { Action } from '../game/actions';
import type { BuildingType } from '../config/types';
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
  | { ev: 'achievement'; data: string };

export interface DefenseEntry {
  id: number;
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
  kind: 'campaign' | 'random' | 'elephant';
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

/** The public view of someone's campus (GET /api/visit?name=...). Hidden traps are left out. */
export interface VisitResponse {
  name: string;
  trophies: number;
  dmc: number;
  buildings: VisitBuilding[];
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
