import {
  ELIGIBLE_MVA_TOURNAMENT_STATUSES,
  type CatalogPage,
  type DivisionSummary,
  type EligibleMvaTournamentStatus,
  type EligibleTeam,
  type TournamentSummary,
  type ValidatedMatchup,
  type ValidateMatchupRequest,
  type VerifyAdminStatusResponse,
} from "../contracts/mva-catalog.ts";

/**
 * Server-only MVA Catalog Integration Client.
 *
 * Security & Correctness Guarantees:
 * - Rejects execution in browser environments.
 * - Validates all input UUIDs before issuing network calls.
 * - Uses explicit machine-to-machine `Authorization: Bearer <token>` header.
 * - Enforces request timeouts via AbortSignal.
 * - Disables caching (`cache: "no-store"`) so eligibility decisions are never stale.
 * - Bounds pagination limits (1..100) and maximum traversed pages.
 * - Validates every response payload at runtime, rejecting extra private fields,
 *   ineligible tournament statuses, cross-tournament/division mismatches, or duplicate teams.
 * - Validates team logo URLs against `https:` and an explicit host allowlist.
 * - Emits safe error messages without leaking credentials or internal URLs.
 */

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const DEFAULT_CATALOG_TIMEOUT_MS = 5000;
export const DEFAULT_CATALOG_PAGE_LIMIT = 50;
export const MAX_CATALOG_PAGE_LIMIT = 100;
export const MAX_CATALOG_PAGES = 5;
export const MAX_LOGO_URL_LENGTH = 2048;

const FORBIDDEN_PRIVATE_KEYS = new Set([
  "registrant_first_name",
  "registrant_middle_name",
  "registrant_last_name",
  "registrant_suffix",
  "registrant_contact",
  "registrant_email",
  "contact_number",
  "date_of_birth",
  "notes",
  "registration_code",
  "payments",
  "payment_allocations",
  "registration_players",
  "players",
  "roster",
  "admin_access",
  "admin_audit_logs",
  "profiles",
]);

export type MvaCatalogErrorCode =
  | "UNCONFIGURED"
  | "INVALID_INPUT"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "INELIGIBLE"
  | "UPSTREAM_UNAVAILABLE"
  | "INVALID_RESPONSE";

export class MvaCatalogClientError extends Error {
  readonly code: MvaCatalogErrorCode;
  readonly httpStatus: number;

  constructor(code: MvaCatalogErrorCode, message: string, httpStatus: number) {
    super(message);
    this.name = "MvaCatalogClientError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function isValidCatalogUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value.trim());
}

export function isEligibleTournamentStatus(
  value: unknown
): value is EligibleMvaTournamentStatus {
  return (
    typeof value === "string" &&
    (ELIGIBLE_MVA_TOURNAMENT_STATUSES as readonly string[]).includes(value)
  );
}

export function buildApprovedLogoHosts(
  rawAllowedHosts: string | undefined = process.env.MVA_LOGO_ALLOWED_HOSTS,
  supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL
): Set<string> {
  const hosts = new Set<string>();

  if (typeof rawAllowedHosts === "string") {
    for (const part of rawAllowedHosts.split(",")) {
      const normalized = part.trim().toLowerCase();
      if (normalized && !normalized.includes("/") && !normalized.includes(":")) {
        hosts.add(normalized);
      }
    }
  }

  if (typeof supabaseUrl === "string" && supabaseUrl.trim()) {
    try {
      const parsed = new URL(supabaseUrl.trim());
      const hostname = parsed.hostname.toLowerCase();
      if (
        parsed.protocol === "https:" &&
        hostname &&
        hostname !== "your-project.supabase.co"
      ) {
        hosts.add(hostname);
      }
    } catch {
      // Ignore malformed env value
    }
  }

  return hosts;
}

export function sanitizeCatalogLogoUrl(
  rawUrl: unknown,
  allowedHosts: ReadonlySet<string> = buildApprovedLogoHosts()
): string | null {
  if (rawUrl === null || rawUrl === undefined) return null;
  if (typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > MAX_LOGO_URL_LENGTH) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;
    const hostname = parsed.hostname.toLowerCase();
    if (!hostname || !allowedHosts.has(hostname)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export interface MvaCatalogClientConfig {
  baseUrl?: string;
  token?: string;
  timeoutMs?: number;
  allowedLogoHosts?: ReadonlySet<string>;
  fetchImpl?: typeof fetch;
}

function assertServerOnly() {
  if (typeof window !== "undefined") {
    throw new MvaCatalogClientError(
      "UNCONFIGURED",
      "MVA catalog client may only execute on the server.",
      500
    );
  }
}

function resolveValidatedConfig(config?: MvaCatalogClientConfig): {
  originUrl: URL;
  token: string;
  timeoutMs: number;
  allowedLogoHosts: ReadonlySet<string>;
  fetchImpl: typeof fetch;
} {
  assertServerOnly();

  const rawBaseUrl = (
    config?.baseUrl ??
    process.env.MVA_CATALOG_BASE_URL ??
    ""
  ).trim();
  const rawToken = (
    config?.token ??
    process.env.MVA_SCOREBOARD_INTEGRATION_TOKEN ??
    ""
  ).trim();

  if (!rawBaseUrl || rawToken.length < 16) {
    throw new MvaCatalogClientError(
      "UNCONFIGURED",
      "MVA catalog integration is not configured on this server.",
      503
    );
  }

  let parsedBase: URL;
  try {
    parsedBase = new URL(rawBaseUrl);
  } catch {
    throw new MvaCatalogClientError(
      "UNCONFIGURED",
      "MVA catalog base URL configuration is invalid.",
      503
    );
  }

  const isLocalhost = ["localhost", "127.0.0.1", "[::1]"].includes(
    parsedBase.hostname.toLowerCase()
  );
  if (
    parsedBase.username ||
    parsedBase.password ||
    parsedBase.search ||
    parsedBase.hash ||
    (parsedBase.protocol !== "https:" &&
      !(parsedBase.protocol === "http:" && isLocalhost))
  ) {
    throw new MvaCatalogClientError(
      "UNCONFIGURED",
      "MVA catalog base URL must use HTTPS (or localhost HTTP in development) without credentials.",
      503
    );
  }

  const timeoutMs =
    typeof config?.timeoutMs === "number" &&
    Number.isFinite(config.timeoutMs) &&
    config.timeoutMs >= 250 &&
    config.timeoutMs <= 30_000
      ? config.timeoutMs
      : DEFAULT_CATALOG_TIMEOUT_MS;

  return {
    originUrl: new URL(parsedBase.origin),
    token: rawToken,
    timeoutMs,
    allowedLogoHosts: config?.allowedLogoHosts ?? buildApprovedLogoHosts(),
    fetchImpl: config?.fetchImpl ?? fetch,
  };
}

function assertNoForbiddenKeys(record: Record<string, unknown>): void {
  for (const key of Object.keys(record)) {
    if (FORBIDDEN_PRIVATE_KEYS.has(key)) {
      throw new MvaCatalogClientError(
        "INVALID_RESPONSE",
        "Upstream catalog response contained disallowed fields.",
        502
      );
    }
  }
}

function parseTournamentSummary(value: unknown): TournamentSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MvaCatalogClientError(
      "INVALID_RESPONSE",
      "Invalid tournament record from MVA catalog.",
      502
    );
  }
  const item = value as Record<string, unknown>;
  assertNoForbiddenKeys(item);

  const id = typeof item.id === "string" ? item.id.trim() : "";
  const name = typeof item.name === "string" ? item.name.trim() : "";
  const year = item.year;
  const status = item.status;

  if (
    !isValidCatalogUuid(id) ||
    !name ||
    name.length > 150 ||
    (year !== null &&
      (typeof year !== "number" ||
        !Number.isInteger(year) ||
        year < 1900 ||
        year > 2100)) ||
    !isEligibleTournamentStatus(status)
  ) {
    throw new MvaCatalogClientError(
      "INVALID_RESPONSE",
      "Tournament record failed contract validation.",
      502
    );
  }

  return {
    id,
    name,
    year,
    status,
  };
}

function parseDivisionSummary(
  value: unknown,
  expectedTournamentId: string
): DivisionSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MvaCatalogClientError(
      "INVALID_RESPONSE",
      "Invalid division record from MVA catalog.",
      502
    );
  }
  const item = value as Record<string, unknown>;
  assertNoForbiddenKeys(item);

  const id = typeof item.id === "string" ? item.id.trim() : "";
  const tournamentId =
    typeof item.tournamentId === "string" ? item.tournamentId.trim() : "";
  const name = typeof item.name === "string" ? item.name.trim() : "";

  if (
    !isValidCatalogUuid(id) ||
    !isValidCatalogUuid(tournamentId) ||
    tournamentId.toLowerCase() !== expectedTournamentId.toLowerCase() ||
    !name ||
    name.length > 100
  ) {
    throw new MvaCatalogClientError(
      "INVALID_RESPONSE",
      "Division record failed contract validation.",
      502
    );
  }

  return {
    id,
    tournamentId,
    name,
  };
}

function parseEligibleTeam(
  value: unknown,
  allowedLogoHosts: ReadonlySet<string>
): EligibleTeam {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MvaCatalogClientError(
      "INVALID_RESPONSE",
      "Invalid team record from MVA catalog.",
      502
    );
  }
  const item = value as Record<string, unknown>;
  assertNoForbiddenKeys(item);

  const registrationId =
    typeof item.registrationId === "string" ? item.registrationId.trim() : "";
  const teamId = typeof item.teamId === "string" ? item.teamId.trim() : "";
  const name = typeof item.name === "string" ? item.name.trim() : "";

  if (
    !isValidCatalogUuid(registrationId) ||
    !isValidCatalogUuid(teamId) ||
    !name ||
    name.length > 150 ||
    (item.logoUrl !== null &&
      item.logoUrl !== undefined &&
      typeof item.logoUrl !== "string")
  ) {
    throw new MvaCatalogClientError(
      "INVALID_RESPONSE",
      "Eligible team record failed contract validation.",
      502
    );
  }

  return {
    registrationId,
    teamId,
    name,
    logoUrl: sanitizeCatalogLogoUrl(item.logoUrl, allowedLogoHosts),
  };
}

function parseCatalogPage<T>(
  raw: unknown,
  parseItem: (item: unknown) => T
): CatalogPage<T> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new MvaCatalogClientError(
      "INVALID_RESPONSE",
      "Invalid paginated response from MVA catalog.",
      502
    );
  }
  const obj = raw as Record<string, unknown>;
  assertNoForbiddenKeys(obj);

  if (!Array.isArray(obj.items) || obj.items.length > MAX_CATALOG_PAGE_LIMIT) {
    throw new MvaCatalogClientError(
      "INVALID_RESPONSE",
      "Catalog page items array is invalid or exceeds bounded page size.",
      502
    );
  }

  let nextCursor: string | null = null;
  if (obj.nextCursor !== null && obj.nextCursor !== undefined) {
    if (!isValidCatalogUuid(obj.nextCursor)) {
      throw new MvaCatalogClientError(
        "INVALID_RESPONSE",
        "Catalog page nextCursor must be a valid UUID or null.",
        502
      );
    }
    nextCursor = obj.nextCursor.trim();
  }

  const items = obj.items.map(parseItem);
  return { items, nextCursor };
}

function normalizeLimit(limit?: number): number {
  if (limit === undefined) return DEFAULT_CATALOG_PAGE_LIMIT;
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_CATALOG_PAGE_LIMIT
  ) {
    throw new MvaCatalogClientError(
      "INVALID_INPUT",
      "Catalog pagination limit must be between 1 and 100.",
      400
    );
  }
  return limit;
}

function normalizeCursor(cursor?: string | null): string | null {
  if (cursor === undefined || cursor === null || cursor === "") return null;
  if (!isValidCatalogUuid(cursor)) {
    throw new MvaCatalogClientError(
      "INVALID_INPUT",
      "Catalog pagination cursor must be a valid UUID.",
      400
    );
  }
  return cursor.trim();
}

async function requestCatalogJson(
  pathAndQuery: string,
  init: { method: "GET" | "POST"; body?: string },
  config?: MvaCatalogClientConfig
): Promise<unknown> {
  const resolved = resolveValidatedConfig(config);
  const targetUrl = new URL(pathAndQuery, resolved.originUrl);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), resolved.timeoutMs);

  let response: Response;
  try {
    response = await resolved.fetchImpl(targetUrl.toString(), {
      method: init.method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${resolved.token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body,
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    const isAbort =
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError");
    throw new MvaCatalogClientError(
      "UPSTREAM_UNAVAILABLE",
      isAbort
        ? "MVA catalog request timed out. Please retry."
        : "MVA catalog service is currently unreachable.",
      503
    );
  } finally {
    clearTimeout(timer);
  }

  let parsedBody: unknown = null;
  try {
    parsedBody = await response.json();
  } catch {
    if (response.ok) {
      throw new MvaCatalogClientError(
        "INVALID_RESPONSE",
        "MVA catalog returned non-JSON content.",
        502
      );
    }
  }

  if (!response.ok) {
    const upstreamMessage =
      parsedBody &&
      typeof parsedBody === "object" &&
      "error" in parsedBody &&
      typeof (parsedBody as { error?: unknown }).error === "string"
        ? (parsedBody as { error: string }).error
        : null;

    if (response.status === 400) {
      throw new MvaCatalogClientError(
        "INVALID_INPUT",
        upstreamMessage ?? "Invalid catalog request parameters.",
        400
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new MvaCatalogClientError(
        "UNAUTHORIZED",
        "Scoreboard server was rejected by MVA catalog authentication.",
        503
      );
    }
    if (response.status === 404) {
      throw new MvaCatalogClientError(
        "NOT_FOUND",
        upstreamMessage ?? "Requested tournament or division was not found.",
        404
      );
    }
    if (response.status === 409) {
      throw new MvaCatalogClientError(
        "INELIGIBLE",
        upstreamMessage ??
          "Selected tournament, division, or team registration is no longer eligible.",
        409
      );
    }
    throw new MvaCatalogClientError(
      "UPSTREAM_UNAVAILABLE",
      "MVA catalog service is temporarily unavailable.",
      503
    );
  }

  return parsedBody;
}

export interface PaginationOptions {
  cursor?: string | null;
  limit?: number;
}

export async function fetchEligibleTournamentsPage(
  pagination?: PaginationOptions,
  config?: MvaCatalogClientConfig
): Promise<CatalogPage<TournamentSummary>> {
  const limit = normalizeLimit(pagination?.limit);
  const cursor = normalizeCursor(pagination?.cursor);

  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);

  const raw = await requestCatalogJson(
    `/api/integrations/scoreboard/tournaments?${params.toString()}`,
    { method: "GET" },
    config
  );

  const page = parseCatalogPage(raw, parseTournamentSummary);
  const seenIds = new Set<string>();
  for (const item of page.items) {
    const key = item.id.toLowerCase();
    if (seenIds.has(key)) {
      throw new MvaCatalogClientError(
        "INVALID_RESPONSE",
        "Duplicate tournament ID in MVA catalog response.",
        502
      );
    }
    seenIds.add(key);
  }

  return page;
}

export async function fetchTournamentDivisionsPage(
  tournamentId: string,
  pagination?: PaginationOptions,
  config?: MvaCatalogClientConfig
): Promise<CatalogPage<DivisionSummary>> {
  if (!isValidCatalogUuid(tournamentId)) {
    throw new MvaCatalogClientError(
      "INVALID_INPUT",
      "Select a valid tournament ID.",
      400
    );
  }
  const cleanTournamentId = tournamentId.trim();
  const limit = normalizeLimit(pagination?.limit);
  const cursor = normalizeCursor(pagination?.cursor);

  const params = new URLSearchParams({
    tournamentId: cleanTournamentId,
    limit: String(limit),
  });
  if (cursor) params.set("cursor", cursor);

  const raw = await requestCatalogJson(
    `/api/integrations/scoreboard/divisions?${params.toString()}`,
    { method: "GET" },
    config
  );

  const page = parseCatalogPage(raw, (item) =>
    parseDivisionSummary(item, cleanTournamentId)
  );
  const seenIds = new Set<string>();
  for (const item of page.items) {
    const key = item.id.toLowerCase();
    if (seenIds.has(key)) {
      throw new MvaCatalogClientError(
        "INVALID_RESPONSE",
        "Duplicate division ID in MVA catalog response.",
        502
      );
    }
    seenIds.add(key);
  }

  return page;
}

export async function fetchEligibleTeamsPage(
  tournamentId: string,
  divisionId: string,
  pagination?: PaginationOptions,
  config?: MvaCatalogClientConfig
): Promise<CatalogPage<EligibleTeam>> {
  if (!isValidCatalogUuid(tournamentId) || !isValidCatalogUuid(divisionId)) {
    throw new MvaCatalogClientError(
      "INVALID_INPUT",
      "Select valid tournament and division IDs.",
      400
    );
  }
  const cleanTournamentId = tournamentId.trim();
  const cleanDivisionId = divisionId.trim();
  const limit = normalizeLimit(pagination?.limit);
  const cursor = normalizeCursor(pagination?.cursor);

  const resolved = resolveValidatedConfig(config);
  const params = new URLSearchParams({
    tournamentId: cleanTournamentId,
    divisionId: cleanDivisionId,
    limit: String(limit),
  });
  if (cursor) params.set("cursor", cursor);

  const raw = await requestCatalogJson(
    `/api/integrations/scoreboard/teams?${params.toString()}`,
    { method: "GET" },
    config
  );

  const page = parseCatalogPage(raw, (item) =>
    parseEligibleTeam(item, resolved.allowedLogoHosts)
  );
  const seenRegs = new Set<string>();
  const seenTeams = new Set<string>();
  for (const item of page.items) {
    const regKey = item.registrationId.toLowerCase();
    const teamKey = item.teamId.toLowerCase();
    if (seenRegs.has(regKey) || seenTeams.has(teamKey)) {
      throw new MvaCatalogClientError(
        "INVALID_RESPONSE",
        "Duplicate team or registration ID in MVA catalog response.",
        502
      );
    }
    seenRegs.add(regKey);
    seenTeams.add(teamKey);
  }

  return page;
}

export async function validateMatchupWithMva(
  request: ValidateMatchupRequest,
  config?: MvaCatalogClientConfig
): Promise<ValidatedMatchup> {
  if (
    !request ||
    typeof request !== "object" ||
    !isValidCatalogUuid(request.tournamentId) ||
    !isValidCatalogUuid(request.divisionId) ||
    !isValidCatalogUuid(request.registrationAId) ||
    !isValidCatalogUuid(request.registrationBId)
  ) {
    throw new MvaCatalogClientError(
      "INVALID_INPUT",
      "Tournament, division, and both team registrations must be valid UUIDs.",
      400
    );
  }

  const cleanTournamentId = request.tournamentId.trim();
  const cleanDivisionId = request.divisionId.trim();
  const cleanRegAId = request.registrationAId.trim();
  const cleanRegBId = request.registrationBId.trim();

  if (cleanRegAId.toLowerCase() === cleanRegBId.toLowerCase()) {
    throw new MvaCatalogClientError(
      "INVALID_INPUT",
      "Team A and Team B must be two different teams.",
      400
    );
  }

  const resolved = resolveValidatedConfig(config);
  const raw = await requestCatalogJson(
    "/api/integrations/scoreboard/validate-matchup",
    {
      method: "POST",
      body: JSON.stringify({
        tournamentId: cleanTournamentId,
        divisionId: cleanDivisionId,
        registrationAId: cleanRegAId,
        registrationBId: cleanRegBId,
      }),
    },
    config
  );

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new MvaCatalogClientError(
      "INVALID_RESPONSE",
      "Invalid matchup validation response from MVA.",
      502
    );
  }

  const obj = raw as Record<string, unknown>;
  assertNoForbiddenKeys(obj);

  const tournament = parseTournamentSummary(obj.tournament);
  const division = parseDivisionSummary(obj.division, tournament.id);
  const teamA = parseEligibleTeam(obj.teamA, resolved.allowedLogoHosts);
  const teamB = parseEligibleTeam(obj.teamB, resolved.allowedLogoHosts);
  const validatedAt =
    typeof obj.validatedAt === "string" ? obj.validatedAt.trim() : "";

  if (
    tournament.id.toLowerCase() !== cleanTournamentId.toLowerCase() ||
    division.id.toLowerCase() !== cleanDivisionId.toLowerCase() ||
    teamA.registrationId.toLowerCase() !== cleanRegAId.toLowerCase() ||
    teamB.registrationId.toLowerCase() !== cleanRegBId.toLowerCase() ||
    teamA.registrationId.toLowerCase() === teamB.registrationId.toLowerCase() ||
    teamA.teamId.toLowerCase() === teamB.teamId.toLowerCase() ||
    !validatedAt ||
    Number.isNaN(Date.parse(validatedAt))
  ) {
    throw new MvaCatalogClientError(
      "INVALID_RESPONSE",
      "Validated matchup response did not match requested identities.",
      502
    );
  }

  return {
    tournament,
    division,
    teamA,
    teamB,
    validatedAt,
  };
}

export async function verifyMvaAdminStatus(
  authUserId: string,
  config?: MvaCatalogClientConfig
): Promise<VerifyAdminStatusResponse> {
  if (!isValidCatalogUuid(authUserId)) {
    throw new MvaCatalogClientError(
      "INVALID_INPUT",
      "A valid Supabase Auth UUID is required for MVA admin verification.",
      400
    );
  }

  const cleanAuthUserId = authUserId.trim();
  const raw = await requestCatalogJson(
    "/api/integrations/scoreboard/verify-admin",
    {
      method: "POST",
      body: JSON.stringify({ authUserId: cleanAuthUserId }),
    },
    config
  );

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new MvaCatalogClientError(
      "INVALID_RESPONSE",
      "Invalid admin verification response from MVA.",
      502
    );
  }

  const obj = raw as Record<string, unknown>;
  assertNoForbiddenKeys(obj);

  const keys = Object.keys(obj).sort().join(",");
  const returnedUserId =
    typeof obj.authUserId === "string" ? obj.authUserId.trim() : "";
  const isActiveAdmin = obj.isActiveAdmin;
  const verifiedAt =
    typeof obj.verifiedAt === "string" ? obj.verifiedAt.trim() : "";

  if (
    keys !== "authUserId,isActiveAdmin,verifiedAt" ||
    !isValidCatalogUuid(returnedUserId) ||
    returnedUserId.toLowerCase() !== cleanAuthUserId.toLowerCase() ||
    typeof isActiveAdmin !== "boolean" ||
    !verifiedAt ||
    Number.isNaN(Date.parse(verifiedAt))
  ) {
    throw new MvaCatalogClientError(
      "INVALID_RESPONSE",
      "MVA admin verification response failed contract validation.",
      502
    );
  }

  return {
    authUserId: returnedUserId,
    isActiveAdmin,
    verifiedAt,
  };
}
