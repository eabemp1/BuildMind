import * as React from "react";
import { cn } from "@/lib/utils";

export type GlowCardProps = React.HTMLAttributes<HTMLDivElement> & {
  interactive?: boolean;
};

export default function GlowCard({ className, interactive, ...props }: GlowCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-white/10 bg-[#0f172a] shadow-[0_0_20px_rgba(99,102,241,0.15)] transition duration-300 ease-out hover:-translate-y-1 hover:shadow-xl hover:shadow-[0_0_30px_rgba(99,102,241,0.25)]",
        interactive ? "cursor-pointer" : "",
        className,
      )}
      {...props}
    />
  );
}
