"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SelectField } from "@/components/ui/field";
import { sampleTournaments } from "@/lib/dev/sample-catalog";

const steps = ["Tournament", "Division", "Teams", "Match settings", "Review"] as const;

export function MatchSetupPreview() {
  const [step, setStep] = useState(0);
  const [tournamentId, setTournamentId] = useState("");
  const [divisionId, setDivisionId] = useState("");
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [bestOf, setBestOf] = useState<3 | 5>(3);
  const [serve, setServe] = useState("A");
  const [message, setMessage] = useState("");

  const tournament = sampleTournaments.find((item) => item.id === tournamentId);
  const division = tournament?.divisions.find((item) => item.id === divisionId);
  const canContinue = [!!tournament, !!division, !!teamA && !!teamB && teamA !== teamB, true][step] ?? false;

  function chooseTournament(value: string) { setTournamentId(value); setDivisionId(""); setTeamA(""); setTeamB(""); setMessage(""); }
  function chooseDivision(value: string) { setDivisionId(value); setTeamA(""); setTeamB(""); setMessage(""); }
  function next() { if (!canContinue) { setMessage("Complete this step before continuing."); return; } setMessage(""); setStep((current) => Math.min(current + 1, 4)); }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-[var(--border)] bg-[var(--subtle)] px-5 py-5 sm:px-8">
        <Badge tone="amber">Fictional sample data</Badge>
        <ol aria-label="Match setup progress" className="mt-5 grid grid-cols-5 gap-2">
          {steps.map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined} className="min-w-0"><span className={`mb-2 block h-1.5 rounded-full ${index <= step ? "bg-[#2455cf]" : "bg-[var(--border)]"}`} /><span className={`block text-[10px] font-semibold leading-4 sm:text-xs ${step === index ? "text-[var(--ink)]" : "text-[var(--muted)]"}`}>{index + 1}. <span className="hidden sm:inline">{label}</span></span></li>)}
        </ol>
      </div>
      <div className="min-h-[340px] px-5 py-7 sm:px-8 sm:py-9">
        <span className="eyebrow text-[var(--blue)]">STEP {step + 1} OF 5</span>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-.04em]">{steps[step]}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">{[
          "Choose a fictional tournament to explore the planned workflow.",
          "Divisions depend on the selected sample tournament.",
          "Choose two different sample teams from this division.",
          "Preview the proposed set format and opening serve.",
          "Review the visual summary. Nothing here creates a match.",
        ][step]}</p>

        {step === 0 && <div className="mt-8 max-w-lg"><SelectField id="tournament" label="Tournament" value={tournamentId} onChange={(event) => chooseTournament(event.target.value)}><option value="">Select a sample tournament</option>{sampleTournaments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectField></div>}
        {step === 1 && <div className="mt-8 max-w-lg"><SelectField id="division" label="Division" value={divisionId} onChange={(event) => chooseDivision(event.target.value)}><option value="">Select a sample division</option>{tournament?.divisions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectField></div>}
        {step === 2 && <div className="mt-8 grid max-w-2xl gap-5 sm:grid-cols-2"><SelectField id="team-a" label="Team A" value={teamA} onChange={(event) => { setTeamA(event.target.value); setMessage(""); }}><option value="">Select Team A</option>{division?.teams.filter((team) => team !== teamB).map((team) => <option key={team} value={team}>{team}</option>)}</SelectField><SelectField id="team-b" label="Team B" value={teamB} onChange={(event) => { setTeamB(event.target.value); setMessage(""); }}><option value="">Select Team B</option>{division?.teams.filter((team) => team !== teamA).map((team) => <option key={team} value={team}>{team}</option>)}</SelectField></div>}
        {step === 3 && <div className="mt-8 grid max-w-2xl gap-5 sm:grid-cols-2"><SelectField id="best-of" label="Match format" value={bestOf} onChange={(event) => setBestOf(Number(event.target.value) as 3 | 5)}><option value={3}>Best of 3 sets</option><option value={5}>Best of 5 sets</option></SelectField><SelectField id="serve" label="Opening serve" value={serve} onChange={(event) => setServe(event.target.value)}><option value="A">Team A</option><option value="B">Team B</option></SelectField><p className="sm:col-span-2 text-xs leading-5 text-[var(--muted)]">Proposed defaults: regular sets to 25, deciding set to 15, win by two. Tournament policy remains subject to approval.</p></div>}
        {step === 4 && <div className="mt-8 max-w-2xl"><dl className="grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--subtle)] p-5 sm:grid-cols-2">{[["Tournament", tournament?.name], ["Division", division?.name], ["Team A", teamA], ["Team B", teamB], ["Format", `Best of ${bestOf}`], ["Opening serve", serve === "A" ? teamA : teamB]].map(([label, value]) => <div key={label}><dt className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</dt><dd className="mt-1 font-semibold text-[var(--ink)]">{value}</dd></div>)}</dl><p className="mt-4 text-sm font-medium text-amber-800 dark:text-amber-200">Review only. This preview cannot save or schedule a match.</p></div>}
        {message && <p role="alert" className="mt-5 text-sm font-medium text-red-600 dark:text-red-300">{message}</p>}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-5 sm:px-8"><Button type="button" variant="secondary" disabled={step === 0} onClick={() => { setStep((current) => Math.max(current - 1, 0)); setMessage(""); }}>Back</Button>{step < 4 ? <Button type="button" onClick={next}>Continue <span aria-hidden="true">→</span></Button> : <Button type="button" variant="secondary" onClick={() => setStep(0)}>Start over</Button>}</div>
    </Card>
  );
}
