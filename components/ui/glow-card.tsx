import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * GlowCard — DEPRECATED. Use the bm-card pattern or <Card> directly.
 * This shim exists only to avoid breaking imports during migration.
 * It no longer uses rounded-[var(--r-xl)], or shadow-accent.
 */
export type GlowCardProps = React.HTMLAttributes<HTMLDivElement> & {
  interactive?: boolean;
};

export default function GlowCard({ className, interactive, ...props }: GlowCardProps) {
  return (
    <div
      className={cn(
        "border border-[var(--bm-border)] bg-[var(--bm-bg2)] transition-colors duration-150",
        "rounded-[var(--r-lg)]",
        interactive && "cursor-pointer hover:border-[var(--bm-border2)]",
        className,
      )}
      {...props}
    />
  );
}
