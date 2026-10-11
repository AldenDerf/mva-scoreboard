import type { ReactNode } from "react";

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "blue" | "amber" }) {
  const tones = {
    neutral: "border-[var(--border)] bg-[var(--subtle)] text-[var(--muted)]",
    blue: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-200",
    amber: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200",
  };
  return <span className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.1em] ${tones[tone]}`}>{children}</span>;
}
