import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { LoginForm } from "@/components/login-form";
import { getScoreboardAuthorization } from "@/lib/auth/authorization";
import { getSafeRedirectUrl } from "@/lib/auth/redirects";

export const instant = false;

interface HomePageProps {
  searchParams?: Promise<{
    next?: string;
    error?: string;
  }>;
}

export default async function Home({ searchParams }: HomePageProps) {
  const resolvedParams = searchParams ? await searchParams : {};
  const nextTarget = resolvedParams.next;
  const errorParam = resolvedParams.error;

  // Check if session is already established
  const auth = await getScoreboardAuthorization();
  if (auth.isAuthenticated) {
    if (auth.isAuthorized) {
      redirect(getSafeRedirectUrl(nextTarget, "/dashboard"));
    } else {
      redirect("/access-pending");
    }
  }

  let initialError: string | undefined;
  if (errorParam === "session_expired") {
    initialError = "Your session has expired. Please sign in again.";
  } else if (errorParam === "unauthorized") {
    initialError = "Access denied. An authorized role is required.";
  }

  return (
    <main className="min-h-screen bg-[var(--surface)] text-[var(--ink)] lg:grid lg:grid-cols-[minmax(0,1.04fr)_minmax(430px,.96fr)]">
      <section
        className="relative isolate hidden min-h-screen overflow-hidden bg-[#071735] px-12 py-10 text-white lg:flex lg:flex-col xl:px-20"
        aria-label="About MVA Live Scoreboard"
      >
        <div className="court-lines pointer-events-none absolute inset-0 -z-10 opacity-60" />
        <Brand inverse />
        <div className="my-auto max-w-xl pb-16">
          <span className="eyebrow text-blue-200">
            MAHATAO VOLLEYBALL ASSOCIATION
          </span>
          <h1 className="mt-7 max-w-[12ch] text-[clamp(3.8rem,6vw,6.4rem)] font-semibold leading-[.98] tracking-[-.065em]">
            Every point, in focus.
          </h1>
          <p className="mt-8 max-w-md text-lg leading-8 text-blue-100/75">
            Match control and broadcast graphics, designed for the people
            behind the game.
          </p>
          <div className="mt-12 flex items-center gap-4 border-l-2 border-blue-400 pl-5 text-sm leading-6 text-blue-100/70">
            <span
              className="block h-2.5 w-2.5 shrink-0 rounded-full bg-[#62a5ff]"
              aria-hidden="true"
            />
            Online-first scoreboard workspace
          </div>
        </div>
        <p className="text-xs tracking-wide text-blue-200/50">
          MVA LIVE SCOREBOARD · MAHATAO, BATANES
        </p>
      </section>

      <section className="flex min-h-screen flex-col px-5 py-6 sm:px-10 lg:px-14 xl:px-24">
        <div className="lg:hidden">
          <Brand />
        </div>
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-14">
          <div className="mb-10">
            <span className="eyebrow text-[var(--blue)]">SECURE WORKSPACE</span>
            <h2 className="mt-3 text-4xl font-semibold tracking-[-.055em] sm:text-[2.75rem]">
              Welcome back.
            </h2>
            <p className="mt-3 text-[15px] leading-6 text-[var(--muted)]">
              Sign in to prepare matches and manage the scoreboard.
            </p>
          </div>
          <LoginForm next={nextTarget} initialError={initialError} />
          <div className="mt-9 rounded-xl border border-[var(--border)] bg-[var(--subtle)] px-4 py-3 text-sm leading-6 text-[var(--muted)]">
            <strong className="font-semibold text-[var(--ink)]">
              Restricted access.
            </strong>{" "}
            Only users granted an MVA Live Scoreboard role will be able to
            continue.
          </div>
          {process.env.NODE_ENV === "development" && (
            <p className="mt-6 text-sm text-[var(--muted)]">
              Reviewing the interface?{" "}
              <Link
                className="font-semibold text-[var(--blue)] underline underline-offset-4 hover:text-[var(--blue-hover)]"
                href="/dev"
              >
                Open development previews
              </Link>
            </p>
          )}
        </div>
        <footer className="mx-auto w-full max-w-[420px] border-t border-[var(--border)] pt-5 text-xs text-[var(--muted)]">
          © Mahatao Volleyball Association
        </footer>
      </section>
    </main>
  );
}
