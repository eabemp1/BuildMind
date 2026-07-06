"use client";

/**
 * components/charts/DotHeatmap.tsx
 *
 * Generalized from app/reports/page.tsx's DotCalendar. Same visual output
 * for the existing call site (pass no extra props), but now reusable for
 * any "which days had activity" surface — e.g. an Agent Workforce run
 * history heatmap — via the optional title/legend props.
 */

export interface DotHeatmapProps {
  /** "YYYY-MM-DD" strings for days considered active. */
  activeDays: string[];
  /** Current streak length, shown as a flame badge when > 0. */
  streak?: number;
  /** Header label. Default "Activity — Last 4 Weeks". */
  title?: string;
  /** Legend label for inactive cells. Default "No activity". */
  inactiveLabel?: string;
  /** Legend label for active cells. Default "Active". */
  activeLabel?: string;
}

export function DotHeatmap({
  activeDays,
  streak = 0,
  title = "Activity — Last 4 Weeks",
  inactiveLabel = "No activity",
  activeLabel = "Active",
}: DotHeatmapProps) {
  const activeSet = new Set(activeDays);
  const today = new Date();
  // Build 28 days, starting from 27 days ago, Mon-aligned
  const days: Array<{ iso: string; isActive: boolean; isToday: boolean; label: string }> = [];
  for (let i = 27; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = d.toLocaleDateString("en-CA");
    days.push({
      iso,
      isActive: activeSet.has(iso),
      isToday: i === 0,
      label: d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }),
    });
  }
  const weekDayLabels = ["M", "T", "W", "T", "F", "S", "S"];
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--bm-text2)" }}>{title}</span>
        {streak > 0 && (
          <span style={{ fontSize: 11, color: "var(--bm-amber)", fontWeight: 700 }}>
            🔥 {streak}d streak
          </span>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 16px)", gap: 3, marginBottom: 4 }}>
        {weekDayLabels.map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 8, color: "var(--bm-text4)", fontWeight: 600, width: 16 }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 16px)", gap: 3 }}>
        {days.map((day, i) => (
          <div
            key={i}
            title={`${day.label}${day.isActive ? " — active" : ""}`}
            style={{
              width: 16,
              height: 16,
              borderRadius: 3,
              background: day.isToday
                ? "var(--bm-accent)"
                : day.isActive
                  ? "rgba(92,200,138,0.75)"
                  : "var(--bm-bg3)",
              boxShadow: day.isActive && !day.isToday ? "0 0 4px rgba(92,200,138,0.3)" : "none",
              border: day.isToday ? "1px solid var(--bm-accent)" : "1px solid transparent",
              transition: "transform 0.1s",
              cursor: "default",
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, justifyContent: "flex-end" }}>
        <div style={{ width: 8, height: 8, borderRadius: 2, background: "var(--bm-bg3)" }} />
        <span style={{ fontSize: 9, color: "var(--bm-text4)" }}>{inactiveLabel}</span>
        <div style={{ width: 8, height: 8, borderRadius: 2, background: "rgba(92,200,138,0.55)" }} />
        <span style={{ fontSize: 9, color: "var(--bm-text4)" }}>{activeLabel}</span>
        <div style={{ width: 8, height: 8, borderRadius: 2, background: "var(--bm-accent)" }} />
        <span style={{ fontSize: 9, color: "var(--bm-text4)" }}>Today</span>
      </div>
    </div>
  );
}

/** Drop-in alias matching the old local name at the DotCalendar call site. */
export function DotCalendar(props: DotHeatmapProps) {
  return <DotHeatmap {...props} />;
}
