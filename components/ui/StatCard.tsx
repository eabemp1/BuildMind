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
    <Card className="p-4 shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--bm-border)] bg-[var(--bm-bg3)]">
          <Icon size={20} style={{ color }} />
        </div>
        {delta ? (
          <span className="rounded-full border border-[var(--bm-border)] bg-[var(--bm-bg3)] px-2 py-1 text-[11px] text-[var(--bm-text3)]">
            {delta}
          </span>
        ) : null}
      </div>
      <div className="mt-4 text-[10px] font-bold uppercase tracking-widest text-[var(--bm-text3)]">
        {label}
      </div>
      <div className="mt-1 text-[24px] font-bold leading-none text-[var(--bm-text)]">
        {value}
      </div>
    </Card>
  );
}

export default StatCard;
