import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  children: ReactNode;
};

export function Button({ variant = "primary", className = "", children, ...props }: Props) {
  const variants = {
    primary: "bg-[#2455cf] text-white hover:bg-[#1b44ad] disabled:bg-[#92a9df]",
    secondary: "border border-[var(--border)] bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--subtle)]",
    ghost: "text-[var(--ink)] hover:bg-[var(--subtle)]",
  };
  return (
    <button {...props} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-65 ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}
