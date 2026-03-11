import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

export function Input({ className, type, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  const isPassword = type === "password";
  const [revealed, setRevealed] = React.useState(false);
  const resolvedType = isPassword ? (revealed ? "text" : "password") : type;

  const inputClass = cn(
    "h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-zinc-100 outline-none ring-0 transition placeholder:text-zinc-500 focus:border-indigo-400/60",
    isPassword && "pr-10",
    className,
  );

  if (!isPassword) {
    return <input className={inputClass} type={resolvedType} {...props} />;
  }

  return (
    <div className="relative w-full">
      <input className={inputClass} type={resolvedType} {...props} />
      <button
        type="button"
        aria-label={revealed ? "Hide password" : "Show password"}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
        onClick={() => setRevealed((prev) => !prev)}
        disabled={props.disabled}
      >
        {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
