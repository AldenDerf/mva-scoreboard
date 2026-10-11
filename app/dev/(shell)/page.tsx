import Link from "next/link";
import { PageHeading } from "@/components/preview-page";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export default function DashboardPreview() {
  return (
    <>
      <PageHeading eyebrow="WORKSPACE OVERVIEW" title="Dashboard" description="A foundation for match day operations. Real activity appears here only after authentication, permissions, and data services are implemented." />
      <Card className="overflow-hidden">
        <div className="grid lg:grid-cols-[1.25fr_.75fr]">
          <div className="p-6 sm:p-9">
            <Badge tone="blue">Getting started</Badge>
            <h2 className="mt-5 max-w-lg text-2xl font-semibold tracking-[-.04em] sm:text-3xl">Build a match from the first whistle.</h2>
            <p className="mt-3 max-w-lg text-sm leading-7 text-[var(--muted)]">Explore the guided setup with development-only sample teams. Nothing entered here is saved or sent to MVA.</p>
            <Link href="/dev/matches/new" className="mt-7 inline-flex min-h-11 items-center rounded-xl bg-[#2455cf] px-5 text-sm font-semibold text-white hover:bg-[#1b44ad]">Preview match setup <span className="ml-2" aria-hidden="true">→</span></Link>
          </div>
          <div className="flex flex-col justify-center border-t border-[var(--border)] bg-[var(--subtle)] p-6 sm:p-9 lg:border-l lg:border-t-0">
            <span className="eyebrow text-[var(--muted)]">MATCH FLOW</span>
            <ol className="mt-5 space-y-4 text-sm font-medium text-[var(--ink)]">
              {[["01", "Select tournament"], ["02", "Choose division & teams"], ["03", "Set rules"], ["04", "Review for broadcast"]].map(([number, label]) => <li key={number} className="flex items-center gap-4"><span className="font-mono text-xs text-[var(--blue)]">{number}</span><span>{label}</span></li>)}
            </ol>
          </div>
        </div>
      </Card>
      <div className="mt-7 grid gap-4 md:grid-cols-2">
        <Card className="p-6"><span className="eyebrow text-[var(--blue)]">MATCHES</span><h2 className="mt-3 text-lg font-semibold">No match records connected</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">The live match list will appear after the database and authorization work is approved.</p><Link href="/dev/matches" className="mt-5 inline-block text-sm font-semibold text-[var(--blue)] underline underline-offset-4">View matches preview</Link></Card>
        <Card className="p-6"><span className="eyebrow text-[var(--blue)]">BROADCAST</span><h2 className="mt-3 text-lg font-semibold">See the scorebug design</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">A visual-only overlay with clearly marked sample scores and no live connection.</p><Link href="/dev/overlay" className="mt-5 inline-block text-sm font-semibold text-[var(--blue)] underline underline-offset-4">Open overlay preview</Link></Card>
      </div>
    </>
  );
}
