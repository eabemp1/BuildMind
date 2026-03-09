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
      {label ? <p className="text-xs text-slate-500">{label}</p> : null}
      <div className="h-2 rounded-full bg-slate-100">
        <div className="h-2 rounded-full bg-slate-900 transition-all" style={{ width: `${safe}%` }} />
      </div>
    </div>
  );
}
