import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-[var(--bm-border2)] bg-white/5 px-2.5 py-1 text-xs font-medium bm-text2",
        className
      )}
      {...props}
    />
  );
}
