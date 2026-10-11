/** Planned command/result types; server validation and transactions are future work. */
export type Side = "A" | "B";
export type MatchStatus = "UPCOMING" | "LIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";
export type ScoreAction =
  | { type: "RALLY_AWARDED"; team: Side }
  | { type: "SET_SERVE"; team: Side; reason: string }
  | { type: "UNDO"; eventId: string; reason: string }
  | { type: "SET_FINALIZED"; setNumber: number };

export interface ScoreCommand {
  matchId: string; // UUID
  idempotencyKey: string; // UUID, stable for retries of the same intent
  expectedRevision: number;
  action: ScoreAction;
}

export interface ScoreSnapshot {
  matchId: string;
  revision: number;
  status: MatchStatus;
  currentSet: number;
  servingTeam: Side | null;
  sets: Array<{
    setNumber: number;
    teamAPoints: number;
    teamBPoints: number;
    winner: Side | null;
    pendingFinalization: boolean;
  }>;
}

export type ScoreCommandResult =
  | { ok: true; state: ScoreSnapshot; replayed: boolean }
  | { ok: false; code: "UNAUTHORIZED" | "FORBIDDEN" | "INVALID" | "CONFLICT" | "UNAVAILABLE"; state?: ScoreSnapshot };
