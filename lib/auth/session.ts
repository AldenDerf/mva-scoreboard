import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Retrieves the currently authenticated Supabase user for the server request.
 *
 * Uses `supabase.auth.getUser()`, which validates the session with the Supabase
 * Auth server, rather than relying on an unverified cookie or JWT alone.
 *
 * Returns null if no session exists, the session has expired, or the user is invalid.
 */
export async function getAuthenticatedUser(): Promise<User | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    return user;
  } catch {
    // Fail closed on client creation or network failure
    return null;
  }
}
