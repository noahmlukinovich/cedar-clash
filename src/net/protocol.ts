// Request/response shapes shared by the browser client and the game server.
import type { Action } from '../game/actions';
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

export const NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9_ .'-]{1,18}[A-Za-z0-9_.]$/;
