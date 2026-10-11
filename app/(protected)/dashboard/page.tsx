import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { requireScoreboardAuth } from "@/lib/auth/authorization";
import { signOutAction } from "@/app/actions/auth";

export const instant = false;

export default async function DashboardPage() {
  const auth = await requireScoreboardAuth();

  return (
    <div className="min-h-screen bg-[var(--surface)] text-[var(--ink)]">
      {/* Top Application Bar */}
      <header className="border-b border-[var(--border)] bg-[var(--paper)]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Brand />
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-xs text-[var(--muted)]">Signed in as</p>
              <p className="text-sm font-semibold text-[var(--ink)]">
                {auth.email}
              </p>
            </div>
            <span className="rounded-full bg-[#173e83] px-3 py-1 text-xs font-semibold text-white">
              {auth.role}
            </span>
            <form action={signOutAction}>
              <Button type="submit" variant="secondary">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>

      {/* Main Dashboard Content */}
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8">
          <span className="eyebrow text-[var(--blue)]">OPERATIONAL WORKSPACE</span>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-[var(--ink)] sm:text-4xl">
            Scoreboard Dashboard
          </h1>
          <p className="mt-2 text-base text-[var(--muted)]">
            Manage live matches, configure sets, and monitor active broadcasts.
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--paper)] p-6 sm:p-8">
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100">
            <strong>Authenticated session active.</strong> You are verified as{" "}
            <span className="font-semibold">{auth.email}</span> with role{" "}
            <span className="font-semibold">{auth.role}</span>.
          </div>
          <p className="mt-4 text-sm text-[var(--muted)]">
            Match management and scoring engines will be connected following
            database schema provisioning in Phase 03B.
          </p>
        </div>
      </main>
    </div>
  );
}
