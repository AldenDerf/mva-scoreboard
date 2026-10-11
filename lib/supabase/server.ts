import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  getSupabaseAnonKey,
  getSupabaseCookieName,
  getSupabaseUrl,
} from "./config";

/**
 * Creates a server-side Supabase client for Server Components, Server Actions,
 * and Route Handlers using Next.js cookies().
 */
export async function createClient() {
  const cookieStore = await cookies();
  const supabaseUrl = getSupabaseUrl();
  const supabaseAnonKey = getSupabaseAnonKey();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: {
      name: getSupabaseCookieName(),
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be safely ignored when proxy/middleware handles session updates.
        }
      },
    },
  });
}
