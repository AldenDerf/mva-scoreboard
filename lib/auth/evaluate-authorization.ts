import {
  activeRoleForUser,
  isScoreboardDatabaseConfigured,
  reconcileMvaAdminRole,
} from "../db/scoreboard.ts";
import {
  verifyMvaAdminStatus,
  type MvaCatalogClientConfig,
} from "../integrations/mva-catalog-client.ts";

export type ScoreboardRole = "ADMIN" | "SCOREKEEPER";

export type AuthorizationStatus =
  | "UNAUTHENTICATED"
  | "ACCESS_PENDING"
  | "UNAVAILABLE"
  | "AUTHORIZED";

export interface ScoreboardAuthorization {
  isAuthenticated: boolean;
  isAuthorized: boolean;
  status: AuthorizationStatus;
  userId: string | null;
  email: string | null;
  role: ScoreboardRole | null;
  reason?: string;
}

export interface EvaluateScoreboardAuthDeps {
  getAuthenticatedUser: () => Promise<{ id: string; email?: string | null } | null>;
  isDatabaseConfigured?: () => boolean;
  isMvaIntegrationConfigured?: () => boolean;
  verifyMvaAdmin?: (authUserId: string) => Promise<{ isActiveAdmin: boolean }>;
  reconcileMvaAdminRole?: (
    userId: string,
    isActiveMvaAdmin: boolean
  ) => Promise<ScoreboardRole | null>;
  activeRoleForUser?: (userId: string) => Promise<ScoreboardRole | null>;
  clientConfig?: MvaCatalogClientConfig;
}

export function isMvaCatalogConfigured(): boolean {
  const rawBaseUrl = (process.env.MVA_CATALOG_BASE_URL ?? "").trim();
  const rawToken = (process.env.MVA_SCOREBOARD_INTEGRATION_TOKEN ?? "").trim();
  return Boolean(rawBaseUrl && rawToken.length >= 16);
}

/**
 * Evaluates the scoreboard authorization state for a verified identity.
 *
 * CRITICAL SECURITY PRINCIPLES:
 * 1. Authentication is not authorization: having a valid Supabase identity
 *    grants zero scoreboard privileges by default.
 * 2. Active MVA ADMINs are verified live via the protected server-to-server MVA endpoint
 *    using the server-verified Supabase Auth UUID, then reconciled into `scoreboard.role_grants`
 *    (`grant_source = 'MVA_ADMIN'`) so SQL-side guards (`phase04_role`) enforce consistently.
 * 3. Independently granted Scoreboard roles (`grant_source = 'SCOREBOARD'`) and scorekeeper
 *    assignments are preserved across MVA admin verification and revocations.
 * 4. Fail closed when the restricted runtime or MVA admin verification endpoint is unavailable.
 */
export async function evaluateScoreboardAuthorization(
  deps: EvaluateScoreboardAuthDeps
): Promise<ScoreboardAuthorization> {
  const user = await deps.getAuthenticatedUser();

  if (!user) {
    return {
      isAuthenticated: false,
      isAuthorized: false,
      status: "UNAUTHENTICATED",
      userId: null,
      email: null,
      role: null,
      reason: "No authenticated session found.",
    };
  }

  const dbConfigured = (
    deps.isDatabaseConfigured ?? isScoreboardDatabaseConfigured
  )();

  let activeRole: ScoreboardRole | null = null;
  if (dbConfigured) {
    const mvaConfigured = (
      deps.isMvaIntegrationConfigured ?? isMvaCatalogConfigured
    )();

    try {
      if (mvaConfigured || deps.verifyMvaAdmin) {
        const verifyAdmin =
          deps.verifyMvaAdmin ??
          ((id: string) => verifyMvaAdminStatus(id, deps.clientConfig));
        const reconcileRole =
          deps.reconcileMvaAdminRole ?? reconcileMvaAdminRole;

        const mvaStatus = await verifyAdmin(user.id);
        activeRole = await reconcileRole(
          user.id,
          mvaStatus.isActiveAdmin === true
        );
      } else {
        const lookupRole = deps.activeRoleForUser ?? activeRoleForUser;
        activeRole = await lookupRole(user.id);
      }
    } catch {
      return {
        isAuthenticated: true,
        isAuthorized: false,
        status: "UNAVAILABLE",
        userId: user.id,
        email: user.email ?? null,
        role: null,
        reason: "Scoreboard authorization is temporarily unavailable.",
      };
    }
  }

  if (!activeRole) {
    return {
      isAuthenticated: true,
      isAuthorized: false,
      status: "ACCESS_PENDING",
      userId: user.id,
      email: user.email ?? null,
      role: null,
      reason:
        "Authenticated identity has no active MVA Live Scoreboard role grant.",
    };
  }

  return {
    isAuthenticated: true,
    isAuthorized: true,
    status: "AUTHORIZED",
    userId: user.id,
    email: user.email ?? null,
    role: activeRole,
  };
}
