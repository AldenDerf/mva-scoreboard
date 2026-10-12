"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { StoredAction, StoredMatch } from "@/lib/db/scoreboard";
import { setWinner, validFinalSet } from "@/lib/scoring/practice";

type Pending = { actionId: string; expectedRevision: number; action: StoredAction };
type Editor = "points" | "sets" | "current" | null;
const button = "min-h-12 rounded-xl border border-[var(--border)] px-5 py-2 font-bold disabled:opacity-40";
const input = "mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-3";
const validPoints = (value: string) => /^(0|[1-9]\d*)$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) <= 2147483647;

export function LiveScorekeeper({ matchId }: { matchId: string }) {
  const [match, setMatch] = useState<StoredMatch | null>(null);
  const [notice, setNotice] = useState("Loading the latest server score…");
  const [stale, setStale] = useState(true);
  const [pending, setPending] = useState(false);
  const [retryPending, setRetryPending] = useState(false);
  const [editor, setEditor] = useState<Editor>(null);
  const [setNumber, setSetNumber] = useState(1);
  const [draftA, setDraftA] = useState("");
  const [draftB, setDraftB] = useState("");
  const pendingRef = useRef<Pending | null>(null);
  const busyRef = useRef(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/matches/${matchId}`, { cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 403 ? "Access denied." : "Could not verify the current score.");
      const body = await response.json() as { match: StoredMatch };
      setMatch(body.match); setStale(false);
      return body.match;
    } catch {
      setStale(true); setNotice("Connection lost. Scores may be stale; scoring is paused until the server can be checked.");
      return null;
    }
  }, [matchId]);
  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => { if (!busyRef.current && !pendingRef.current) void load(); }, 3000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [load]);
  async function submit(saved: Pending) {
    if (busyRef.current) return false;
    busyRef.current = true; setPending(true); setNotice("Saving action…");
    try {
      const response = await fetch(`/api/matches/${matchId}/actions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(saved),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: "Action failed." })) as { error?: string };
        if (response.status === 409 || response.status === 422 || response.status === 403) {
          pendingRef.current = null;
          setRetryPending(false);
          await load();
        } else { setStale(true); setRetryPending(true); }
        setNotice(body.error ?? "Action failed.");
        return false;
      }
      const result = await response.json() as { state: StoredMatch; replayed: boolean };
      pendingRef.current = null; setRetryPending(false); setMatch(result.state); setStale(false);
      setNotice(result.replayed ? "Repeated request resolved; current server score loaded." : "Saved on server.");
      return true;
    } catch {
      setStale(true);
      setRetryPending(true);
      setNotice("Save could not be verified. Retry the pending action; its ID prevents a duplicate score.");
      return false;
    } finally { busyRef.current = false; setPending(false); }
  }
  function command(action: StoredAction) {
    if (!match || pendingRef.current || busyRef.current || stale) return;
    const saved = { actionId: crypto.randomUUID(), expectedRevision: match.revision, action };
    pendingRef.current = saved;
    void submit(saved);
  }
  function retry() { if (pendingRef.current) void submit(pendingRef.current); else void load(); }
  function open(next: Editor) {
    if (!match) return;
    const current = match.sets.at(-1)!;
    setEditor(next);
    const selected = next === "sets" ? match.sets.find((set) => set.winner) ?? current : current;
    setSetNumber(next === "current" ? current.number - 1 : selected.number);
    setDraftA(String(selected.teamA)); setDraftB(String(selected.teamB)); setNotice("");
  }
  function chooseSet(number: number) {
    const selected = match?.sets.find((set) => set.number === number);
    if (!selected) return;
    setSetNumber(number); setDraftA(String(selected.teamA)); setDraftB(String(selected.teamB));
  }
  function save() {
    if (!match || !editor) return;
    const current = match.sets.at(-1)!;
    if (editor !== "current" && (!validPoints(draftA) || !validPoints(draftB))) {
      setNotice("Enter whole, nonnegative point values for both teams."); return;
    }
    let action: StoredAction;
    if (editor === "points") action = { type: "CORRECT_POINTS", teamA: Number(draftA), teamB: Number(draftB) };
    else if (editor === "sets") {
      const old = match.sets.find((set) => set.number === setNumber);
      if (!old) return;
      const proposed = { ...old, teamA: Number(draftA), teamB: Number(draftB), startingServe: "A" as const };
      const winner = setWinner(proposed, match.bestOf);
      if (!validFinalSet(proposed, match.bestOf)) { setNotice("Enter a valid final set score, winning by two."); return; }
      if (winner !== old.winner && !window.confirm(`Change the winner of set ${setNumber}? Later set history will remain and may make this correction invalid.`)) return;
      action = { type: "CORRECT_SET", setNumber, teamA: Number(draftA), teamB: Number(draftB) };
    } else {
      if (setNumber !== current.number - 1 || current.teamA !== 0 || current.teamB !== 0) {
        setNotice("Only the immediately previous confirmed set can be reopened while the current set is empty."); return;
      }
      if (!window.confirm(`Reopen set ${setNumber}? Its confirmed result becomes pending again.`)) return;
      action = { type: "CORRECT_CURRENT_SET", setNumber };
    }
    command(action); setEditor(null);
  }
  if (!match) return <main className="mx-auto max-w-5xl p-5"><div className="mb-4"><Link href="/matches" className="text-sm font-semibold text-[var(--blue)] hover:underline">← Back to matches</Link></div><h1 className="text-2xl font-bold">Match scorekeeper</h1><p role="status" className="mt-4">{notice}</p><button type="button" onClick={retry} className={button}>Retry</button></main>;
  const current = match.sets.at(-1)!;
  const pendingWinner = setWinner({ ...current, startingServe: current.startingServe ?? "A" }, match.bestOf);
  const wins = (side: "A" | "B") => match.sets.filter((set) => set.winner === side).length;
  const overlayUrl = typeof window !== "undefined" ? `${window.location.origin}/overlay/${match.publicId}` : `/overlay/${match.publicId}`;
  const disabled = pending || stale || retryPending;
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 text-[var(--ink)] sm:px-6">
    <header>
      <div className="mb-2"><Link href="/matches" className="text-sm font-semibold text-[var(--blue)] hover:underline">← Back to matches</Link></div>
      <p className="eyebrow text-[var(--blue)]">SERVER SCOREKEEPER {match.isTest ? "· TEST MATCH" : ""}</p>
      <h1 className="mt-2 text-3xl font-bold">{match.teamA} vs {match.teamB}</h1>
      <p className="mt-2 font-semibold">Set {match.currentSet} · Best of {match.bestOf} · {match.status}</p>
      <p className="mt-1 text-sm">Sets won: {match.teamA} {wins("A")} · {match.teamB} {wins("B")}</p>
      {match.status === "COMPLETED" && (
        <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 font-bold text-emerald-800 dark:text-emerald-200">
          Match Completed · {wins("A") > wins("B") ? match.teamA : match.teamB} won ({wins("A")}–{wins("B")})
        </div>
      )}
      <p role="status" aria-live="polite" className={`mt-3 rounded-lg p-3 text-sm font-semibold ${stale ? "bg-amber-100 text-amber-950" : "bg-[var(--subtle)]"}`}>{notice}</p>
      {stale && <button type="button" onClick={retry} disabled={pending} className={`${button} mt-2`}>{retryPending ? "Retry pending action" : "Reconnect"}</button>}
    </header>
    <section aria-label="Current score" className="grid gap-4 sm:grid-cols-2">{(["A", "B"] as const).map((side) => {
      const name = side === "A" ? match.teamA : match.teamB;
      const points = side === "A" ? current.teamA : current.teamB;
      return <div key={side} className="rounded-2xl border border-[var(--border)] bg-[var(--paper)] p-5">
        <h2 className="truncate text-xl font-bold" title={name}>{name}</h2>
        <p className="min-h-6 text-sm">{match.serving === side && match.status === "LIVE" ? "● Serving" : ""}</p>
        <p className="tabular my-4 text-7xl font-black" aria-label={`${name} points`}>{points}</p>
        <button type="button" disabled={disabled || match.status !== "LIVE" || Boolean(pendingWinner)} onClick={() => command({ type: "AWARD", team: side })} className={`${button} min-h-16 w-full bg-[#2455cf] text-xl text-white`}>+1 Point</button>
        <button type="button" disabled={disabled || match.status !== "LIVE" || points === 0} onClick={() => command({ type: "SUBTRACT", team: side })} className={`${button} mt-3 min-h-14 w-full`}>−1 Point</button>
      </div>;
    })}</section>
    {pendingWinner && match.status === "LIVE" && <button type="button" disabled={disabled || !validFinalSet({ ...current, startingServe: current.startingServe ?? "A" }, match.bestOf)}
      onClick={() => { if (window.confirm(`Confirm set ${current.number} for ${pendingWinner === "A" ? match.teamA : match.teamB}?`)) command({ type: "CONFIRM_SET" }); }}
      className={`${button} bg-[#2455cf] text-white`}>Confirm set</button>}
    <section aria-label="Corrections" className="rounded-2xl border border-[var(--border)] bg-[var(--paper)] p-5">
      <h2 className="text-xl font-bold">Corrections</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={disabled || match.status !== "LIVE"} onClick={() => open("points")} className={button}>Edit Points</button>
        <button type="button" disabled={disabled || !match.sets.some((set) => set.winner)} onClick={() => open("sets")} className={button}>Edit Set Results</button>
        <button type="button" disabled={disabled || match.status !== "LIVE"} onClick={() => open("current")} className={button}>Edit Current Set</button>
      </div>
      {match.status === "LIVE" && <label className="mt-4 block max-w-sm text-sm font-bold">Serving team<select disabled={disabled} className={input} value={match.serving} onChange={(event) => command({ type: "CORRECT_SERVE", serving: event.target.value as "A" | "B" })}><option value="A">{match.teamA}</option><option value="B">{match.teamB}</option></select></label>}
      {editor && <div className="mt-5 rounded-xl bg-[var(--subtle)] p-4">
        <h3 className="text-lg font-bold">{editor === "points" ? "Edit current points" : editor === "sets" ? "Edit completed set" : "Reopen previous set"}</h3>
        {editor === "sets" && <label className="mt-3 block max-w-sm text-sm font-bold">Completed set<select className={input} value={setNumber} onChange={(event) => chooseSet(Number(event.target.value))}>{match.sets.filter((set) => set.winner).map((set) => <option key={set.number} value={set.number}>Set {set.number}: {set.teamA}–{set.teamB}</option>)}</select></label>}
        {editor === "current" ? <p className="mt-3 text-sm">Only set {current.number > 1 ? current.number - 1 : "—"} can be reopened, and only before any action in the empty current set. Other set-number changes require history reconciliation.</p>
          : <div className="mt-3 grid max-w-xl gap-3 sm:grid-cols-2"><label className="text-sm font-bold">{match.teamA} points<input type="number" min="0" step="1" className={input} value={draftA} onChange={(event) => setDraftA(event.target.value)} /></label><label className="text-sm font-bold">{match.teamB} points<input type="number" min="0" step="1" className={input} value={draftB} onChange={(event) => setDraftB(event.target.value)} /></label></div>}
        <div className="mt-4 flex gap-2"><button type="button" disabled={disabled || (editor === "current" && (current.number <= 1 || current.teamA !== 0 || current.teamB !== 0))} onClick={save} className={`${button} bg-[#2455cf] text-white`}>Save</button><button type="button" onClick={() => setEditor(null)} className={button}>Cancel</button></div>
      </div>}
    </section>
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--paper)] p-5"><h2 className="text-lg font-bold">Set history</h2><ol className="mt-2 flex flex-wrap gap-2">{match.sets.map((set) => <li key={set.number} className="rounded-lg bg-[var(--subtle)] px-3 py-2 text-sm">Set {set.number}: {set.teamA}–{set.teamB}{set.winner ? ` · ${set.winner === "A" ? match.teamA : match.teamB} won` : " · Current"}</li>)}</ol></section>
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--paper)] p-5"><h2 className="text-lg font-bold">OBS overlay</h2><p className="mt-2 break-all text-sm">{overlayUrl}</p><button type="button" className={`${button} mt-3`} onClick={async () => { try { await navigator.clipboard.writeText(overlayUrl); setNotice("Overlay URL copied."); } catch { setNotice("Copy failed. Select the URL above."); } }}>Copy overlay URL</button></section>
  </main>;
}
