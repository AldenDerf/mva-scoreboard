import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { getScoreboardAuthorization } from "@/lib/auth/authorization";
import { signOutAction } from "@/app/actions/auth";

export const instant = false;

export default async function AccessPendingPage() {
  const auth = await getScoreboardAuthorization();

  // If not authenticated, redirect to sign in
  if (!auth.isAuthenticated) {
    redirect("/");
  }

  // If authorized, proceed to dashboard
  if (auth.isAuthorized) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-[var(--surface)] text-[var(--ink)] flex flex-col items-center justify-center px-5 py-12 sm:px-8">
      <div className="w-full max-w-lg space-y-8">
        <div className="flex justify-center">
          <Brand />
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--paper)] p-8 shadow-sm sm:p-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <span
              className="size-2 rounded-full bg-amber-500"
              aria-hidden="true"
            />
            AUTHORIZATION PENDING
          </div>

          <h1 className="mt-5 text-2xl font-bold tracking-tight text-[var(--ink)] sm:text-3xl">
            Scoreboard Access Required
          </h1>

          <p className="mt-3 text-[15px] leading-relaxed text-[var(--muted)]">
            You are signed in with a valid MVA identity, but your account does
            not currently hold an active role grant in MVA Live Scoreboard.
          </p>

          <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--subtle)] p-4 text-sm space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-[var(--muted)]">Signed in as:</span>
              <span className="font-semibold text-[var(--ink)]">
                {auth.email || auth.userId}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-[var(--muted)]">Scoreboard Role:</span>
              <span className="font-mono text-amber-700 dark:text-amber-400 font-medium">
                None (fails closed)
              </span>
            </div>
          </div>

          <div className="mt-6 text-sm leading-6 text-[var(--muted)] border-t border-[var(--border)] pt-5">
            <p>
              MVA website administrative access does not convey scoreboard
              privileges. An administrator must provision an active role
              (Admin or Scorekeeper) before you can manage matches.
            </p>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <form action={signOutAction} className="w-full sm:w-auto">
              <Button type="submit" variant="secondary" className="w-full">
                Sign out
              </Button>
            </form>

            {process.env.NODE_ENV === "development" && (
              <Link
                href="/dev"
                className="text-center text-xs font-semibold text-[var(--blue)] underline underline-offset-4 hover:text-[var(--blue-hover)]"
              >
                Development previews →
              </Link>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-[var(--muted)]">
          MVA Live Scoreboard · Mahatao Volleyball Association
        </p>
      </div>
    </main>
  );
}
