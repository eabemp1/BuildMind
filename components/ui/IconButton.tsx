"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

export function IconButton({ label, children, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return <button type="button" aria-label={label} title={label} className={["inline-grid size-8 place-items-center rounded-[var(--r-md)] border border-[var(--bm-border)] bg-transparent text-[var(--bm-text3)] transition-colors hover:bg-[var(--bm-bg3)] hover:text-[var(--bm-text)] disabled:cursor-not-allowed disabled:opacity-40", className].join(" ")} {...props}>{children}</button>;
}
