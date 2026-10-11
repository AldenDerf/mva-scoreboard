import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAnonKey,
  getSupabaseCookieName,
  getSupabaseUrl,
} from "./config";

/**
 * Updates and refreshes the Supabase Auth session on incoming requests.
 * Runs in Next.js proxy (proxy.ts) before request reaches route handlers or components.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  let supabaseUrl: string;
  let supabaseAnonKey: string;

  try {
    supabaseUrl = getSupabaseUrl();
    supabaseAnonKey = getSupabaseAnonKey();
  } catch {
    // If Supabase env variables are not set, pass the request through safely
    return supabaseResponse;
  }

  const cookieName = getSupabaseCookieName();

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: {
      name: cookieName,
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Calling getUser refreshes the session token if needed and writes updated cookies
  await supabase.auth.getUser();

  return supabaseResponse;
}
