"use client";

import { useReducer, useState } from "react";
import { OverlayPreview, type OverlayDisplay } from "@/components/overlay-preview";
import { applyPracticeAction, createPracticeMatch, setWinner, type Format, type PracticeAction, type PracticeMatch, type Side } from "@/lib/scoring/practice";

type Screen = { match: PracticeMatch | null; notice: string };
type ScreenAction = { type: "START"; match: PracticeMatch } | { type: "RESET" } | { type: "COMMAND"; command: PracticeAction };

function reducer(screen: Screen, action: ScreenAction): Screen {
  if (action.type === "START") return { match: action.match, notice: "Practice match started. Scores live only in this tab." };
  if (action.type === "RESET") return { match: null, notice: "Practice match cleared." };
  if (!screen.match) return screen;
  const result = applyPracticeAction(screen.match, action.command);
  if (!result.ok) return { ...screen, notice: result.reason === "CONFLICT" ? "This tap was not counted. Check the score and try again." : "Action unavailable for this set." };
  const notice = result.replayed ? "Repeated action ignored." : action.command.type === "AWARD"
    ? `Point recorded for ${action.command.team === "A" ? result.state.teamA : result.state.teamB}.`
    : action.command.type === "UNDO" ? "Last point corrected." : "Set confirmed.";
  return { match: result.state, notice };
}

function overlayDisplay(match: PracticeMatch): OverlayDisplay {
  const set = match.sets.at(-1)!;
  const team = (side: Side) => {
    const name = side === "A" ? match.teamA : match.teamB;
    return { name, short: name.split(/\s+/).map((part) => part[0]).join("").slice(0, 3).toUpperCase(),
      points: side === "A" ? set.teamA : set.teamB,
      sets: match.sets.filter((item) => item.winner === side).length,
      serving: match.serving === side && match.status === "LIVE" };
  };
  return { teams: [team("A"), team("B")], tournament: "Practice match", division: "Development only",
    currentSet: set.number, bestOf: match.bestOf, label: "Practice · Not live",
    status: match.status === "COMPLETED" ? "Final" : setWinner(set, match.bestOf) ? "Confirm set" : "Practice" };
}

export function PracticeScorekeeper() {
  const [screen, dispatch] = useReducer(reducer, { match: null, notice: "" });
  const [teamA, setTeamA] = useState("North Shore Spikers");
  const [teamB, setTeamB] = useState("Lighthouse Collective");
  const [bestOf, setBestOf] = useState<Format>(3);
  const [serve, setServe] = useState<Side>("A");
  const [error, setError] = useState("");
  const match = screen.match;
  const current = match?.sets.at(-1);
  const winner = match && current ? setWinner(current, match.bestOf) : null;

  function send(type: PracticeAction["type"], team?: Side) {
    if (!match) return;
    const base = { id: crypto.randomUUID(), expectedRevision: match.revision };
    dispatch({ type: "COMMAND", command: type === "AWARD" ? { ...base, type, team: team! } : { ...base, type } });
  }
  function start() {
    try { dispatch({ type: "START", match: createPracticeMatch(teamA, teamB, bestOf, serve) }); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Invalid match settings."); }
  }
  const canUndo = !!match && !!current && match.status === "LIVE" && match.events.some((event) =>
    event.type === "AWARD" && event.setNumber === current.number && !match.events.some((item) => item.type === "UNDO" && item.targetId === event.id));

  return <div className="space-y-6">
    <header><p className="eyebrow text-[var(--blue)]">DEVELOPMENT / PRACTICE</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Practice scorekeeper</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">Fictional teams only. This score is stored in this tab, disappears on refresh, and does not update OBS or any database.</p></header>
    {!match ? <section aria-label="Practice match setup" className="rounded-2xl border border-[var(--border)] bg-[var(--paper)] p-5 sm:p-7">
      <h2 className="text-xl font-semibold">Start a practice match</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">Team A<input className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-3 font-normal" maxLength={80} value={teamA} onChange={(event) => setTeamA(event.target.value)} /></label>
        <label className="text-sm font-semibold">Team B<input className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-3 font-normal" maxLength={80} value={teamB} onChange={(event) => setTeamB(event.target.value)} /></label>
        <label className="text-sm font-semibold">Format<select className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-3 font-normal" value={bestOf} onChange={(event) => setBestOf(Number(event.target.value) as Format)}><option value={3}>Best of 3</option><option value={5}>Best of 5</option></select></label>
        <label className="text-sm font-semibold">First serve<select className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-3 font-normal" value={serve} onChange={(event) => setServe(event.target.value as Side)}><option value="A">Team A</option><option value="B">Team B</option></select></label>
      </div>
      {error && <p role="alert" className="mt-4 text-sm font-semibold text-red-600">{error}</p>}
      <button type="button" onClick={start} className="mt-6 min-h-12 rounded-xl bg-[#2455cf] px-6 font-bold text-white hover:bg-[#1b44ad]">Start practice</button>
    </section> : <>
      <section aria-label="Practice match score" className="rounded-2xl border border-[var(--border)] bg-[var(--paper)] p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">{match.status === "COMPLETED" ? "Practice match complete" : `Set ${current?.number} of ${match.bestOf}`}</h2><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-900">Not saved · Not live</span></div>
        <p role="status" aria-live="polite" className="mt-3 text-sm font-medium text-[var(--muted)]">{screen.notice}</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">{(["A", "B"] as Side[]).map((side) => <div key={side} className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--subtle)] p-5">
          <h3 className="truncate text-lg font-bold" title={side === "A" ? match.teamA : match.teamB}>{side === "A" ? match.teamA : match.teamB}</h3>
          <p className="mt-1 min-h-5 text-sm text-[var(--muted)]">{match.serving === side && match.status === "LIVE" ? "● Serving" : null}</p>
          <p className="tabular mt-3 text-6xl font-black" aria-label={`${side === "A" ? match.teamA : match.teamB} points`}>{side === "A" ? current?.teamA : current?.teamB}</p>
          <button type="button" disabled={!!winner || match.status === "COMPLETED"} onClick={() => send("AWARD", side)} aria-label={`Award one point to ${side === "A" ? match.teamA : match.teamB}`} className="mt-5 min-h-16 w-full rounded-xl bg-[#2455cf] px-5 text-xl font-black text-white hover:bg-[#1b44ad] disabled:opacity-40">+1 point</button>
        </div>)}</div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" disabled={!canUndo} onClick={() => { if (window.confirm("Undo the most recent uncorrected point in this set?")) send("UNDO"); }} className="min-h-12 rounded-xl border border-[var(--border)] px-5 font-semibold disabled:opacity-40">Undo last point</button>
          {winner && match.status === "LIVE" && <button type="button" onClick={() => { if (window.confirm(`Confirm set ${current?.number} for ${winner === "A" ? match.teamA : match.teamB}?`)) send("CONFIRM_SET"); }} className="min-h-12 rounded-xl bg-[#2455cf] px-5 font-bold text-white">Confirm set for {winner === "A" ? match.teamA : match.teamB}</button>}
          <button type="button" onClick={() => { if (window.confirm("Clear this unsaved practice match? This cannot be undone.")) dispatch({ type: "RESET" }); }} className="min-h-12 rounded-xl border border-red-300 px-5 font-semibold text-red-700 dark:text-red-300">Reset practice match</button>
        </div>
        <div className="mt-6 border-t border-[var(--border)] pt-4"><h3 className="text-sm font-bold uppercase tracking-wide">Set history</h3><ol className="mt-2 flex flex-wrap gap-2">{match.sets.map((set) => <li key={set.number} className="rounded-lg bg-[var(--subtle)] px-3 py-2 text-sm">Set {set.number}: {set.teamA}–{set.teamB}{set.winner ? ` · ${set.winner === "A" ? match.teamA : match.teamB} won` : " · Current"}</li>)}</ol></div>
      </section>
      <section aria-label="Practice overlay appearance"><h2 className="mb-3 text-lg font-semibold">Scorebug appearance in this tab</h2><OverlayPreview display={overlayDisplay(match)} embedded /><p className="mt-3 text-xs text-[var(--muted)]">The separate OBS preview URL remains static. This scorebug is only a local visual check.</p></section>
    </>}
  </div>;
}
