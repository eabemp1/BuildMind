import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-[var(--bm-border)] pb-6 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[18px] font-semibold tracking-[-0.025em] text-[var(--bm-text)]">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-[3px] max-w-2xl text-[13px] leading-[1.5] text-[var(--bm-text3)]">
            {subtitle}
          </p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </header>
  );
}

export default PageHeader;
