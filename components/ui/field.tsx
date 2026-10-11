import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

type Common = { label: string; id: string; hint?: string; error?: string; trailing?: ReactNode };

export function Field({ label, id, hint, error, trailing, className = "", ...props }: Common & InputHTMLAttributes<HTMLInputElement>) {
  const descriptionId = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold text-[var(--ink)]">{label}</label>
      <div className="relative">
        <input id={id} aria-invalid={!!error} aria-describedby={descriptionId} {...props} className={`min-h-12 w-full rounded-xl border bg-[var(--paper)] px-4 text-[15px] text-[var(--ink)] placeholder:text-[var(--muted)] hover:border-[#a9b9d3] focus:border-[var(--blue)] focus:outline-none focus:ring-3 focus:ring-[#6da4ff40] ${error ? "border-red-500" : "border-[var(--border)]"} ${trailing ? "pr-16" : ""} ${className}`} />
        {trailing && <div className="absolute inset-y-0 right-2 flex items-center">{trailing}</div>}
      </div>
      {error ? <p id={descriptionId} className="text-sm text-red-600 dark:text-red-300">{error}</p> : hint ? <p id={descriptionId} className="text-xs text-[var(--muted)]">{hint}</p> : null}
    </div>
  );
}

export function SelectField({ label, id, hint, error, children, className = "", ...props }: Common & SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  const descriptionId = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold text-[var(--ink)]">{label}</label>
      <select id={id} aria-invalid={!!error} aria-describedby={descriptionId} {...props} className={`min-h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--paper)] px-4 text-[15px] text-[var(--ink)] hover:border-[#a9b9d3] focus:border-[var(--blue)] focus:outline-none focus:ring-3 focus:ring-[#6da4ff40] ${className}`}>{children}</select>
      {error ? <p id={descriptionId} className="text-sm text-red-600 dark:text-red-300">{error}</p> : hint ? <p id={descriptionId} className="text-xs text-[var(--muted)]">{hint}</p> : null}
    </div>
  );
}
