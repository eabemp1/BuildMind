import { cn } from "@/lib/utils";

type ProgressBarProps = {
  value: number;
  label?: string;
  className?: string;
};

export default function ProgressBar({ value, label, className }: ProgressBarProps) {
  const safe = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("space-y-1", className)}>
      {label ? <p className="text-xs text-zinc-500">{label}</p> : null}
      <div className="h-2 rounded-full bg-white/10">
        <div
          className="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-[width] duration-500 ease-out"
          style={{ width: `${safe}%` }}
        />
      </div>
    </div>
  );
}
