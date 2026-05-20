import type { ReactNode } from "react";

export function SectionHeader({ label, action }: { label: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="font-mono text-[11px] font-normal uppercase tracking-[0.06em] text-[var(--bm-text3)]">
        {label}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export default SectionHeader;
