import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "./session";
import { getSafeRedirectUrl } from "./redirects";
import {
  evaluateScoreboardAuthorization,
  isMvaCatalogConfigured,
  type AuthorizationStatus,
  type EvaluateScoreboardAuthDeps,
  type ScoreboardAuthorization,
  type ScoreboardRole,
} from "./evaluate-authorization.ts";

export {
  evaluateScoreboardAuthorization,
  isMvaCatalogConfigured,
  type AuthorizationStatus,
  type EvaluateScoreboardAuthDeps,
  type ScoreboardAuthorization,
  type ScoreboardRole,
};

/**
 * Evaluates the scoreboard authorization state for the current request.
 */
export async function getScoreboardAuthorization(
  deps?: EvaluateScoreboardAuthDeps
): Promise<ScoreboardAuthorization> {
  return evaluateScoreboardAuthorization({
    getAuthenticatedUser,
    ...deps,
  });
}

export interface RequireAuthOptions {
  allowedRoles?: ScoreboardRole[];
  currentPath?: string;
}

/**
 * Server-side guard for protected routes.
 *
 * Enforces the three-level security check:
 * 1. Supabase session present
 * 2. Authenticated identity verified
 * 3. Scoreboard-specific role authorization
 *
 * Redirects:
 * - Unauthenticated users -> /?next=<currentPath>
 * - Authenticated without role -> /access-pending
 * - Authenticated with insufficient role -> /unauthorized
 */
export async function requireScoreboardAuth(
  options?: RequireAuthOptions
): Promise<ScoreboardAuthorization & { isAuthorized: true; role: ScoreboardRole }> {
  const auth = await getScoreboardAuthorization();

  if (!auth.isAuthenticated) {
    const safeNext = options?.currentPath
      ? getSafeRedirectUrl(options.currentPath, "/dashboard")
      : undefined;
    const redirectUrl = safeNext
      ? `/?next=${encodeURIComponent(safeNext)}`
      : "/";
    redirect(redirectUrl);
  }

  if (auth.status === "ACCESS_PENDING" || !auth.isAuthorized || !auth.role) {
    redirect(auth.status === "UNAVAILABLE" ? "/access-pending?unavailable=1" : "/access-pending");
  }

  if (options?.allowedRoles && !options.allowedRoles.includes(auth.role)) {
    redirect("/unauthorized");
  }

  return auth as ScoreboardAuthorization & {
    isAuthorized: true;
    role: ScoreboardRole;
  };
}

/**
 * Guard requiring ADMIN role.
 */
export async function requireAdmin(currentPath?: string) {
  return requireScoreboardAuth({
    allowedRoles: ["ADMIN"],
    currentPath,
  });
}

/**
 * Guard requiring SCOREKEEPER or ADMIN role.
 */
export async function requireScorekeeper(currentPath?: string) {
  return requireScoreboardAuth({
    allowedRoles: ["ADMIN", "SCOREKEEPER"],
    currentPath,
  });
}
