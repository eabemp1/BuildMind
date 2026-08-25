import type { HTMLAttributes } from "react";

export function Divider({ label, className = "", ...props }: HTMLAttributes<HTMLDivElement> & { label?: string }) {
  if (!label) return <div role="separator" className={["h-px bg-[var(--bm-border)]", className].join(" ")} {...props} />;
  return <div className={["flex items-center gap-3", className].join(" ")} {...props}><div className="h-px flex-1 bg-[var(--bm-border)]" /><span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--bm-text4)]">{label}</span><div className="h-px flex-1 bg-[var(--bm-border)]" /></div>;
}
