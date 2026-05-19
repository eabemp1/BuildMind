import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <Card className="flex min-h-[220px] flex-col items-center justify-center px-6 py-20 text-center">
      <Icon size={32} className="text-[var(--bm-text4)]" />
      <h3 className="mt-4 text-[15px] font-semibold text-[var(--bm-text2)]">{title}</h3>
      {body ? (
        <p className="mt-2 max-w-[280px] text-[13px] leading-relaxed text-[var(--bm-text3)]">
          {body}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </Card>
  );
}

export default EmptyState;
