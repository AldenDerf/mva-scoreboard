import type { HTMLAttributes, ReactNode } from "react";

export function Card({ children, className = "", ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return <div {...props} className={`rounded-2xl border border-[var(--border)] bg-[var(--paper)] shadow-[0_8px_32px_-24px_rgba(10,38,84,.35)] ${className}`}>{children}</div>;
}
