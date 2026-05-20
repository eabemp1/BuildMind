import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

export function StatCard({
  icon: Icon,
  label,
  value,
  delta,
  color = "var(--bm-accent)",
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  delta?: string;
  color?: string;
}) {
  return (
    <Card className="p-4 rounded-[10px] border border-[var(--bm-border)] bg-[var(--bm-bg2)] shadow-none">
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md border border-[var(--bm-border)] bg-[var(--bm-bg3)]">
          <Icon size={20} style={{ color }} />
        </div>
        {delta ? (
          <span className="rounded border border-[var(--bm-border)] bg-[var(--bm-bg3)] px-2 py-1 font-mono text-[11px] text-[var(--bm-text3)]">
            {delta}
          </span>
        ) : null}
      </div>
      <div className="mt-4 text-[11px] font-normal uppercase tracking-[0.05em] text-[var(--bm-text3)]">
        {label}
      </div>
      <div className="mt-1 text-[26px] font-light leading-none tracking-[-0.04em] text-[var(--bm-text)] [font-variant-numeric:tabular-nums]">
        {value}
      </div>
    </Card>
  );
}

export default StatCard;
