import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-[var(--bm-border)] pb-6 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 9,
              textTransform: "uppercase",
              letterSpacing: "0.10em",
              color: "var(--bm-text3)",
              marginBottom: 6,
            }}
          >
            {eyebrow}
          </p>
        ) : null}
        <h1
          style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: "-0.025em",
            color: "var(--bm-text)",
            lineHeight: 1.2,
            margin: 0,
          }}
        >
          {title}
        </h1>
        {subtitle ? (
          <p
            style={{
              marginTop: 6,
              fontSize: 12.5,
              lineHeight: 1.5,
              color: "var(--bm-text2)",
              maxWidth: "52rem",
              fontFamily: "'Inter', sans-serif",
            }}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </header>
  );
}

export default PageHeader;
