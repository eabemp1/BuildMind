import * as React from "react";
import { cn } from "@/lib/utils";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost" | "destructive";
};

export function Button({ className, variant = "default", ...props }: ButtonProps) {
  const variants: Record<string, string> = {
    default: "bg-white/10 text-white hover:bg-white/20",
    outline: "border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10",
    ghost: "text-zinc-300 hover:bg-white/10",
    destructive: "bg-rose-600 text-white hover:bg-rose-500"
  };

  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium transition duration-200 hover:scale-105 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
