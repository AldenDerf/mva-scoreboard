import { createBrowserClient } from "@supabase/ssr";
import {
  getSupabaseAnonKey,
  getSupabaseCookieName,
  getSupabaseUrl,
} from "./config";

/**
 * Creates a browser-side Supabase client with isolated cookie configuration.
 */
export function createClient() {
  return createBrowserClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookieOptions: {
      name: getSupabaseCookieName(),
    },
  });
}
