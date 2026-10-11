type Team = { name: string; short: string; points: number; sets: number; serving: boolean };

const teams: Team[] = [
  { name: "North Shore Spikers", short: "NS", points: 23, sets: 1, serving: true },
  { name: "The Lighthouse Collective", short: "LC", points: 21, sets: 0, serving: false },
];

export function OverlayPreview() {
  return (
    <main className="overlay-preview flex min-h-screen w-full items-end p-[clamp(16px,3.5vw,68px)] text-white" aria-label="Development-only scoreboard overlay preview">
      <div className="overlay-scorebug w-full max-w-[710px] overflow-hidden rounded-2xl bg-[#061735]/95 shadow-[0_24px_70px_rgba(0,0,0,.32)] ring-1 ring-white/20">
        <div className="overlay-head flex flex-wrap items-center justify-between gap-2 border-b border-white/15 bg-[#123772] px-4 py-2.5 sm:px-6">
          <div className="min-w-0"><span className="overlay-event mr-3 text-[10px] font-bold uppercase tracking-[.18em] text-blue-200">Sample Coastal Cup</span><span className="overlay-event text-[10px] font-semibold uppercase tracking-[.12em] text-white/70">Open Division</span></div>
          <span className="overlay-preview-label shrink-0 rounded bg-amber-300 px-2 py-1 text-[10px] font-black uppercase tracking-[.1em] text-[#352800]">Preview · Not live</span>
        </div>
        <div className="overlay-columns grid grid-cols-[minmax(0,1fr)_54px_70px] px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-[.14em] text-blue-200/70 sm:grid-cols-[minmax(0,1fr)_70px_94px] sm:px-6"><span>Teams</span><span className="text-center">Sets</span><span className="text-center">Points</span></div>
        {teams.map((team, index) => <div key={team.short} className={`overlay-team-row grid grid-cols-[minmax(0,1fr)_54px_70px] items-center gap-0 px-4 py-2 sm:grid-cols-[minmax(0,1fr)_70px_94px] sm:px-6 ${index === 0 ? "border-b border-white/12" : ""}`}>
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <span className="overlay-logo flex size-10 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-xs font-black text-blue-100 sm:size-12" aria-label={`${team.name} logo placeholder`}>{team.short}</span>
            <div className="min-w-0"><div className="overlay-team-name truncate text-[clamp(.9rem,2.2vw,1.35rem)] font-bold tracking-[-.03em]" title={team.name}>{team.name}</div>{team.serving && <div className="overlay-serving mt-0.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-amber-300"><span className="size-1.5 rounded-full bg-amber-300" aria-hidden="true" />Serving</div>}</div>
          </div>
          <div className="overlay-sets tabular text-center text-xl font-semibold text-blue-200 sm:text-2xl">{team.sets}</div>
          <div className="overlay-points tabular text-center text-4xl font-bold tracking-[-.08em] sm:text-5xl">{team.points}</div>
        </div>)}
        <div className="overlay-foot flex items-center justify-between gap-3 border-t border-white/15 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[.16em] text-blue-200/80 sm:px-6"><span>Set 2 · Best of 3</span><span>MVA Live Scoreboard</span></div>
      </div>
    </main>
  );
}
