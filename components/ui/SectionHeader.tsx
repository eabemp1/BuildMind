import type { ReactNode } from "react";

export function SectionHeader({ label, action }: { label: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--bm-text3)]">
        {label}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export default SectionHeader;
