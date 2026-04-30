"use client";

/**
 * components/WeeklyReportCard.tsx — LinkedIn-Ready Weekly Report Card
 *
 * A visually impressive, shareable card that founders want to post.
 * Renders the weekly report data as a polished artifact — not a dashboard.
 *
 * Features:
 *   - "Share to LinkedIn" generates a formatted text post with the report data
 *   - "Download card" triggers a browser print/screenshot of just the card
 *   - Momentum arc + week-over-week delta
 *   - Stage progress timeline
 *   - Brutally honest assessment (the viral hook)
 *
 * Used inside /app/reports/page.tsx — Builder plan only.
 */

import { useRef } from "react";
import { motion } from "framer-motion";

type ReportData = {
  summary: string;
  intention_vs_action: string;
  biggest_gap: string;
  next_week_focus: string;
  honest_assessment: string;
  momentum_score: number;
};

type Props = {
  report: ReportData;
  projectTitle: string;
  stage: string;
  tasksCompleted: number;
  tasksTotal: number;
  streak: number;
  weekNumber: number;
};

const STAGE_ORDER = ["Idea", "Validation", "MVP", "Launch", "Growth", "Revenue"];

function getWeekNumber(): number {
  const d = new Date();
  const j = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - j.getTime()) / 86400000 + j.getDay() + 1) / 7);
}

function MomentumArc({ score, size = 140 }: { score: number; size?: number }) {
  const stroke = 9;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const color = score >= 70 ? "#4ade80" : score >= 40 ? "#fbbf24" : "#f87171";
  const label = score >= 70 ? "Strong" : score >= 40 ? "Building" : "Critical";

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        <motion.circle
          cx={size/2} cy={size/2} r={r} fill="none"
          stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - (score / 100) * circ }}
          transition={{ duration: 1.4, ease: "easeOut", delay: 0.2 }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <motion.span
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
          style={{ fontSize: size * 0.22, fontWeight: 700, color, lineHeight: 1, letterSpacing: "-0.04em" }}
        >
          {score}
        </motion.span>
        <span style={{ fontSize: size * 0.09, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 3 }}>
          {label}
        </span>
      </div>
    </div>
  );
}

function StageTimeline({ stage }: { stage: string }) {
  const normalized = STAGE_ORDER.find(s => stage.toLowerCase().includes(s.toLowerCase())) ?? stage;
  const idx = STAGE_ORDER.indexOf(normalized);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
      {STAGE_ORDER.map((s, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <div key={s} style={{ display: "flex", alignItems: "center" }}>
            <div style={{
              width: active ? 28 : 18,
              height: active ? 28 : 18,
              borderRadius: "50%",
              background: done ? "#4ade80" : active ? "#818cf8" : "rgba(255,255,255,0.08)",
              border: active ? "2px solid #818cf8" : "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.3s",
            }}>
              {done && <span style={{ fontSize: 10, color: "#000", fontWeight: 700 }}>✓</span>}
              {active && <span style={{ fontSize: 9, color: "#fff", fontWeight: 700 }}>{i + 1}</span>}
            </div>
            {i < STAGE_ORDER.length - 1 && (
              <div style={{
                width: 20, height: 2,
                background: done ? "#4ade80" : "rgba(255,255,255,0.08)",
                transition: "background 0.3s",
              }} />
            )}
          </div>
        );
      })}
      <span style={{ marginLeft: 10, fontSize: 11, color: "#818cf8", fontWeight: 600 }}>{normalized}</span>
    </div>
  );
}

function buildLinkedInPost(report: ReportData, props: Props): string {
  const pct = props.tasksTotal > 0
    ? Math.round((props.tasksCompleted / props.tasksTotal) * 100)
    : 0;

  return `Week ${props.weekNumber} building ${props.projectTitle} in public 🧵

📊 Momentum score: ${report.momentum_score}/100
✅ Tasks completed: ${props.tasksCompleted}/${props.tasksTotal} (${pct}%)
🔥 Builder streak: ${props.streak} days

This week's honest assessment:
"${report.honest_assessment}"

Biggest gap I'm closing next week:
→ ${report.next_week_focus}

Building with @buildmind_io — it forces you to be honest with yourself every week.

#buildinpublic #solofounder #startuplife #founder`;
}

export default function WeeklyReportCard({
  report, projectTitle, stage, tasksCompleted, tasksTotal, streak, weekNumber,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const pct = tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : 0;
  const pColor = pct >= 70 ? "#4ade80" : pct >= 40 ? "#fbbf24" : "#f87171";

  const handleShareLinkedIn = () => {
    const text = buildLinkedInPost(report, { report, projectTitle, stage, tasksCompleted, tasksTotal, streak, weekNumber });
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent("https://buildmind.live")}&summary=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  const handleShareTwitter = () => {
    const text = buildLinkedInPost(report, { report, projectTitle, stage, tasksCompleted, tasksTotal, streak, weekNumber });
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text.slice(0, 280))}`, "_blank");
  };

  return (
    <div>
      {/* The card itself */}
      <motion.div
        ref={cardRef}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        style={{
          background: "linear-gradient(145deg, #0f0f1a 0%, #13131f 50%, #0a0a14 100%)",
          border: "1px solid rgba(129,140,248,0.2)",
          borderRadius: 16,
          padding: "24px 28px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Background grid */}
        <div style={{
          position: "absolute", inset: 0, opacity: 0.03,
          backgroundImage: "linear-gradient(rgba(129,140,248,1) 1px, transparent 1px), linear-gradient(90deg, rgba(129,140,248,1) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          pointerEvents: "none",
        }} />

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, position: "relative" }}>
          <div>
            <div style={{ fontSize: 10, color: "rgba(129,140,248,0.7)", fontFamily: "monospace", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
              buildmind · week {weekNumber} report
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#f0f0f5", letterSpacing: "-0.03em" }}>
              {projectTitle}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "monospace", letterSpacing: "0.08em" }}>
              {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </div>
            {streak > 0 && (
              <div style={{ fontSize: 12, color: "#fbbf24", marginTop: 4, fontWeight: 600 }}>
                🔥 {streak}d streak
              </div>
            )}
          </div>
        </div>

        {/* Stage timeline */}
        <div style={{ marginBottom: 20, position: "relative" }}>
          <StageTimeline stage={stage} />
        </div>

        {/* Metrics row */}
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 20, alignItems: "center", marginBottom: 20, position: "relative" }}>
          <MomentumArc score={report.momentum_score} />

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Task completion bar */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "monospace", letterSpacing: "0.07em" }}>TASK COMPLETION</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: pColor, fontFamily: "monospace" }}>{pct}%</span>
              </div>
              <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 1.1, ease: "easeOut", delay: 0.4 }}
                  style={{ height: "100%", background: pColor, borderRadius: 2 }}
                />
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 3, fontFamily: "monospace" }}>
                {tasksCompleted} of {tasksTotal} tasks
              </div>
            </div>

            {/* Summary */}
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.6, margin: 0 }}>
              {report.summary}
            </p>
          </div>
        </div>

        {/* Insights — 2 column grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16, position: "relative" }}>
          {[
            { label: "Biggest gap", value: report.biggest_gap, color: "#f87171" },
            { label: "Next week focus", value: report.next_week_focus, color: "#4ade80" },
          ].map((item) => (
            <div key={item.label} style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 10,
              padding: "12px 14px",
            }}>
              <div style={{ fontSize: 9, color: item.color, fontFamily: "monospace", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6, fontWeight: 600 }}>
                {item.label}
              </div>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.55, margin: 0 }}>
                {item.value.slice(0, 120)}{item.value.length > 120 ? "..." : ""}
              </p>
            </div>
          ))}
        </div>

        {/* Honest assessment — the viral hook */}
        <div style={{
          background: "rgba(239,68,68,0.05)",
          border: "1px solid rgba(239,68,68,0.15)",
          borderRadius: 10,
          padding: "14px 16px",
          position: "relative",
        }}>
          <div style={{ fontSize: 9, color: "#f87171", fontFamily: "monospace", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8, fontWeight: 600 }}>
            honest assessment
          </div>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", lineHeight: 1.65, margin: 0, fontStyle: "italic" }}>
            "{report.honest_assessment}"
          </p>
        </div>

        {/* Watermark */}
        <div style={{ marginTop: 16, textAlign: "right", position: "relative" }}>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.15)", fontFamily: "monospace", letterSpacing: "0.05em" }}>
            buildmind.live
          </span>
        </div>
      </motion.div>

      {/* Share buttons — outside the card */}
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button
          onClick={handleShareLinkedIn}
          style={{
            flex: 1, padding: "10px 0", borderRadius: 8,
            background: "rgba(10,102,194,0.12)",
            border: "1px solid rgba(10,102,194,0.3)",
            color: "#60a5fa", fontSize: 12, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Share to LinkedIn ↗
        </button>
        <button
          onClick={handleShareTwitter}
          style={{
            flex: 1, padding: "10px 0", borderRadius: 8,
            background: "rgba(29,161,242,0.08)",
            border: "1px solid rgba(29,161,242,0.2)",
            color: "#93c5fd", fontSize: 12, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Share to X ↗
        </button>
        <button
          onClick={() => window.print()}
          style={{
            padding: "10px 16px", borderRadius: 8,
            background: "transparent",
            border: "1px solid var(--bm-border)",
            color: "var(--bm-text2)", fontSize: 12,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
