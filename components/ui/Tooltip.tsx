"use client";

import type { ReactNode } from "react";

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return <span className="group relative inline-flex">{children}<span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-[var(--r-sm)] border border-[var(--bm-border2)] bg-[var(--bm-bg4)] px-2 py-1 font-mono text-[10px] text-[var(--bm-text2)] shadow-lg group-hover:block">{label}</span></span>;
}
