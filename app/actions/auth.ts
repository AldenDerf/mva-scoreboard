"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getScoreboardAuthorization } from "@/lib/auth/authorization";
import { getSafeRedirectUrl } from "@/lib/auth/redirects";

export interface AuthActionState {
  error?: string;
  fieldErrors?: {
    email?: string;
    password?: string;
  };
  success?: boolean;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Server action for email/password authentication.
 *
 * Implements:
 * - Server-side validation
 * - Generic error messaging (avoids leaking account existence)
 * - Safe redirect handling
 * - Fail-closed authorization check post-authentication
 */
export async function signInAction(
  _prevState: AuthActionState | null,
  formData: FormData
): Promise<AuthActionState> {
  const emailRaw = formData.get("email");
  const passwordRaw = formData.get("password");
  const nextRaw = formData.get("next");

  const email = typeof emailRaw === "string" ? emailRaw.trim() : "";
  const password = typeof passwordRaw === "string" ? passwordRaw : "";
  const nextTarget = typeof nextRaw === "string" ? nextRaw : undefined;

  // 1. Validation
  const fieldErrors: { email?: string; password?: string } = {};

  if (!email) {
    fieldErrors.email = "Email address is required.";
  } else if (!EMAIL_REGEX.test(email)) {
    fieldErrors.email = "Please enter a valid email address.";
  }

  if (!password) {
    fieldErrors.password = "Password is required.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  // 2. Supabase Authentication
  let destination = "/dashboard";
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // Use generic error message to prevent user enumeration / account existence leakage
      return {
        error:
          "Invalid email or password. Please verify your credentials and try again.",
      };
    }

    // 3. Authorization check
    const auth = await getScoreboardAuthorization();
    if (auth.isAuthorized) {
      destination = getSafeRedirectUrl(nextTarget, "/dashboard");
    } else {
      destination = "/access-pending";
    }
  } catch (err: unknown) {
    // If the thrown error is a Next.js redirect, rethrow it
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      typeof (err as { digest: unknown }).digest === "string" &&
      ((err as { digest: string }).digest.startsWith("NEXT_REDIRECT") ||
        (err as { digest: string }).digest.startsWith("NEXT_NOT_FOUND"))
    ) {
      throw err;
    }

    return {
      error:
        "An unexpected error occurred during sign in. Please try again later.",
    };
  }

  // Perform redirect outside of try/catch to allow Next.js navigation
  redirect(destination);
}

/**
 * Server action to sign out and clear session cookies.
 */
export async function signOutAction(): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // Continue redirect even if sign out call encountered an error
  }

  redirect("/");
}
