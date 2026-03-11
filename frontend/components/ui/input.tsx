import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-zinc-100 outline-none ring-0 transition placeholder:text-zinc-500 focus:border-indigo-400/60",
        className
      )}
      {...props}
    />
  );
}
