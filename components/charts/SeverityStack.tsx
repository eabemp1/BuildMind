"use client";

/**
 * components/charts/SeverityStack.tsx
 *
 * New component. Both Break My Startup's AttackRound[] (severity:
 * "low"|"medium"|"high"|"fatal") and Agent Workforce's findings
 * (top_risk, confidence-scored) currently render risk severity as plain
 * text/emoji inline in a paragraph. There's no "likelihood" field anywhere
 * in the schema, so rather than inventing a fake severity×likelihood matrix,
 * this renders what the data actually has: a proportion bar showing the
 * severity mix at a glance, plus a compact color-coded ranked list below it.
 */

export type Severity = "low" | "medium" | "high" | "fatal";

export interface SeverityItem {
  label: string;
  severity: Severity;
  note?: string;
}

const SEVERITY_ORDER: Severity[] = ["fatal", "high", "medium", "low"];

const SEVERITY_COLOR: Record<Severity, string> = {
  fatal: "#ef4444",
  high: "#f97316",
  medium: "#f59e0b",
  low: "#84cc16",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  fatal: "Fatal",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export function SeverityStack({ items, title = "Risk Severity" }: { items: SeverityItem[]; title?: string }) {
  if (items.length === 0) return null;
  const counts = SEVERITY_ORDER.reduce((acc, s) => {
    acc[s] = items.filter(i => i.severity === s).length;
    return acc;
  }, {} as Record<Severity, number>);
  const total = items.length;
  const sorted = [...items].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--bm-text2)" }}>{title}</span>
        <span style={{ fontSize: 10, color: "var(--bm-text4)" }}>{total} identified</span>
      </div>

      {/* proportion bar */}
      <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", marginBottom: 10 }}>
        {SEVERITY_ORDER.filter(s => counts[s] > 0).map(s => (
          <div
            key={s}
            title={`${SEVERITY_LABEL[s]}: ${counts[s]}`}
            style={{ width: `${(counts[s] / total) * 100}%`, background: SEVERITY_COLOR[s] }}
          />
        ))}
      </div>

      {/* legend */}
      <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        {SEVERITY_ORDER.filter(s => counts[s] > 0).map(s => (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: SEVERITY_COLOR[s] }} />
            <span style={{ fontSize: 10, color: "var(--bm-text3)" }}>
              {SEVERITY_LABEL[s]} ({counts[s]})
            </span>
          </div>
        ))}
      </div>

      {/* ranked list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {sorted.map((item, i) => (
          <div
            key={i}
            style={{
              borderLeft: `3px solid ${SEVERITY_COLOR[item.severity]}`,
              paddingLeft: 10,
              paddingTop: 2,
              paddingBottom: 2,
            }}
          >
            <div style={{ fontSize: 12, color: "var(--bm-text)", fontWeight: 500 }}>{item.label}</div>
            {item.note && (
              <div style={{ fontSize: 11, color: "var(--bm-text3)", marginTop: 2, lineHeight: 1.4 }}>{item.note}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
