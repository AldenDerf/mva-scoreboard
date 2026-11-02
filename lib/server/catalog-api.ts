import type { ScoreboardAuthorization } from "../auth/authorization.ts";
import {
  fetchEligibleTeamsPage,
  fetchEligibleTournamentsPage,
  fetchTournamentDivisionsPage,
  isValidCatalogUuid,
  MvaCatalogClientError,
  validateMatchupWithMva,
  type MvaCatalogClientConfig,
} from "../integrations/mva-catalog-client.ts";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
} as const;

export function sameCatalogOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    const originUrl = new URL(origin);
    const forwardedProto = request.headers.get("x-forwarded-proto");
    const expectedProto = forwardedProto
      ? `${forwardedProto}:`
      : new URL(request.url).protocol;
    return originUrl.host === host && originUrl.protocol === expectedProto;
  } catch {
    return false;
  }
}

export function catalogJson(
  body: unknown,
  status = 200,
  extraHeaders?: Record<string, string>
): Response {
  return Response.json(body, {
    status,
    headers: {
      ...NO_STORE_HEADERS,
      ...extraHeaders,
    },
  });
}

export function catalogMethodNotAllowed(allowed: "GET" | "POST"): Response {
  return catalogJson(
    { error: "Method not allowed.", code: "METHOD_NOT_ALLOWED" },
    405,
    { Allow: allowed }
  );
}

export function catalogErrorResponse(error: unknown): Response {
  if (error instanceof MvaCatalogClientError) {
    return catalogJson(
      { error: error.message, code: error.code },
      error.httpStatus
    );
  }
  return catalogJson(
    {
      error: "MVA catalog service is temporarily unavailable.",
      code: "UPSTREAM_UNAVAILABLE",
    },
    503
  );
}

export type AuthProvider = () => Promise<ScoreboardAuthorization | Response>;

async function defaultCatalogAuthProvider(): Promise<
  ScoreboardAuthorization | Response
> {
  const { apiAuth } = await import("./scoreboard-api.ts");
  return apiAuth();
}

export async function requireCatalogAdmin(
  authProvider: AuthProvider = defaultCatalogAuthProvider
): Promise<ScoreboardAuthorization | Response> {
  const auth = await authProvider();
  if (auth instanceof Response) return auth;
  if (auth.role !== "ADMIN") {
    return catalogJson(
      { error: "ADMIN required.", code: "FORBIDDEN" },
      403
    );
  }
  return auth;
}

export interface CatalogRouteDeps {
  authProvider?: AuthProvider;
  clientConfig?: MvaCatalogClientConfig;
}

function parseRoutePagination(searchParams: URLSearchParams): {
  cursor?: string | null;
  limit?: number;
} {
  const cursor = searchParams.get("cursor");
  const rawLimit = searchParams.get("limit");
  if (rawLimit === null || rawLimit.trim() === "") {
    return { cursor };
  }
  if (!/^\d+$/.test(rawLimit.trim())) {
    throw new MvaCatalogClientError(
      "INVALID_INPUT",
      "Catalog pagination limit must be between 1 and 100.",
      400
    );
  }
  return { cursor, limit: Number(rawLimit.trim()) };
}

export async function handleScoreboardCatalogTournaments(
  request: Request,
  deps?: CatalogRouteDeps
): Promise<Response> {
  if (request.method !== "GET") {
    return catalogMethodNotAllowed("GET");
  }

  const auth = await requireCatalogAdmin(deps?.authProvider);
  if (auth instanceof Response) return auth;

  try {
    const url = new URL(request.url);
    const pagination = parseRoutePagination(url.searchParams);
    const page = await fetchEligibleTournamentsPage(
      pagination,
      deps?.clientConfig
    );
    return catalogJson(page, 200);
  } catch (error) {
    return catalogErrorResponse(error);
  }
}

export async function handleScoreboardCatalogDivisions(
  request: Request,
  deps?: CatalogRouteDeps
): Promise<Response> {
  if (request.method !== "GET") {
    return catalogMethodNotAllowed("GET");
  }

  const auth = await requireCatalogAdmin(deps?.authProvider);
  if (auth instanceof Response) return auth;

  try {
    const url = new URL(request.url);
    const tournamentId = url.searchParams.get("tournamentId") ?? "";
    if (!isValidCatalogUuid(tournamentId)) {
      return catalogJson(
        { error: "Select a valid tournament ID.", code: "INVALID_INPUT" },
        400
      );
    }
    const pagination = parseRoutePagination(url.searchParams);
    const page = await fetchTournamentDivisionsPage(
      tournamentId,
      pagination,
      deps?.clientConfig
    );
    return catalogJson(page, 200);
  } catch (error) {
    return catalogErrorResponse(error);
  }
}

export async function handleScoreboardCatalogTeams(
  request: Request,
  deps?: CatalogRouteDeps
): Promise<Response> {
  if (request.method !== "GET") {
    return catalogMethodNotAllowed("GET");
  }

  const auth = await requireCatalogAdmin(deps?.authProvider);
  if (auth instanceof Response) return auth;

  try {
    const url = new URL(request.url);
    const tournamentId = url.searchParams.get("tournamentId") ?? "";
    const divisionId = url.searchParams.get("divisionId") ?? "";
    if (!isValidCatalogUuid(tournamentId) || !isValidCatalogUuid(divisionId)) {
      return catalogJson(
        {
          error: "Select valid tournament and division IDs.",
          code: "INVALID_INPUT",
        },
        400
      );
    }
    const pagination = parseRoutePagination(url.searchParams);
    const page = await fetchEligibleTeamsPage(
      tournamentId,
      divisionId,
      pagination,
      deps?.clientConfig
    );
    return catalogJson(page, 200);
  } catch (error) {
    return catalogErrorResponse(error);
  }
}

export async function handleScoreboardValidateMatchup(
  request: Request,
  deps?: CatalogRouteDeps
): Promise<Response> {
  if (request.method !== "POST") {
    return catalogMethodNotAllowed("POST");
  }

  if (!sameCatalogOrigin(request)) {
    return catalogJson(
      { error: "Invalid request origin.", code: "FORBIDDEN" },
      403
    );
  }

  const auth = await requireCatalogAdmin(deps?.authProvider);
  if (auth instanceof Response) return auth;

  if (Number(request.headers.get("content-length") ?? "0") > 4096) {
    return catalogJson(
      { error: "Request too large.", code: "PAYLOAD_TOO_LARGE" },
      413
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return catalogJson(
      { error: "Invalid JSON.", code: "INVALID_INPUT" },
      400
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return catalogJson(
      { error: "Invalid matchup settings.", code: "INVALID_INPUT" },
      400
    );
  }

  const input = body as Record<string, unknown>;
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
  const bestOf = input.bestOf;
  const serving = input.serving;

  if (
    !isValidCatalogUuid(tournamentId) ||
    !isValidCatalogUuid(divisionId) ||
    !isValidCatalogUuid(registrationAId) ||
    !isValidCatalogUuid(registrationBId) ||
    registrationAId.toLowerCase() === registrationBId.toLowerCase() ||
    (bestOf !== 3 && bestOf !== 5) ||
    (serving !== "A" && serving !== "B")
  ) {
    return catalogJson(
      {
        error:
          "Select an eligible tournament, division, two distinct teams, match format, and first serving team.",
        code: "INVALID_INPUT",
      },
      400
    );
  }

  try {
    const matchup = await validateMatchupWithMva(
      {
        tournamentId,
        divisionId,
        registrationAId,
        registrationBId,
      },
      deps?.clientConfig
    );

    return catalogJson(
      {
        matchup,
        bestOf,
        serving,
        officialPersistenceEnabled: false,
        persistenceNotice:
          "Official matchup verified with MVA. Official match persistence is gated pending separate database migration review and approval.",
      },
      200
    );
  } catch (error) {
    return catalogErrorResponse(error);
  }
}
