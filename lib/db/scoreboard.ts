import { Pool, type QueryResultRow } from "pg";
import type { PracticeAction } from "@/lib/scoring/practice";

export interface StoredSet {
  number: number;
  teamA: number;
  teamB: number;
  winner: "A" | "B" | null;
  pendingFinalization?: boolean;
  startingServe?: "A" | "B";
}
export interface StoredMatch {
  id: string;
  publicId: string;
  teamA: string;
  teamB: string;
  bestOf: 3 | 5;
  status: "LIVE" | "PAUSED" | "COMPLETED";
  currentSet: number;
  serving: "A" | "B";
  revision: number;
  isTest: boolean;
  isPublished: boolean;
  sets: StoredSet[];
}
export interface MatchSummary {
  id: string;
  publicId: string;
  teamA: string;
  teamB: string;
  status: string;
  revision: number;
  isTest: boolean;
}
export interface OverlaySnapshot {
  publicId: string;
  tournament: string;
  division: string;
  teamA: string;
  teamB: string;
  teamALogoUrl: string | null;
  teamBLogoUrl: string | null;
  status: string;
  currentSet: number;
  serving: "A" | "B" | null;
  revision: number;
  bestOf: 3 | 5;
  isTest: boolean;
  sets: StoredSet[];
}

let pool: Pool | undefined;
export async function closeScoreboardPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
export function isScoreboardDatabaseConfigured(): boolean {
  return Boolean(process.env.SCOREBOARD_DATABASE_URL &&
    process.env.SCOREBOARD_EXPECTED_DATABASE &&
    process.env.SCOREBOARD_DATABASE_TARGET);
}
function getPool(): Pool {
  if (pool) return pool;
  const connectionString = process.env.SCOREBOARD_DATABASE_URL;
  const expected = process.env.SCOREBOARD_EXPECTED_DATABASE;
  const target = process.env.SCOREBOARD_DATABASE_TARGET;
  if (!connectionString || !expected || !target) throw new Error("Scoreboard database unavailable.");
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      decodeURIComponent(url.username) !== "scoreboard_runtime" ||
      decodeURIComponent(url.pathname.slice(1)) !== expected ||
      !["local", "online"].includes(target) ||
      (target === "local" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) ||
      (target === "online" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) {
    throw new Error("Scoreboard database target mismatch.");
  }
  pool = new Pool({ connectionString, max: 2, idleTimeoutMillis: 15_000,
    connectionTimeoutMillis: 5_000, application_name: "mva_scoreboard" });
  return pool;
}
async function scalar<T>(sql: string, values: unknown[]): Promise<T> {
  const result = await getPool().query<QueryResultRow>(sql, values);
  return result.rows[0]?.value as T;
}
export async function activeRoleForUser(userId: string): Promise<"ADMIN" | "SCOREKEEPER" | null> {
  const role = await scalar<string | null>("SELECT scoreboard.active_role_for_user($1::uuid) AS value", [userId]);
  if (role === null || role === "ADMIN" || role === "SCOREKEEPER") return role;
  throw new Error("Invalid scoreboard role response.");
}
export function listMatches(actor: string): Promise<MatchSummary[]> {
  return scalar("SELECT scoreboard.phase04_list_matches($1::uuid) AS value", [actor]);
}
export function getMatch(actor: string, id: string): Promise<StoredMatch | null> {
  return scalar("SELECT scoreboard.phase04_snapshot($1::uuid,$2::uuid) AS value", [actor, id]);
}
export function createTestMatch(actor: string, teamA: string, teamB: string, bestOf: 3 | 5, serving: "A" | "B"): Promise<string> {
  return scalar("SELECT scoreboard.phase04_create_test_match($1::uuid,$2::text,$3::text,$4::smallint,$5::char(1)) AS value",
    [actor, teamA, teamB, bestOf, serving]);
}
export type StoredAction = PracticeAction extends infer T ? T extends PracticeAction
  ? Omit<T, "id" | "expectedRevision"> : never : never;
export function applyStoredAction(actor: string, matchId: string, actionId: string, expectedRevision: number, action: StoredAction): Promise<{ state: StoredMatch; replayed: boolean }> {
  return scalar("SELECT scoreboard.phase04_apply($1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::jsonb) AS value",
    [actor, matchId, actionId, expectedRevision, JSON.stringify(action)]);
}
export function getOverlay(publicId: string): Promise<OverlaySnapshot | null> {
  return scalar("SELECT scoreboard.phase04_overlay($1::uuid) AS value", [publicId]);
}

