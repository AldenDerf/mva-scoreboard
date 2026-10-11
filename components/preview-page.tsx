import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div><span className="eyebrow text-[var(--blue)]">{eyebrow}</span><h1 className="mt-2 text-3xl font-semibold tracking-[-.045em] sm:text-4xl">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)] sm:text-base">{description}</p></div>
      <Badge tone="amber">Development sample</Badge>
    </div>
  );
}

export function EmptyPreview({ title, description, href, linkLabel }: { title: string; description: string; href?: string; linkLabel?: string }) {
  return (
    <Card className="flex min-h-[310px] flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-[#e8efff] text-2xl text-[#2455cf] dark:bg-[#1c3765] dark:text-blue-100" aria-hidden="true">□</div>
      <h2 className="text-xl font-semibold tracking-[-.03em]">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">{description}</p>
      {href && linkLabel && <Link href={href} className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-[#2455cf] px-5 text-sm font-semibold text-white hover:bg-[#1b44ad]">{linkLabel} <span className="ml-2" aria-hidden="true">→</span></Link>}
    </Card>
  );
}
