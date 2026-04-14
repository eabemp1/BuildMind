import * as React from "react";
import { cn } from "@/lib/utils";

export type GlowCardProps = React.HTMLAttributes<HTMLDivElement> & {
  interactive?: boolean;
};

export default function GlowCard({ className, interactive, ...props }: GlowCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--bm-border2)] bg-[var(--bm-bg2)] transition-all duration-200 ease-out",
        interactive && "cursor-pointer hover:-translate-y-0.5 hover:border-[var(--bm-accent-bd)] hover:shadow-[var(--shadow-accent)]",
        className,
      )}
      {...props}
    />
  );
}
