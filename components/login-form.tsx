"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, SelectField } from "@/components/ui/field";

type PreviewState = "ready" | "loading" | "error";

export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [previewState, setPreviewState] = useState<PreviewState>("ready");
  const [submitted, setSubmitted] = useState(false);
  const isLoading = previewState === "loading";
  const showError = submitted || previewState === "error";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = event.currentTarget.elements.namedItem("password");
    if (password instanceof HTMLInputElement) password.value = "";
    setSubmitted(true);
  }

  return (
    <div>
      <div className="mb-7 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100">
        <strong>Interface preview.</strong> Sign-in is not connected. Do not enter real credentials.
      </div>
      <form onSubmit={handleSubmit} className="space-y-5">
        <Field id="email" name="email" label="Email address" type="email" placeholder="name@example.com" autoComplete="off" required disabled={isLoading} />
        <Field id="password" name="password" label="Password" type={showPassword ? "text" : "password"} placeholder="Enter your password" autoComplete="off" required disabled={isLoading} trailing={
          <button type="button" onClick={() => setShowPassword((current) => !current)} className="min-h-10 rounded-lg px-2.5 text-xs font-semibold text-[var(--blue)] hover:bg-[var(--subtle)]" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>
            {showPassword ? "Hide" : "Show"}
          </button>
        } />
        {showError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">Sign-in is not available in this interface preview. No credentials were sent.</div>}
        <Button type="submit" className="w-full" disabled={isLoading} aria-busy={isLoading}>
          {isLoading ? "Checking access…" : "Sign in"}
          {!isLoading && <span aria-hidden="true">→</span>}
        </Button>
      </form>
      {process.env.NODE_ENV === "development" && (
        <div className="mt-8 border-t border-[var(--border)] pt-6">
          <SelectField id="login-preview-state" label="Preview form state" value={previewState} onChange={(event) => { setPreviewState(event.target.value as PreviewState); setSubmitted(false); }} hint="Development-only visual states; no authentication request is made.">
            <option value="ready">Ready</option>
            <option value="loading">Checking access</option>
            <option value="error">Service error</option>
          </SelectField>
        </div>
      )}
    </div>
  );
}
