"use client";

import { useEffect, useState } from "react";
import { OverlayPreview, type OverlayDisplay } from "@/components/overlay-preview";
import type { OverlaySnapshot } from "@/lib/db/scoreboard";

function displayFor(state: OverlaySnapshot): OverlayDisplay {
  const current = state.sets.at(-1);
  const team = (side: "A" | "B") => {
    const name = side === "A" ? state.teamA : state.teamB;
    return { name, short: name.split(/\s+/).map((part) => part[0]).join("").slice(0, 3).toUpperCase(),
      points: side === "A" ? current?.teamA ?? 0 : current?.teamB ?? 0,
      sets: state.sets.filter((set) => set.winner === side).length,
      serving: state.status === "LIVE" && state.serving === side };
  };
  return { teams: [team("A"), team("B")], tournament: state.tournament,
    division: state.division, currentSet: state.currentSet, bestOf: state.bestOf,
    label: state.isTest ? "Test · Not official" : "MVA Live",
    status: state.status === "COMPLETED" ? "Final" : state.status };
}
export function LiveOverlay({ publicId }: { publicId: string }) {
  const [snapshot, setSnapshot] = useState<OverlaySnapshot | null>(null);
  const [status, setStatus] = useState("Loading scoreboard…");
  useEffect(() => {
    let stopped = false;
    let busy = false;
    async function refresh() {
      if (busy || stopped) return;
      busy = true;
      try {
        const response = await fetch(`/api/overlay/${publicId}`, { cache: "no-store" });
        if (response.status === 404) {
          setSnapshot(null); setStatus("Scoreboard unavailable."); stopped = true; return;
        }
        if (!response.ok) throw new Error("Temporary read failure");
        const body = await response.json() as { overlay: OverlaySnapshot };
        if (!stopped) { setSnapshot(body.overlay); setStatus(""); }
      } catch {
        if (!stopped) { setSnapshot(null); setStatus("Reconnecting to scoreboard…"); }
      } finally { busy = false; }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2500);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [publicId]);
  return <div className="live-overlay min-h-screen w-full">
    {snapshot ? <OverlayPreview display={displayFor(snapshot)} ariaLabel="Live read-only match scoreboard" /> :
      <p role="status" className="m-6 inline-block rounded-lg bg-[#061735]/95 px-4 py-2 text-sm font-semibold text-white">{status}</p>}
  </div>;
}
