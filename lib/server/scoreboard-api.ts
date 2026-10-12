import type { StoredAction } from "@/lib/db/scoreboard";
import { getScoreboardAuthorization, type ScoreboardAuthorization } from "@/lib/auth/authorization";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const validUuid = (value: unknown): value is string =>
  typeof value === "string" && uuidPattern.test(value);
const points = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 2147483647;
const side = (value: unknown): value is "A" | "B" => value === "A" || value === "B";

export function parseStoredAction(value: unknown): StoredAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const keys = Object.keys(item).sort().join(",");
  switch (item.type) {
    case "AWARD":
    case "SUBTRACT":
      return keys === "team,type" && side(item.team) ? { type: item.type, team: item.team } : null;
    case "CORRECT_POINTS":
      return keys === "teamA,teamB,type" && points(item.teamA) && points(item.teamB)
        ? { type: item.type, teamA: item.teamA, teamB: item.teamB } : null;
    case "CORRECT_SERVE":
      return keys === "serving,type" && side(item.serving)
        ? { type: item.type, serving: item.serving } : null;
    case "CONFIRM_SET":
      return keys === "type" ? { type: item.type } : null;
    case "CORRECT_SET":
      return keys === "setNumber,teamA,teamB,type" && Number.isInteger(item.setNumber) &&
        typeof item.setNumber === "number" && item.setNumber >= 1 && item.setNumber <= 5 &&
        points(item.teamA) && points(item.teamB)
        ? { type: item.type, setNumber: item.setNumber, teamA: item.teamA, teamB: item.teamB } : null;
    case "CORRECT_CURRENT_SET":
      return keys === "setNumber,type" && typeof item.setNumber === "number" &&
        Number.isInteger(item.setNumber) && item.setNumber >= 1 && item.setNumber <= 5
        ? { type: item.type, setNumber: item.setNumber } : null;
    default:
      return null;
  }
}

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    const originUrl = new URL(origin);
    const forwardedProto = request.headers.get("x-forwarded-proto");
    const expectedProto = forwardedProto ? `${forwardedProto}:` : new URL(request.url).protocol;
    return originUrl.host === host && originUrl.protocol === expectedProto;
  } catch {
    return false;
  }
}
export async function apiAuth(): Promise<ScoreboardAuthorization | Response> {
  const auth = await getScoreboardAuthorization();
  if (!auth.isAuthenticated) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!auth.isAuthorized) return Response.json({ error: auth.status === "UNAVAILABLE" ?
    "Scoreboard access is temporarily unavailable." : "Scoreboard access denied." },
    { status: auth.status === "UNAVAILABLE" ? 503 : 403 });
  return auth;
}
export function apiError(error: unknown): Response {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (code === "42501") return Response.json({ error: "Scoreboard access denied." }, { status: 403 });
  if (code === "40001") return Response.json({ error: "The score changed. Reload and try again." }, { status: 409 });
  if (code === "P0002") return Response.json({ error: "Match unavailable." }, { status: 404 });
  if (["22023", "22003", "23514", "55000"].includes(code))
    return Response.json({ error: "Action rejected by the current match rules." }, { status: 422 });
  return Response.json({ error: "Scoreboard service temporarily unavailable." }, { status: 503 });
}
