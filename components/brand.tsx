import Link from "next/link";

export function Brand({ inverse = false, compact = false }: { inverse?: boolean; compact?: boolean }) {
  return (
    <Link href="/" className={`inline-flex w-fit items-center gap-3 rounded-lg ${inverse ? "text-white" : "text-[var(--ink)]"}`} aria-label="MVA Live Scoreboard home">
      <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${inverse ? "bg-white text-[#0c2a63]" : "bg-[#0b2b65] text-white"}`} aria-hidden="true">
        <svg viewBox="0 0 32 32" fill="none" className="size-7" stroke="currentColor" strokeWidth="2.2">
          <circle cx="16" cy="16" r="12" />
          <path d="M5 12c7 1 12 6 13 15M9 6c2 7 8 10 18 10M23 6c-6 4-8 11-5 21" />
        </svg>
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-[15px] font-bold tracking-[-.025em]">MVA <span className={inverse ? "text-blue-200" : "text-[var(--blue)]"}>Live Scoreboard</span></span>
        {!compact && <span className={`mt-0.5 text-[10px] font-semibold uppercase tracking-[.16em] ${inverse ? "text-blue-200/65" : "text-[var(--muted)]"}`}>Mahatao Volleyball Association</span>}
      </span>
    </Link>
  );
}
