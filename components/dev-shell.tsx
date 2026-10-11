import Link from "next/link";
import { Brand } from "@/components/brand";
import { Badge } from "@/components/ui/badge";
import { DevNav } from "@/components/dev-nav";

export function DevShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="hidden min-h-screen flex-col bg-[#071735] px-5 py-7 text-white lg:flex">
        <div className="px-2"><Brand inverse compact /></div>
        <div className="mt-12 px-4 text-[10px] font-bold uppercase tracking-[.18em] text-blue-200/45">Workspace</div>
        <div className="mt-3"><DevNav /></div>
        <div className="mt-auto rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-[.13em] text-blue-200">Development preview</p>
          <p className="mt-2 text-xs leading-5 text-blue-100/60">No account, matches, or production records are available here.</p>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="border-b border-[var(--border)] bg-[var(--paper)] px-5 py-4 sm:px-8 lg:px-10">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
            <div className="lg:hidden"><Brand compact /></div>
            <div className="hidden lg:block"><span className="eyebrow text-[var(--muted)]">MVA / OPERATIONS</span></div>
            <div className="flex items-center gap-3"><Badge tone="amber">Preview only</Badge><Link href="/dev/overlay" className="text-sm font-semibold text-[var(--blue)] underline underline-offset-4 hover:text-[var(--blue-hover)]">Overlay preview ↗</Link></div>
          </div>
          <div className="mx-auto mt-4 max-w-6xl lg:hidden"><DevNav mobile /></div>
        </header>
        <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-11">{children}</main>
      </div>
    </div>
  );
}
