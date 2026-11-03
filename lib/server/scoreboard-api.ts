import {
  createOfficialMatch,
  createTestMatch,
  type CreateOfficialMatchInput,
  type StoredAction,
} from "../db/scoreboard.ts";
import type { ScoreboardAuthorization } from "../auth/evaluate-authorization.ts";
import {
  MvaCatalogClientError,
  validateMatchupWithMva,
  type MvaCatalogClientConfig,
} from "../integrations/mva-catalog-client.ts";

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
  const { getScoreboardAuthorization } = await import("../auth/authorization.ts");
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

export interface CreateMatchRouteDeps {
  authProvider?: () => Promise<ScoreboardAuthorization | Response>;
  clientConfig?: MvaCatalogClientConfig;
  createOfficialMatchFn?: (
    actor: string,
    input: CreateOfficialMatchInput
  ) => Promise<string>;
  createTestMatchFn?: (
    actor: string,
    teamA: string,
    teamB: string,
    bestOf: 3 | 5,
    serving: "A" | "B"
  ) => Promise<string>;
}

export async function handleCreateMatchRequest(
  request: Request,
  deps?: CreateMatchRouteDeps
): Promise<Response> {
  if (!sameOrigin(request)) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const auth = await (deps?.authProvider ?? apiAuth)();
  if (auth instanceof Response) return auth;
  if (auth.role !== "ADMIN") {
    return Response.json({ error: "ADMIN required." }, { status: 403 });
  }
  if (Number(request.headers.get("content-length")) > 4096) {
    return Response.json({ error: "Request too large." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Invalid match settings." }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const bestOf = input.bestOf;
  const serving = input.serving;
  if ((bestOf !== 3 && bestOf !== 5) || (serving !== "A" && serving !== "B")) {
    return Response.json(
      { error: "Enter two different teams and valid match rules." },
      { status: 400 }
    );
  }

  const isOfficialPayload =
    input.mode === "official" ||
    "tournamentId" in input ||
    "divisionId" in input ||
    "registrationAId" in input ||
    "registrationBId" in input;

  if (isOfficialPayload) {
    const tournamentId =
      typeof input.tournamentId === "string" ? input.tournamentId.trim() : "";
    const divisionId =
      typeof input.divisionId === "string" ? input.divisionId.trim() : "";
    const registrationAId =
      typeof input.registrationAId === "string"
        ? input.registrationAId.trim()
        : "";
    const registrationBId =
      typeof input.registrationBId === "string"
        ? input.registrationBId.trim()
        : "";

    if (
      !validUuid(tournamentId) ||
      !validUuid(divisionId) ||
      !validUuid(registrationAId) ||
      !validUuid(registrationBId) ||
      registrationAId.toLowerCase() === registrationBId.toLowerCase()
    ) {
      return Response.json(
        {
          error:
            "Select an eligible tournament, division, two distinct teams, match format, and first serving team.",
        },
        { status: 400 }
      );
    }

    try {
      // Authoritative MVA revalidation immediately before creation.
      // Any client-supplied team/tournament/division/logo fields are ignored.
      const matchup = await validateMatchupWithMva(
        {
          tournamentId,
          divisionId,
          registrationAId,
          registrationBId,
        },
        deps?.clientConfig
      );

      const createOfficial = deps?.createOfficialMatchFn ?? createOfficialMatch;
      const id = await createOfficial(auth.userId!, {
        mvaTournamentId: matchup.tournament.id,
        mvaDivisionId: matchup.division.id,
        mvaTeamAId: matchup.teamA.teamId,
        mvaTeamBId: matchup.teamB.teamId,
        mvaRegistrationAId: matchup.teamA.registrationId,
        mvaRegistrationBId: matchup.teamB.registrationId,
        tournamentName: matchup.tournament.name,
        divisionName: matchup.division.name,
        teamAName: matchup.teamA.name,
        teamBName: matchup.teamB.name,
        teamALogoUrl: matchup.teamA.logoUrl,
        teamBLogoUrl: matchup.teamB.logoUrl,
        bestOf,
        serving,
      });

      return Response.json(
        { id, matchup },
        { status: 201, headers: { "Cache-Control": "private, no-store" } }
      );
    } catch (error) {
      if (error instanceof MvaCatalogClientError) {
        return Response.json(
          { error: error.message, code: error.code },
          {
            status: error.httpStatus,
            headers: { "Cache-Control": "private, no-store" },
          }
        );
      }
      return apiError(error);
    }
  }

  const teamA = typeof input.teamA === "string" ? input.teamA.trim() : "";
  const teamB = typeof input.teamB === "string" ? input.teamB.trim() : "";
  if (
    !teamA ||
    !teamB ||
    teamA.length > 80 ||
    teamB.length > 80 ||
    teamA.toLocaleLowerCase() === teamB.toLocaleLowerCase()
  ) {
    return Response.json(
      { error: "Enter two different teams and valid match rules." },
      { status: 400 }
    );
  }

  try {
    const createTest = deps?.createTestMatchFn ?? createTestMatch;
    const id = await createTest(auth.userId!, teamA, teamB, bestOf, serving);
    return Response.json(
      { id },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return apiError(error);
  }
}
