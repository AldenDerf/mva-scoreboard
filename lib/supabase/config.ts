/**
 * Supabase client and cookie configuration for MVA Live Scoreboard.
 */

export const DEFAULT_SCOREBOARD_COOKIE_NAME = "sb-mva-scoreboard-auth-token";

export function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error(
      "Missing Supabase environment variable: NEXT_PUBLIC_SUPABASE_URL is not set."
    );
  }
  return url;
}

export function getSupabaseAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error(
      "Missing Supabase environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY is not set."
    );
  }
  return key;
}

/**
 * Cookie name configured to isolate MVA Scoreboard sessions from the main MVA app
 * on shared localhost domains (localhost:3000 vs localhost:3001).
 */
export function getSupabaseCookieName(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_COOKIE_NAME ||
    DEFAULT_SCOREBOARD_COOKIE_NAME
  );
}
