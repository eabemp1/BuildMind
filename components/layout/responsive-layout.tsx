import type { ReactNode } from "react";

export function ResponsiveGrid({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={["grid gap-4 sm:grid-cols-2 lg:gap-6", className].join(" ")}>{children}</div>;
}

export function SplitLayout({ main, aside, className = "" }: { main: ReactNode; aside?: ReactNode; className?: string }) {
  return <div className={["grid gap-4 lg:grid-cols-[minmax(0,1fr)_304px] lg:gap-6", className].join(" ")}><div className="min-w-0">{main}</div>{aside ? <aside className="min-w-0 lg:sticky lg:top-4 lg:self-start">{aside}</aside> : null}</div>;
}

export function DetailPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={["rounded-[var(--r-lg)] border border-[var(--bm-border)] bg-[var(--bm-bg2)]", className].join(" ")}>{children}</section>;
}
