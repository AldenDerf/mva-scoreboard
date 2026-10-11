import Link from "next/link";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { getScoreboardAuthorization } from "@/lib/auth/authorization";
import { signOutAction } from "@/app/actions/auth";

export const instant = false;

export default async function UnauthorizedPage() {
  const auth = await getScoreboardAuthorization();

  return (
    <main className="min-h-screen bg-[var(--surface)] text-[var(--ink)] flex flex-col items-center justify-center px-5 py-12 sm:px-8">
      <div className="w-full max-w-lg space-y-8">
        <div className="flex justify-center">
          <Brand />
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--paper)] p-8 shadow-sm sm:p-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-red-300 bg-red-50 px-3 py-1 text-xs font-semibold text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
            <span className="size-2 rounded-full bg-red-500" aria-hidden="true" />
            UNAUTHORIZED ACTION
          </div>

          <h1 className="mt-5 text-2xl font-bold tracking-tight text-[var(--ink)] sm:text-3xl">
            Access Denied
          </h1>

          <p className="mt-3 text-[15px] leading-relaxed text-[var(--muted)]">
            Your current role does not have permission to view this resource.
          </p>

          <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--subtle)] p-4 text-sm space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-[var(--muted)]">Signed in as:</span>
              <span className="font-semibold text-[var(--ink)]">
                {auth.email || auth.userId || "Not signed in"}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-[var(--muted)]">Assigned role:</span>
              <span className="font-mono text-[var(--ink)] font-medium">
                {auth.role || "None"}
              </span>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <form action={signOutAction} className="w-full sm:w-auto">
              <Button type="submit" variant="secondary" className="w-full">
                Sign out
              </Button>
            </form>

            <Link
              href="/"
              className="text-center text-xs font-semibold text-[var(--blue)] underline underline-offset-4 hover:text-[var(--blue-hover)]"
            >
              Return to home →
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
