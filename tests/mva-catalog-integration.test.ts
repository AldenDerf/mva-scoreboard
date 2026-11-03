import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateScoreboardAuthorization as getScoreboardAuthorization,
  type ScoreboardAuthorization,
} from "../lib/auth/evaluate-authorization.ts";
import type { CreateOfficialMatchInput } from "../lib/db/scoreboard.ts";
import {
  fetchEligibleTeamsPage,
  fetchEligibleTournamentsPage,
  fetchTournamentDivisionsPage,
  MvaCatalogClientError,
  sanitizeCatalogLogoUrl,
  validateMatchupWithMva,
  verifyMvaAdminStatus,
  type MvaCatalogClientConfig,
} from "../lib/integrations/mva-catalog-client.ts";
import {
  canSubmitOfficialMatchSetup,
  createInitialMatchSetupState,
  filterSelectableTeams,
  getTeamInitials,
  selectDivisionState,
  selectTeamAState,
  selectTeamBState,
  selectTournamentState,
} from "../lib/integrations/match-setup-state.ts";
import {
  handleScoreboardCatalogDivisions,
  handleScoreboardCatalogTeams,
  handleScoreboardCatalogTournaments,
  handleScoreboardValidateMatchup,
} from "../lib/server/catalog-api.ts";
import { handleCreateMatchRequest } from "../lib/server/scoreboard-api.ts";

const MACHINE_TOKEN = "scoreboard-to-mva-machine-secret-token-2026";
const BASE_URL = "https://mva.example.org";
const ALLOWED_LOGO_HOSTS = new Set(["project-ref.supabase.co"]);

const TOURNAMENT_ID = "11111111-1111-4111-8111-111111111111";
const TOURNAMENT_2_ID = "22222222-2222-4222-8222-222222222222";
const DIVISION_ID = "aaaa1111-1111-4111-8111-111111111111";
const DIVISION_2_ID = "aaaa2222-2222-4222-8222-222222222222";
const REG_A_ID = "cccc1111-1111-4111-8111-111111111111";
const REG_B_ID = "cccc2222-2222-4222-8222-222222222222";
const TEAM_A_ID = "dddd1111-1111-4111-8111-111111111111";
const TEAM_B_ID = "dddd2222-2222-4222-8222-222222222222";

const adminAuth: ScoreboardAuthorization = {
  isAuthenticated: true,
  isAuthorized: true,
  status: "AUTHORIZED",
  userId: "99999999-9999-4999-8999-999999999999",
  email: "admin@mva.example.org",
  role: "ADMIN",
};

const scorekeeperAuth: ScoreboardAuthorization = {
  isAuthenticated: true,
  isAuthorized: true,
  status: "AUTHORIZED",
  userId: "88888888-8888-4888-8888-888888888888",
  email: "scorer@mva.example.org",
  role: "SCOREKEEPER",
};

function makeClientConfig(
  handler: (url: URL, init?: RequestInit) => Response | Promise<Response>
): MvaCatalogClientConfig {
  return {
    baseUrl: BASE_URL,
    token: MACHINE_TOKEN,
    timeoutMs: 1000,
    allowedLogoHosts: ALLOWED_LOGO_HOSTS,
    fetchImpl: async (input, init) => {
      const url = new URL(String(input));
      return handler(url, init);
    },
  };
}

test("catalog client sends machine Bearer credential, no-store cache, and validates tournaments, divisions, and VERIFIED teams", async () => {
  let capturedAuthHeader: string | null = null;
  let capturedCache: RequestCache | undefined;

  const config = makeClientConfig((url, init) => {
    const headers = new Headers(init?.headers);
    capturedAuthHeader = headers.get("authorization");
    capturedCache = init?.cache;

    if (url.pathname === "/api/integrations/scoreboard/tournaments") {
      return Response.json({
        items: [
          {
            id: TOURNAMENT_ID,
            name: "MVA Provincial Cup",
            year: 2026,
            status: "ONGOING",
          },
        ],
        nextCursor: null,
      });
    }

    if (url.pathname === "/api/integrations/scoreboard/divisions") {
      return Response.json({
        items: [
          {
            id: DIVISION_ID,
            tournamentId: TOURNAMENT_ID,
            name: "Men's Open",
          },
        ],
        nextCursor: null,
      });
    }

    if (url.pathname === "/api/integrations/scoreboard/teams") {
      return Response.json({
        items: [
          {
            registrationId: REG_A_ID,
            teamId: TEAM_A_ID,
            name: "Mahatao Waves",
            logoUrl:
              "https://project-ref.supabase.co/storage/v1/object/public/logos/waves.png",
          },
          {
            registrationId: REG_B_ID,
            teamId: TEAM_B_ID,
            name: "San Carlos Spikers",
            logoUrl: "https://unapproved.example.com/logo.png",
          },
        ],
        nextCursor: null,
      });
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  });

  const tournaments = await fetchEligibleTournamentsPage(undefined, config);
  assert.equal(capturedAuthHeader, `Bearer ${MACHINE_TOKEN}`);
  assert.equal(capturedCache, "no-store");
  assert.equal(tournaments.items.length, 1);
  assert.equal(tournaments.items[0].id, TOURNAMENT_ID);

  const divisions = await fetchTournamentDivisionsPage(
    TOURNAMENT_ID,
    undefined,
    config
  );
  assert.equal(divisions.items.length, 1);
  assert.equal(divisions.items[0].tournamentId, TOURNAMENT_ID);

  const teams = await fetchEligibleTeamsPage(
    TOURNAMENT_ID,
    DIVISION_ID,
    undefined,
    config
  );
  assert.equal(teams.items.length, 2);
  assert.equal(
    teams.items[0].logoUrl,
    "https://project-ref.supabase.co/storage/v1/object/public/logos/waves.png"
  );
  // Unapproved logo host is stripped to null
  assert.equal(teams.items[1].logoUrl, null);
});

test("catalog client rejects invalid UUIDs, ineligible tournament statuses, cross-tournament divisions, and leaked private fields", async () => {
  let networkCalled = false;
  const config = makeClientConfig(() => {
    networkCalled = true;
    return Response.json({ items: [], nextCursor: null });
  });

  // 1. Invalid UUID rejected before network request
  await assert.rejects(
    () => fetchTournamentDivisionsPage("not-a-uuid", undefined, config),
    (err: unknown) =>
      err instanceof MvaCatalogClientError && err.code === "INVALID_INPUT"
  );
  assert.equal(networkCalled, false);

  // 2. Upstream returning ineligible tournament status (DRAFT) is rejected by client
  const draftConfig = makeClientConfig(() =>
    Response.json({
      items: [
        {
          id: TOURNAMENT_ID,
          name: "Draft Tournament",
          year: 2026,
          status: "DRAFT",
        },
      ],
      nextCursor: null,
    })
  );
  await assert.rejects(
    () => fetchEligibleTournamentsPage(undefined, draftConfig),
    (err: unknown) =>
      err instanceof MvaCatalogClientError && err.code === "INVALID_RESPONSE"
  );

  // 3. Upstream returning division from another tournament is rejected
  const crossDivConfig = makeClientConfig(() =>
    Response.json({
      items: [
        {
          id: DIVISION_ID,
          tournamentId: TOURNAMENT_2_ID,
          name: "Wrong Tournament Division",
        },
      ],
      nextCursor: null,
    })
  );
  await assert.rejects(
    () => fetchTournamentDivisionsPage(TOURNAMENT_ID, undefined, crossDivConfig),
    (err: unknown) =>
      err instanceof MvaCatalogClientError && err.code === "INVALID_RESPONSE"
  );

  // 4. Upstream leaking private registrant/payment fields is rejected fail-closed
  const leakyConfig = makeClientConfig(() =>
    Response.json({
      items: [
        {
          registrationId: REG_A_ID,
          teamId: TEAM_A_ID,
          name: "Mahatao Waves",
          logoUrl: null,
          registrant_contact: "09171234567",
        },
      ],
      nextCursor: null,
    })
  );
  await assert.rejects(
    () => fetchEligibleTeamsPage(TOURNAMENT_ID, DIVISION_ID, undefined, leakyConfig),
    (err: unknown) =>
      err instanceof MvaCatalogClientError && err.code === "INVALID_RESPONSE"
  );
});

test("catalog client handles machine credential rejection, upstream outage, timeout, and changed eligibility", async () => {
  // 1. Machine credential rejected (401) -> safe error without leaking token
  const unauthConfig = makeClientConfig(() =>
    Response.json({ error: "Unauthorized" }, { status: 401 })
  );
  await assert.rejects(
    () => fetchEligibleTournamentsPage(undefined, unauthConfig),
    (err: unknown) =>
      err instanceof MvaCatalogClientError &&
      err.code === "UNAUTHORIZED" &&
      err.httpStatus === 503 &&
      !err.message.includes(MACHINE_TOKEN)
  );

  // 2. Upstream outage (network throw) -> 503 UPSTREAM_UNAVAILABLE
  const outageConfig = makeClientConfig(() => {
    throw new Error("ECONNREFUSED 127.0.0.1:3000");
  });
  await assert.rejects(
    () => fetchEligibleTournamentsPage(undefined, outageConfig),
    (err: unknown) =>
      err instanceof MvaCatalogClientError &&
      err.code === "UPSTREAM_UNAVAILABLE" &&
      err.httpStatus === 503 &&
      !err.message.includes("127.0.0.1")
  );

  // 3. Changed registration eligibility during validateMatchup (409) -> INELIGIBLE
  const changedEligibilityConfig = makeClientConfig(() =>
    Response.json(
      {
        error: "Both team registrations must have VERIFIED status to be eligible.",
        code: "UNVERIFIED_REGISTRATION",
      },
      { status: 409 }
    )
  );
  await assert.rejects(
    () =>
      validateMatchupWithMva(
        {
          tournamentId: TOURNAMENT_ID,
          divisionId: DIVISION_ID,
          registrationAId: REG_A_ID,
          registrationBId: REG_B_ID,
        },
        changedEligibilityConfig
      ),
    (err: unknown) =>
      err instanceof MvaCatalogClientError &&
      err.code === "INELIGIBLE" &&
      err.httpStatus === 409
  );
});

test("scoreboard catalog route handlers enforce scoreboard ADMIN authorization, CSRF origin, and strict HTTP methods", async () => {
  const validUpstreamConfig = makeClientConfig((url) => {
    if (url.pathname === "/api/integrations/scoreboard/validate-matchup") {
      return Response.json({
        tournament: {
          id: TOURNAMENT_ID,
          name: "MVA Provincial Cup",
          year: 2026,
          status: "ONGOING",
        },
        division: {
          id: DIVISION_ID,
          tournamentId: TOURNAMENT_ID,
          name: "Men's Open",
        },
        teamA: {
          registrationId: REG_A_ID,
          teamId: TEAM_A_ID,
          name: "Mahatao Waves",
          logoUrl: null,
        },
        teamB: {
          registrationId: REG_B_ID,
          teamId: TEAM_B_ID,
          name: "San Carlos Spikers",
          logoUrl: null,
        },
        validatedAt: "2026-11-02T06:00:00.000Z",
      });
    }
    return Response.json({ items: [], nextCursor: null });
  });

  // 1. Unauthenticated caller -> 401
  const unauthRes = await handleScoreboardCatalogTournaments(
    new Request("http://localhost:3001/api/catalog/tournaments"),
    {
      authProvider: async () =>
        Response.json({ error: "Sign in required." }, { status: 401 }),
      clientConfig: validUpstreamConfig,
    }
  );
  assert.equal(unauthRes.status, 401);

  // 2. SCOREKEEPER role (or MVA admin without scoreboard ADMIN grant) -> 403
  const scorekeeperRes = await handleScoreboardCatalogTournaments(
    new Request("http://localhost:3001/api/catalog/tournaments"),
    {
      authProvider: async () => scorekeeperAuth,
      clientConfig: validUpstreamConfig,
    }
  );
  assert.equal(scorekeeperRes.status, 403);

  // 3. Unsupported HTTP method -> 405
  const wrongMethodRes = await handleScoreboardCatalogDivisions(
    new Request("http://localhost:3001/api/catalog/divisions", {
      method: "POST",
    }),
    {
      authProvider: async () => adminAuth,
      clientConfig: validUpstreamConfig,
    }
  );
  assert.equal(wrongMethodRes.status, 405);

  const wrongTeamsMethodRes = await handleScoreboardCatalogTeams(
    new Request("http://localhost:3001/api/catalog/teams", {
      method: "DELETE",
    }),
    {
      authProvider: async () => adminAuth,
      clientConfig: validUpstreamConfig,
    }
  );
  assert.equal(wrongTeamsMethodRes.status, 405);

  // 4. Cross-origin POST to validate-matchup -> 403
  const crossOriginPost = await handleScoreboardValidateMatchup(
    new Request("http://localhost:3001/api/catalog/validate-matchup", {
      method: "POST",
      headers: {
        host: "localhost:3001",
        origin: "https://evil.example.com",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tournamentId: TOURNAMENT_ID,
        divisionId: DIVISION_ID,
        registrationAId: REG_A_ID,
        registrationBId: REG_B_ID,
        bestOf: 3,
        serving: "A",
      }),
    }),
    {
      authProvider: async () => adminAuth,
      clientConfig: validUpstreamConfig,
    }
  );
  assert.equal(crossOriginPost.status, 403);

  // 5. Authorized ADMIN same-origin validate-matchup -> 200 with officialPersistenceEnabled: true
  const validPost = await handleScoreboardValidateMatchup(
    new Request("http://localhost:3001/api/catalog/validate-matchup", {
      method: "POST",
      headers: {
        host: "localhost:3001",
        origin: "http://localhost:3001",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tournamentId: TOURNAMENT_ID,
        divisionId: DIVISION_ID,
        registrationAId: REG_A_ID,
        registrationBId: REG_B_ID,
        bestOf: 3,
        serving: "A",
      }),
    }),
    {
      authProvider: async () => adminAuth,
      clientConfig: validUpstreamConfig,
    }
  );
  assert.equal(validPost.status, 200);
  const body = (await validPost.json()) as {
    officialPersistenceEnabled: boolean;
    matchup: { teamA: { name: string }; teamB: { name: string } };
  };
  assert.equal(body.officialPersistenceEnabled, true);
  assert.equal(body.matchup.teamA.name, "Mahatao Waves");
  assert.equal(body.matchup.teamB.name, "San Carlos Spikers");
});

test("dependent selector state resets downstream selections, prevents identical teams, and blocks duplicate submissions", () => {
  let state = createInitialMatchSetupState();
  state = {
    ...state,
    tournamentsStatus: "ready",
    tournaments: [
      {
        id: TOURNAMENT_ID,
        name: "MVA Provincial Cup",
        year: 2026,
        status: "ONGOING",
      },
      {
        id: TOURNAMENT_2_ID,
        name: "MVA Fiesta Cup",
        year: 2026,
        status: "REGISTRATION_CLOSED",
      },
    ],
  };

  // 1. Select tournament -> sets divisionsStatus to loading
  state = selectTournamentState(state, TOURNAMENT_ID);
  assert.equal(state.tournamentId, TOURNAMENT_ID);
  assert.equal(state.divisionsStatus, "loading");

  state = {
    ...state,
    divisionsStatus: "ready",
    divisions: [
      { id: DIVISION_ID, tournamentId: TOURNAMENT_ID, name: "Men's Open" },
      { id: DIVISION_2_ID, tournamentId: TOURNAMENT_ID, name: "Women's Open" },
    ],
  };

  // 2. Select division -> sets teamsStatus to loading
  state = selectDivisionState(state, DIVISION_ID);
  assert.equal(state.divisionId, DIVISION_ID);
  assert.equal(state.teamsStatus, "loading");

  state = {
    ...state,
    teamsStatus: "ready",
    teams: [
      {
        registrationId: REG_A_ID,
        teamId: TEAM_A_ID,
        name: "Mahatao Waves",
        logoUrl: null,
      },
      {
        registrationId: REG_B_ID,
        teamId: TEAM_B_ID,
        name: "San Carlos Spikers",
        logoUrl: null,
      },
    ],
  };

  // 3. Select Team A and Team B
  state = selectTeamAState(state, REG_A_ID);
  assert.equal(state.registrationAId, REG_A_ID);

  // Team B options must exclude Team A
  const teamBOptions = filterSelectableTeams(state.teams, state.registrationAId);
  assert.equal(teamBOptions.length, 1);
  assert.equal(teamBOptions[0].registrationId, REG_B_ID);

  // Attempting to select Team A as Team B is rejected
  const duplicateAttempt = selectTeamBState(state, REG_A_ID);
  assert.equal(duplicateAttempt.registrationBId, "");
  assert.equal(duplicateAttempt.validationStatus, "error");

  // Selecting distinct Team B succeeds
  state = selectTeamBState(state, REG_B_ID);
  assert.equal(state.registrationBId, REG_B_ID);
  assert.equal(canSubmitOfficialMatchSetup(state), true);

  // Duplicate submission blocked while validating
  assert.equal(
    canSubmitOfficialMatchSetup({ ...state, validationStatus: "validating" }),
    false
  );

  // 4. Changing division resets Team A, Team B, and validation state
  const afterDivisionChange = selectDivisionState(state, DIVISION_2_ID);
  assert.equal(afterDivisionChange.divisionId, DIVISION_2_ID);
  assert.equal(afterDivisionChange.registrationAId, "");
  assert.equal(afterDivisionChange.registrationBId, "");
  assert.equal(afterDivisionChange.teams.length, 0);
  assert.equal(canSubmitOfficialMatchSetup(afterDivisionChange), false);

  // 5. Changing tournament resets division, Team A, Team B, and validation state
  const afterTournamentChange = selectTournamentState(state, TOURNAMENT_2_ID);
  assert.equal(afterTournamentChange.tournamentId, TOURNAMENT_2_ID);
  assert.equal(afterTournamentChange.divisionId, "");
  assert.equal(afterTournamentChange.registrationAId, "");
  assert.equal(afterTournamentChange.registrationBId, "");
  assert.equal(afterTournamentChange.divisions.length, 0);
  assert.equal(afterTournamentChange.teams.length, 0);
});

test("logo sanitization and initials fallback handle missing and invalid logos safely", () => {
  assert.equal(
    sanitizeCatalogLogoUrl(
      "https://project-ref.supabase.co/storage/v1/object/public/logos/team.png",
      ALLOWED_LOGO_HOSTS
    ),
    "https://project-ref.supabase.co/storage/v1/object/public/logos/team.png"
  );
  assert.equal(
    sanitizeCatalogLogoUrl("http://project-ref.supabase.co/team.png", ALLOWED_LOGO_HOSTS),
    null
  );
  assert.equal(
    sanitizeCatalogLogoUrl("https://evil.example.com/team.png", ALLOWED_LOGO_HOSTS),
    null
  );
  assert.equal(sanitizeCatalogLogoUrl(null, ALLOWED_LOGO_HOSTS), null);

  assert.equal(getTeamInitials("Mahatao Waves"), "MW");
  assert.equal(getTeamInitials("Spikers"), "SP");
  assert.equal(getTeamInitials("   "), "MV");
});

test("MVA ADMIN inheritance verifies active status, preserves independent roles on revocation, and fails closed on outage", async () => {
  const USER_UUID = "99999999-9999-4999-8999-999999999999";

  // 1. verifyMvaAdminStatus validates response contract and rejects forged/mismatched UUID
  const validAdminConfig = makeClientConfig((url, init) => {
    assert.equal(url.pathname, "/api/integrations/scoreboard/verify-admin");
    assert.equal(init?.method, "POST");
    return Response.json({
      authUserId: USER_UUID,
      isActiveAdmin: true,
      verifiedAt: "2026-11-03T10:00:00.000Z",
    });
  });
  const verified = await verifyMvaAdminStatus(USER_UUID, validAdminConfig);
  assert.equal(verified.isActiveAdmin, true);

  const mismatchedUuidConfig = makeClientConfig(() =>
    Response.json({
      authUserId: "11111111-1111-4111-8111-111111111111",
      isActiveAdmin: true,
      verifiedAt: "2026-11-03T10:00:00.000Z",
    })
  );
  await assert.rejects(
    () => verifyMvaAdminStatus(USER_UUID, mismatchedUuidConfig),
    (err: unknown) =>
      err instanceof MvaCatalogClientError && err.code === "INVALID_RESPONSE"
  );

  // 2. Active MVA ADMIN automatically receives Scoreboard ADMIN via reconciliation
  let reconciledArg: { userId: string; isActiveMvaAdmin: boolean } | null = null;
  const activeAuth = await getScoreboardAuthorization({
    getAuthenticatedUser: async () => ({ id: USER_UUID, email: "admin@mva.example.org" }),
    isDatabaseConfigured: () => true,
    isMvaIntegrationConfigured: () => true,
    verifyMvaAdmin: async (id) => ({ isActiveAdmin: id === USER_UUID }),
    reconcileMvaAdminRole: async (userId, isActiveMvaAdmin) => {
      reconciledArg = { userId, isActiveMvaAdmin };
      return isActiveMvaAdmin ? "ADMIN" : null;
    },
  });
  assert.equal(activeAuth.status, "AUTHORIZED");
  assert.equal(activeAuth.role, "ADMIN");
  assert.deepEqual(reconciledArg, { userId: USER_UUID, isActiveMvaAdmin: true });

  // 3. Revoked MVA ADMIN with independent SCOREKEEPER role retains SCOREKEEPER
  const preservedScorekeeper = await getScoreboardAuthorization({
    getAuthenticatedUser: async () => ({ id: USER_UUID, email: "scorer@mva.example.org" }),
    isDatabaseConfigured: () => true,
    isMvaIntegrationConfigured: () => true,
    verifyMvaAdmin: async () => ({ isActiveAdmin: false }),
    reconcileMvaAdminRole: async (_userId, isActiveMvaAdmin) => {
      assert.equal(isActiveMvaAdmin, false);
      return "SCOREKEEPER";
    },
  });
  assert.equal(preservedScorekeeper.status, "AUTHORIZED");
  assert.equal(preservedScorekeeper.role, "SCOREKEEPER");

  // 4. Revoked MVA ADMIN without independent Scoreboard grant loses access (ACCESS_PENDING)
  const revokedAuth = await getScoreboardAuthorization({
    getAuthenticatedUser: async () => ({ id: USER_UUID, email: "former@mva.example.org" }),
    isDatabaseConfigured: () => true,
    isMvaIntegrationConfigured: () => true,
    verifyMvaAdmin: async () => ({ isActiveAdmin: false }),
    reconcileMvaAdminRole: async () => null,
  });
  assert.equal(revokedAuth.isAuthorized, false);
  assert.equal(revokedAuth.status, "ACCESS_PENDING");
  assert.equal(revokedAuth.role, null);

  // 5. MVA verification outage fails closed (UNAVAILABLE)
  const outageAuth = await getScoreboardAuthorization({
    getAuthenticatedUser: async () => ({ id: USER_UUID, email: "admin@mva.example.org" }),
    isDatabaseConfigured: () => true,
    isMvaIntegrationConfigured: () => true,
    verifyMvaAdmin: async () => {
      throw new MvaCatalogClientError(
        "UPSTREAM_UNAVAILABLE",
        "MVA catalog service is currently unreachable.",
        503
      );
    },
    reconcileMvaAdminRole: async () => "ADMIN",
  });
  assert.equal(outageAuth.isAuthorized, false);
  assert.equal(outageAuth.status, "UNAVAILABLE");
  assert.equal(outageAuth.role, null);
});

test("POST /api/matches revalidates official matchup with MVA, snapshots authoritative data, and preserves test match creation", async () => {
  let capturedOfficialInput: CreateOfficialMatchInput | null = null;
  let capturedActor: string | null = null;

  const validUpstreamConfig = makeClientConfig((url) => {
    if (url.pathname === "/api/integrations/scoreboard/validate-matchup") {
      return Response.json({
        tournament: {
          id: TOURNAMENT_ID,
          name: "MVA Provincial Cup 2026",
          year: 2026,
          status: "ONGOING",
        },
        division: {
          id: DIVISION_ID,
          tournamentId: TOURNAMENT_ID,
          name: "Men's Open",
        },
        teamA: {
          registrationId: REG_A_ID,
          teamId: TEAM_A_ID,
          name: "Mahatao Waves",
          logoUrl:
            "https://project-ref.supabase.co/storage/v1/object/public/logos/waves.png",
        },
        teamB: {
          registrationId: REG_B_ID,
          teamId: TEAM_B_ID,
          name: "San Carlos Spikers",
          logoUrl: null,
        },
        validatedAt: "2026-11-03T10:00:00.000Z",
      });
    }
    return Response.json({ error: "Not found" }, { status: 404 });
  });

  // 1. Official match creation revalidates with MVA and ignores forged client team names/logos
  const officialRes = await handleCreateMatchRequest(
    new Request("http://localhost:3001/api/matches", {
      method: "POST",
      headers: {
        host: "localhost:3001",
        origin: "http://localhost:3001",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "official",
        tournamentId: TOURNAMENT_ID,
        divisionId: DIVISION_ID,
        registrationAId: REG_A_ID,
        registrationBId: REG_B_ID,
        teamAName: "Forged Client Team A",
        teamALogoUrl: "https://evil.example.org/forged.png",
        bestOf: 5,
        serving: "B",
      }),
    }),
    {
      authProvider: async () => adminAuth,
      clientConfig: validUpstreamConfig,
      createOfficialMatchFn: async (actor, input) => {
        capturedActor = actor;
        capturedOfficialInput = input;
        return "77777777-7777-4777-8777-777777777777";
      },
    }
  );
  assert.equal(officialRes.status, 201);
  const officialBody = (await officialRes.json()) as {
    id: string;
    matchup: { tournament: { name: string } };
  };
  assert.equal(officialBody.id, "77777777-7777-4777-8777-777777777777");
  assert.equal(capturedActor, adminAuth.userId);
  assert.deepEqual(capturedOfficialInput, {
    mvaTournamentId: TOURNAMENT_ID,
    mvaDivisionId: DIVISION_ID,
    mvaTeamAId: TEAM_A_ID,
    mvaTeamBId: TEAM_B_ID,
    mvaRegistrationAId: REG_A_ID,
    mvaRegistrationBId: REG_B_ID,
    tournamentName: "MVA Provincial Cup 2026",
    divisionName: "Men's Open",
    teamAName: "Mahatao Waves",
    teamBName: "San Carlos Spikers",
    teamALogoUrl:
      "https://project-ref.supabase.co/storage/v1/object/public/logos/waves.png",
    teamBLogoUrl: null,
    bestOf: 5,
    serving: "B",
  });

  // 2. SCOREKEEPER is denied official match creation (403)
  const scorekeeperRes = await handleCreateMatchRequest(
    new Request("http://localhost:3001/api/matches", {
      method: "POST",
      headers: {
        host: "localhost:3001",
        origin: "http://localhost:3001",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "official",
        tournamentId: TOURNAMENT_ID,
        divisionId: DIVISION_ID,
        registrationAId: REG_A_ID,
        registrationBId: REG_B_ID,
        bestOf: 3,
        serving: "A",
      }),
    }),
    {
      authProvider: async () => scorekeeperAuth,
      clientConfig: validUpstreamConfig,
    }
  );
  assert.equal(scorekeeperRes.status, 403);

  // 3. Test match creation continues to work alongside official match creation
  let capturedTestTeams: [string, string] | null = null;
  const testMatchRes = await handleCreateMatchRequest(
    new Request("http://localhost:3001/api/matches", {
      method: "POST",
      headers: {
        host: "localhost:3001",
        origin: "http://localhost:3001",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        teamA: "Practice North",
        teamB: "Practice South",
        bestOf: 3,
        serving: "A",
      }),
    }),
    {
      authProvider: async () => adminAuth,
      createTestMatchFn: async (_actor, teamA, teamB) => {
        capturedTestTeams = [teamA, teamB];
        return "66666666-6666-4666-8666-666666666666";
      },
    }
  );
  assert.equal(testMatchRes.status, 201);
  assert.deepEqual(capturedTestTeams, ["Practice North", "Practice South"]);
});
