import { Card } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  delta,
  color = "var(--bm-accent)",
}: {
  label: string;
  value: string | number;
  delta?: string;
  color?: string;
}) {
  return (
    <Card style={{ padding: "12px 14px", borderRadius: "var(--r-lg)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div
          style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            color: color !== "var(--bm-accent)" ? color : "var(--bm-text)",
            lineHeight: 1,
          }}
        >
          {value}
        </div>
        {delta ? (
          <span
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 9,
              color: "var(--bm-text3)",
              padding: "2px 6px",
              border: "1px solid var(--bm-border)",
              borderRadius: "var(--r-sm)",
              flexShrink: 0,
            }}
          >
            {delta}
          </span>
        ) : null}
      </div>
      <div
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "0.10em",
          color: "var(--bm-text3)",
          marginTop: 8,
        }}
      >
        {label}
      </div>
    </Card>
  );
}

export default StatCard;
