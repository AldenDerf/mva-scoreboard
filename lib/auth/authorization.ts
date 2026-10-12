import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "./session";
import { getSafeRedirectUrl } from "./redirects";
import { activeRoleForUser, isScoreboardDatabaseConfigured } from "@/lib/db/scoreboard";

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

/**
 * Evaluates the scoreboard authorization state for the current request.
 *
 * CRITICAL SECURITY PRINCIPLES:
 * 1. Authentication is not authorization: having a valid Supabase identity
 *    grants zero scoreboard privileges by default.
 * 2. Never infer authorization from email, user metadata, or MVA app admin tables.
 * 3. Fail closed when the restricted runtime is unavailable or unconfigured.
 *    No hardcoded development admin accounts are permitted.
 */
export async function getScoreboardAuthorization(): Promise<ScoreboardAuthorization> {
  const user = await getAuthenticatedUser();

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

  let activeRole: ScoreboardRole | null = null;
  if (isScoreboardDatabaseConfigured()) {
    try {
      activeRole = await activeRoleForUser(user.id);
    } catch {
      return { isAuthenticated: true, isAuthorized: false, status: "UNAVAILABLE",
        userId: user.id, email: user.email ?? null, role: null,
        reason: "Scoreboard authorization is temporarily unavailable." };
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
