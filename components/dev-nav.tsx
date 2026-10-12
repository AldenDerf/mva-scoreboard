"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { label: "Dashboard", href: "/dev", glyph: "▦" },
  { label: "Matches", href: "/dev/matches", glyph: "▤" },
  { label: "New Match", href: "/dev/matches/new", glyph: "+" },
  { label: "Practice Scoring", href: "/dev/practice", glyph: "1" },
  { label: "Match History", href: "/dev/history", glyph: "◷" },
  { label: "Scorekeepers", href: "/dev/scorekeepers", glyph: "♧" },
  { label: "Settings", href: "/dev/settings", glyph: "⚙" },
] as const;

export function DevNav({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label={mobile ? "Mobile preview navigation" : "Preview navigation"} className={mobile ? "-mx-5 flex gap-1 overflow-x-auto px-5 pb-2 sm:-mx-8 sm:px-8 lg:hidden" : "hidden flex-col gap-1 lg:flex"}>
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={mobile
            ? `flex min-h-11 shrink-0 items-center rounded-lg px-3 text-sm font-semibold ${active ? "bg-[#e8efff] text-[#1b44ad] dark:bg-[#1c3765] dark:text-blue-100" : "text-[var(--muted)] hover:bg-[var(--subtle)]"}`
            : `flex min-h-11 items-center gap-3 rounded-xl px-4 text-sm font-medium transition-colors ${active ? "bg-[#173e83] text-white" : "text-blue-100/65 hover:bg-white/10 hover:text-white"}`}>
            {!mobile && <span className="flex size-5 items-center justify-center text-base" aria-hidden="true">{item.glyph}</span>}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
