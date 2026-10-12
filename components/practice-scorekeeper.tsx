"use client";

import { useReducer, useState } from "react";
import { OverlayPreview, type OverlayDisplay } from "@/components/overlay-preview";
import { applyPracticeAction, createPracticeMatch, setWinner, setsWon, startNewPracticeMatch, validFinalSet, type Format, type PracticeAction, type PracticeMatch, type Side } from "@/lib/scoring/practice";

type Screen = { match: PracticeMatch | null; notice: string };
type ScreenAction = { type: "START"; match: PracticeMatch } | { type: "RESET" } | { type: "COMMAND"; command: PracticeAction };
type Editor = "points" | "sets" | "current" | null;
type CommandInput = PracticeAction extends infer T ? T extends PracticeAction ? Omit<T, "id" | "expectedRevision"> : never : never;
const inputClass = "mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-3";
const buttonClass = "min-h-12 rounded-xl border border-[var(--border)] px-5 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";
const validInput = (value: string) => /^(0|[1-9]\d*)$/.test(value) && Number.isSafeInteger(Number(value));

function reducer(screen: Screen, action: ScreenAction): Screen {
  if (action.type === "START") return { match: action.match, notice: "Practice match started. Scores live only in this tab." };
  if (action.type === "RESET") return { match: startNewPracticeMatch(), notice: "Practice match cleared." };
  if (!screen.match) return screen;
  const result = applyPracticeAction(screen.match, action.command);
  if (!result.ok) return { ...screen, notice: result.reason === "CONFLICT" ? "This action was not counted. Check the score and try again." : "Correction unavailable. Check the scores and confirmed set history." };
  const labels: Record<PracticeAction["type"], string> = {
    AWARD: "Point recorded.", UNDO: "Last point corrected.", SUBTRACT: "Point subtracted. Check serving team.",
    CORRECT_POINTS: "Current points corrected. Check serving team.", CORRECT_SERVE: "Serving team corrected.",
    CORRECT_SET: "Confirmed set result corrected.", CORRECT_CURRENT_SET: "Previous set reopened for correction.",
    CONFIRM_SET: "Set confirmed.",
  };
  return { match: result.state, notice: result.replayed ? "Repeated action ignored." : labels[action.command.type] };
}

function overlayDisplay(match: PracticeMatch): OverlayDisplay {
  const set = match.sets.at(-1)!;
  const team = (side: Side) => {
    const name = side === "A" ? match.teamA : match.teamB;
    return { name, short: name.split(/\s+/).map((part) => part[0]).join("").slice(0, 3).toUpperCase(),
      points: side === "A" ? set.teamA : set.teamB, sets: setsWon(match, side),
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
  const [editor, setEditor] = useState<Editor>(null);
  const [draftA, setDraftA] = useState("");
  const [draftB, setDraftB] = useState("");
  const [setNumber, setSetNumber] = useState(1);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const match = screen.match;
  const current = match?.sets.at(-1);
  const winner = match && current ? setWinner(current, match.bestOf) : null;
  const confirmed = match?.sets.filter((set) => set.winner) ?? [];

  function send(command: CommandInput) {
    if (!match) return;
    dispatch({ type: "COMMAND", command: { ...command, id: crypto.randomUUID(), expectedRevision: match.revision } as PracticeAction });
  }
  function start() {
    try { dispatch({ type: "START", match: createPracticeMatch(teamA, teamB, bestOf, serve) }); setError(""); setEditor(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Invalid match settings."); }
  }
  function openEditor(next: Editor) {
    if (!match || !current) return;
    setEditor(next); setSetNumber(next === "current" ? current.number - 1 : 1);
    setDraftA(String(next === "sets" ? match.sets[0].teamA : current.teamA));
    setDraftB(String(next === "sets" ? match.sets[0].teamB : current.teamB));
    setReason(""); setError("");
  }
  function chooseSet(value: number) {
    if (!match) return;
    const set = match.sets[value - 1];
    if (!set) return;
    setSetNumber(value); setDraftA(String(set.teamA)); setDraftB(String(set.teamB)); setReason(""); setError("");
  }
  function saveCorrection() {
    if (!match || !current || !editor) return;
    if (editor !== "current" && (!validInput(draftA) || !validInput(draftB))) { setError("Enter whole, nonnegative, safe point values for both teams."); return; }
    if (!reason.trim()) { setError("Enter a correction reason."); return; }
    if (editor === "points") {
      if (!window.confirm(`Replace current points ${current.teamA}–${current.teamB} with ${draftA}–${draftB}? The set remains unconfirmed and serving team stays ${match.serving}.`)) return;
      send({ type: "CORRECT_POINTS", teamA: Number(draftA), teamB: Number(draftB), reason });
    } else if (editor === "sets") {
      const old = match.sets[setNumber - 1];
      if (!old) return;
      const proposed = setWinner({ ...old, teamA: Number(draftA), teamB: Number(draftB) }, match.bestOf);
      if (!proposed || !validFinalSet({ ...old, teamA: Number(draftA), teamB: Number(draftB) }, match.bestOf)) { setError("The winning score must be 25 (15 in a deciding set), or exactly two above the opponent after deuce."); return; }
      if (!window.confirm(`Correct confirmed set ${setNumber} from ${old.teamA}–${old.teamB} (${old.winner}) to ${draftA}–${draftB} (${proposed})? ${proposed !== old.winner ? "This changes the winner. " : ""}Later sets stay unchanged; incompatible match history is rejected.`)) return;
      send({ type: "CORRECT_SET", setNumber, teamA: Number(draftA), teamB: Number(draftB), reason });
    } else {
      if (!window.confirm(`Reopen set ${setNumber}? The empty current set will be removed and the previous confirmed result will become pending again. This action is recorded in this tab.`)) return;
      send({ type: "CORRECT_CURRENT_SET", setNumber, reason });
    }
    setEditor(null); setError("");
  }

  return <div className="space-y-6">
    <header><p className="eyebrow text-[var(--blue)]">DEVELOPMENT / PRACTICE</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Practice scorekeeper</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">Fictional teams only. Scores and correction history stay in this tab, disappear on refresh, and do not update OBS or any database.</p></header>
    {!match ? <section aria-label="Practice match setup" className="rounded-2xl border border-[var(--border)] bg-[var(--paper)] p-5 sm:p-7">
      <h2 className="text-xl font-semibold">Start a practice match</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">Team A<input className={inputClass} maxLength={80} value={teamA} onChange={(event) => setTeamA(event.target.value)} /></label>
        <label className="text-sm font-semibold">Team B<input className={inputClass} maxLength={80} value={teamB} onChange={(event) => setTeamB(event.target.value)} /></label>
        <label className="text-sm font-semibold">Format<select className={inputClass} value={bestOf} onChange={(event) => setBestOf(Number(event.target.value) as Format)}><option value={3}>Best of 3</option><option value={5}>Best of 5</option></select></label>
        <label className="text-sm font-semibold">First serve<select className={inputClass} value={serve} onChange={(event) => setServe(event.target.value as Side)}><option value="A">Team A</option><option value="B">Team B</option></select></label>
      </div>
      {error && <p role="alert" className="mt-4 text-sm font-semibold text-red-600">{error}</p>}
      <button type="button" onClick={start} className="mt-6 min-h-12 rounded-xl bg-[#2455cf] px-6 font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Start practice</button>
    </section> : <>
      <section aria-label="Practice match score" className="rounded-2xl border border-[var(--border)] bg-[var(--paper)] p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">{match.status === "COMPLETED" ? "Practice match complete" : `Set ${current?.number} of ${match.bestOf}`}</h2><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-900">Not saved · Not live</span></div>
        <p className="mt-2 text-sm font-semibold">Sets won: {match.teamA} {setsWon(match, "A")} · {match.teamB} {setsWon(match, "B")}</p>
        <p role="status" aria-live="polite" className="mt-3 text-sm font-medium text-[var(--muted)]">{winner && match.status === "LIVE" ? current && validFinalSet(current, match.bestOf) ? `Set winner pending confirmation: ${winner === "A" ? match.teamA : match.teamB}. ` : "Winning margin reached, but the final score is invalid. Edit points before confirming. " : ""}{screen.notice}</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">{(["A", "B"] as Side[]).map((side) => {
          const name = side === "A" ? match.teamA : match.teamB;
          const score = side === "A" ? current?.teamA : current?.teamB;
          return <div key={side} className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--subtle)] p-5">
            <h3 className="truncate text-lg font-bold" title={name}>{name}</h3>
            <p className="mt-1 min-h-5 text-sm text-[var(--muted)]">{match.serving === side && match.status === "LIVE" ? "● Serving" : " "}</p>
            <p className="tabular mt-3 text-6xl font-black" aria-label={`${name} points`}>{score}</p>
            <button type="button" disabled={!!winner || match.status === "COMPLETED"} onClick={() => send({ type: "AWARD", team: side })} aria-label={`Award one point to ${name}`} className="mt-5 min-h-16 w-full rounded-xl bg-[#2455cf] px-5 text-xl font-black text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-40">+1 Point</button>
            <button type="button" disabled={score === 0 || match.status === "COMPLETED"} onClick={() => send({ type: "SUBTRACT", team: side })} aria-label={`Subtract one point from ${name}`} className={`${buttonClass} mt-3 min-h-14 w-full text-lg disabled:opacity-40`}>−1 Point</button>
          </div>;
        })}</div>
        <div className="mt-5 flex flex-wrap gap-3">
          {winner && match.status === "LIVE" && current && <button type="button" disabled={!validFinalSet(current, match.bestOf)} onClick={() => { if (window.confirm(`Confirm set ${current.number} for ${winner === "A" ? match.teamA : match.teamB}?`)) send({ type: "CONFIRM_SET" }); }} className="min-h-12 rounded-xl bg-[#2455cf] px-5 font-bold text-white disabled:opacity-40">Confirm set</button>}
          <button type="button" onClick={() => { if (window.confirm("Start a new practice match? This clears the current in-memory points, sets, serving state and correction history. It cannot be undone.")) dispatch({ type: "RESET" }); }} className={`${buttonClass} border-red-300 text-red-700 dark:text-red-300`}>Start New Practice Match</button>
        </div>
        <div className="mt-6 border-t border-[var(--border)] pt-4"><h3 className="text-sm font-bold uppercase tracking-wide">Set history</h3><ol className="mt-2 flex flex-wrap gap-2">{match.sets.map((set) => <li key={set.number} className="rounded-lg bg-[var(--subtle)] px-3 py-2 text-sm">Set {set.number}: {set.teamA}–{set.teamB}{set.winner ? ` · ${set.winner === "A" ? match.teamA : match.teamB} won` : " · Current"}</li>)}</ol></div>
      </section>
      <section aria-label="Practice corrections" className="rounded-2xl border border-[var(--border)] bg-[var(--paper)] p-4 sm:p-6">
        <h2 className="text-xl font-semibold">Corrections</h2><p className="mt-2 text-sm text-[var(--muted)]">In-memory only. Point corrections do not infer serving order. Confirmed sets and completed matches restrict changes.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" disabled={match.status === "COMPLETED"} onClick={() => openEditor("points")} className={buttonClass}>Edit Points</button>
          <button type="button" disabled={!confirmed.length} onClick={() => openEditor("sets")} className={buttonClass}>Edit Set Results</button>
          <button type="button" disabled={match.status === "COMPLETED"} onClick={() => openEditor("current")} className={buttonClass}>Edit Current Set</button>
        </div>
        {match.status === "LIVE" && <label className="mt-5 block max-w-sm text-sm font-semibold">Serving team<select className={inputClass} value={match.serving} onChange={(event) => { const serving = event.target.value as Side; if (serving !== match.serving && window.confirm(`Set serving team to ${serving === "A" ? match.teamA : match.teamB}?`)) send({ type: "CORRECT_SERVE", serving, reason: "Manual serving correction" }); }}><option value="A">{match.teamA}</option><option value="B">{match.teamB}</option></select></label>}
        {editor && <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--subtle)] p-4">
          <h3 className="text-lg font-bold">{editor === "points" ? "Edit current points" : editor === "sets" ? "Edit confirmed set result" : "Reopen previous set"}</h3>
          {editor === "sets" && <label className="mt-3 block max-w-sm text-sm font-semibold">Confirmed set<select className={inputClass} value={setNumber} onChange={(event) => chooseSet(Number(event.target.value))}>{confirmed.map((set) => <option key={set.number} value={set.number}>Set {set.number}: {set.teamA}–{set.teamB} · {set.winner === "A" ? match.teamA : match.teamB} won</option>)}</select></label>}
          {editor === "current" ? <p className="mt-3 text-sm">Set numbers follow confirmed results. You can reopen set {current && current.number > 1 ? current.number - 1 : "—"} only while the current set is empty. Other transitions require an explicit history reconciliation workflow.</p> : <div className="mt-3 grid max-w-xl gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold">{match.teamA} points<input type="number" min="0" step="1" inputMode="numeric" className={inputClass} value={draftA} onChange={(event) => setDraftA(event.target.value)} /></label>
            <label className="text-sm font-semibold">{match.teamB} points<input type="number" min="0" step="1" inputMode="numeric" className={inputClass} value={draftB} onChange={(event) => setDraftB(event.target.value)} /></label>
          </div>}
          <label className="mt-3 block max-w-xl text-sm font-semibold">Correction reason<input className={inputClass} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
          {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
          <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={editor === "current" && (current?.number === 1 || current?.teamA !== 0 || current?.teamB !== 0)} onClick={saveCorrection} className={`${buttonClass} disabled:opacity-40`}>Review correction</button><button type="button" onClick={() => { setEditor(null); setError(""); }} className={buttonClass}>Cancel</button></div>
        </div>}
      </section>
      <section aria-label="Practice overlay appearance"><h2 className="mb-3 text-lg font-semibold">Scorebug appearance in this tab</h2><OverlayPreview display={overlayDisplay(match)} embedded /><p className="mt-3 text-xs text-[var(--muted)]">The separate OBS preview URL remains static. This scorebug is only a local visual check.</p></section>
    </>}
  </div>;
}
