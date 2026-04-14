import * as React from "react";
import { cn } from "@/lib/utils";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost" | "destructive" | "accent";
};

export function Button({ className, variant = "default", ...props }: ButtonProps) {
  const base = "inline-flex h-9 items-center justify-center rounded-lg px-4 text-sm font-medium transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 select-none";

  const variants: Record<string, string> = {
    default:     "bg-[var(--bm-bg3)] text-[var(--bm-text)] border border-[var(--bm-border2)] hover:bg-[var(--bm-bg4)] hover:border-[var(--bm-border3)]",
    accent:      "bg-[var(--bm-accent)] text-[var(--bm-text-inv)] hover:bg-[var(--bm-accent2)] font-semibold",
    outline:     "border border-[var(--bm-border2)] bg-transparent text-[var(--bm-text2)] hover:bg-[var(--bm-bg3)]",
    ghost:       "text-[var(--bm-text2)] hover:bg-[var(--bm-bg3)] hover:text-[var(--bm-text)]",
    destructive: "bg-[rgba(240,108,108,0.12)] text-[var(--bm-red)] border border-[rgba(240,108,108,0.2)] hover:bg-[rgba(240,108,108,0.2)]",
  };

  return (
    <button
      className={cn(base, variants[variant], className)}
      {...props}
    />
  );
}
