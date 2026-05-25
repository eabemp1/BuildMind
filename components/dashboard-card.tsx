import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type DashboardCardProps = {
  title: string;
  value: string;
  trend?: string;
  icon?: React.ReactNode;
  helper?: string;
  tone?: "neutral" | "positive" | "warning";
};

export default function DashboardCard({
  title,
  value,
  helper,
  trend,
  icon,
  tone = "neutral",
}: DashboardCardProps) {
  const toneColor =
    tone === "positive"
      ? "var(--bm-green)"
      : tone === "warning"
      ? "var(--bm-amber)"
      : "var(--bm-text2)";

  const dotColor =
    tone === "positive"
      ? "var(--bm-green)"
      : tone === "warning"
      ? "var(--bm-amber)"
      : "var(--bm-text4)";

  return (
    <Card style={{ padding: "14px 16px", borderRadius: "var(--r-lg)" }}>
      <p
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "0.10em",
          color: "var(--bm-text3)",
          marginBottom: 12,
        }}
      >
        {title}
      </p>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontFamily: "'Syne', sans-serif",
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: "-0.03em",
                color: "var(--bm-text)",
              }}
            >
              {value}
            </span>
            {icon ? <span style={{ color: "var(--bm-accent)" }}>{icon}</span> : null}
          </div>
          {trend ? (
            <p
              style={{
                marginTop: 4,
                fontFamily: "'DM Mono', monospace",
                fontSize: 9,
                color: "var(--bm-text3)",
              }}
            >
              {trend}
            </p>
          ) : null}
        </div>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: dotColor,
            flexShrink: 0,
            marginBottom: 4,
          }}
        />
      </div>
      {helper ? (
        <p style={{ marginTop: 10, fontSize: 12, color: toneColor, lineHeight: 1.5 }}>
          {helper}
        </p>
      ) : null}
    </Card>
  );
}
