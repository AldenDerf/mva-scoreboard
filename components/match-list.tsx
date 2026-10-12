
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { MatchSummary } from "@/lib/db/scoreboard";

export function MatchList({ isAdmin }: { isAdmin: boolean }) {
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [notice, setNotice] = useState("Loading server matches…");
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [bestOf, setBestOf] = useState<3 | 5>(3);
  const [serving, setServing] = useState<"A" | "B">("A");
  const [busy, setBusy] = useState(false);
  async function load() {
    try {
      const response = await fetch("/api/matches", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load matches.");
      const body = await response.json() as { matches: MatchSummary[] };
      setMatches(body.matches); setNotice(body.matches.length ? "" : "No assigned matches yet.");
    } catch { setNotice("Matches unavailable. Check your connection and retry."); }
  }
  useEffect(() => {
    let active = true;
    fetch("/api/matches", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load matches.");
        return response.json() as Promise<{ matches: MatchSummary[] }>;
      })
      .then((body) => { if (active) { setMatches(body.matches); setNotice(body.matches.length ? "" : "No assigned matches yet."); } })
      .catch(() => { if (active) setNotice("Matches unavailable. Check your connection and retry."); });
    return () => { active = false; };
  }, []);
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setNotice("Creating test match…");
    try {
      const response = await fetch("/api/matches", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamA, teamB, bestOf, serving }),
      });
      const body = await response.json() as { id?: string; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not create match.");
      setTeamA(""); setTeamB(""); setNotice("Test match created."); await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not create match."); }
    finally { setBusy(false); }
  }
  const field = "mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-3";
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
    <header>
      <div className="mb-2"><Link href="/dashboard" className="text-sm font-semibold text-[var(--blue)] hover:underline">← Dashboard</Link></div>
      <p className="eyebrow text-[var(--blue)]">SERVER MATCHES</p>
      <h1 className="mt-2 text-3xl font-bold">Matches</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">Scores here are stored by the server. Test matches are labeled and separate from official MVA results.</p>
    </header>
    <p role="status" aria-live="polite" className="text-sm font-semibold">{notice}</p>
    {isAdmin && <form onSubmit={create} className="rounded-2xl border border-[var(--border)] bg-[var(--paper)] p-5">
      <h2 className="text-xl font-bold">Create test match</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-bold">Team A<input required maxLength={80} className={field} value={teamA} onChange={(event) => setTeamA(event.target.value)} /></label>
        <label className="text-sm font-bold">Team B<input required maxLength={80} className={field} value={teamB} onChange={(event) => setTeamB(event.target.value)} /></label>
        <label className="text-sm font-bold">Format<select className={field} value={bestOf} onChange={(event) => setBestOf(Number(event.target.value) as 3 | 5)}><option value={3}>Best of 3</option><option value={5}>Best of 5</option></select></label>
        <label className="text-sm font-bold">First serve<select className={field} value={serving} onChange={(event) => setServing(event.target.value as "A" | "B")}><option value="A">{teamA.trim() ? `${teamA.trim()} (Team A)` : "Team A"}</option><option value="B">{teamB.trim() ? `${teamB.trim()} (Team B)` : "Team B"}</option></select></label>
      </div>
      <button disabled={busy} className="mt-4 min-h-12 rounded-xl bg-[#2455cf] px-6 font-bold text-white disabled:opacity-40">Create test match</button>
    </form>}
    <section aria-label="Assigned matches" className="grid gap-3">
      {matches.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--paper)] p-8 text-center text-sm text-[var(--muted)]">
          No matches assigned or created yet.
        </div>
      ) : (
        matches.map((match) => <Link key={match.id} href={`/matches/${match.id}`} className="block rounded-xl border border-[var(--border)] bg-[var(--paper)] p-5 focus-visible:outline-2 focus-visible:outline-blue-500">
          <span className="text-xs font-bold uppercase text-[var(--blue)]">{match.isTest ? "Test match" : "Official"} · {match.status}</span>
          <h2 className="mt-1 text-lg font-bold">{match.teamA} vs {match.teamB}</h2>
        </Link>)
      )}
    </section>
    <button type="button" onClick={() => void load()} className="min-h-12 rounded-xl border border-[var(--border)] px-5 font-bold">Refresh matches</button>
  </main>;
}
