"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { signInAction, type AuthActionState } from "@/app/actions/auth";

interface LoginFormProps {
  next?: string;
  initialError?: string;
}

export function LoginForm({ next, initialError }: LoginFormProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [state, formAction, isPending] = useActionState<
    AuthActionState | null,
    FormData
  >(signInAction, null);

  const passwordRef = useRef<HTMLInputElement>(null);

  // Clear password field on submission failure
  useEffect(() => {
    if (state?.error && passwordRef.current) {
      passwordRef.current.value = "";
    }
  }, [state?.error]);

  const activeGeneralError = state?.error || initialError;

  return (
    <div>
      <form action={formAction} className="space-y-5" noValidate>
        {next && <input type="hidden" name="next" value={next} />}

        <Field
          id="email"
          name="email"
          label="Email address"
          type="email"
          placeholder="name@example.com"
          autoComplete="email"
          required
          disabled={isPending}
          error={state?.fieldErrors?.email}
        />

        <Field
          ref={passwordRef}
          id="password"
          name="password"
          label="Password"
          type={showPassword ? "text" : "password"}
          placeholder="Enter your password"
          autoComplete="current-password"
          required
          disabled={isPending}
          error={state?.fieldErrors?.password}
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="min-h-10 rounded-lg px-2.5 text-xs font-semibold text-[var(--blue)] hover:bg-[var(--subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              disabled={isPending}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          }
        />

        {activeGeneralError && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
          >
            {activeGeneralError}
          </div>
        )}

        <Button
          type="submit"
          className="w-full"
          disabled={isPending}
          aria-busy={isPending}
        >
          {isPending ? "Signing in…" : "Sign in"}
          {!isPending && <span aria-hidden="true">→</span>}
        </Button>
      </form>
    </div>
  );
}
