"use client";

/**
 * components/WeeklyReportCard.tsx — v3 Beautiful & Shareable
 *
 * Fixes issue #7: redesigned as a genuine shareable artifact.
 * - Print CSS for PDF export (beautiful in print, not a debug dump)
 * - CSV export option
 * - LinkedIn / X share
 * - Celadon brand palette
 * - Clean data hierarchy
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
  // REC 6.2: intention vs execution rate headline
  intention_vs_execution_rate?: number;
  execution_trend?: "up" | "down" | "flat";
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

// Celadon-aligned palette
const C = {
  celadon:   "#A8D5BA",
  celadonDim: "rgba(168,213,186,0.12)",
  celadonBd:  "rgba(168,213,186,0.22)",
  bg:        "#0d0d14",
  bg2:       "#111118",
  card:      "rgba(18,18,26,0.97)",
  text1:     "#f0f0f6",
  text2:     "#9090a8",
  text3:     "#45455a",
  green:     "#4ade80",
  amber:     "#fbbf24",
  red:       "#f87171",
  indigo:    "#818cf8",
};

function MomentumArc({ score, size = 130 }: { score: number; size?: number }) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const color = score >= 70 ? C.green : score >= 40 ? C.amber : C.red;
  const label = score >= 70 ? "Strong" : score >= 40 ? "Building" : "Critical";
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={stroke} />
        <motion.circle
          cx={size/2} cy={size/2} r={r} fill="none"
          stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - (score / 100) * circ }}
          transition={{ duration: 1.4, ease: "easeOut", delay: 0.3 }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <motion.span
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}
          style={{ fontSize: size * 0.23, fontWeight: 800, color, lineHeight: 1, letterSpacing: "-0.04em" }}
        >
          {score}
        </motion.span>
        <span style={{ fontSize: size * 0.1, color: C.text2, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>
          {label}
        </span>
      </div>
    </div>
  );
}

function StageBar({ stage }: { stage: string }) {
  const norm = STAGE_ORDER.find(s => stage.toLowerCase().includes(s.toLowerCase())) ?? stage;
  const idx = STAGE_ORDER.indexOf(norm);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {STAGE_ORDER.map((s, i) => {
        const done = i < idx;
        const active = i === idx;
        const dot = done ? C.green : active ? C.celadon : "rgba(255,255,255,0.08)";
        return (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <div style={{
                width: active ? 8 : 6, height: active ? 8 : 6, borderRadius: "50%",
                background: dot,
                boxShadow: active ? `0 0 8px ${C.celadon}80` : "none",
                transition: "all 0.25s",
              }} />
              <span style={{ fontSize: 8, color: active ? C.celadon : C.text3, fontWeight: active ? 700 : 400, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
                {s}
              </span>
            </div>
            {i < STAGE_ORDER.length - 1 && (
              <div style={{ width: 22, height: 1, background: done ? C.green : "rgba(255,255,255,0.07)", marginBottom: 10, transition: "background 0.3s" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function buildShareText(report: ReportData, props: Props): string {
  const pct = props.tasksTotal > 0 ? Math.round((props.tasksCompleted / props.tasksTotal) * 100) : 0;
  const momentumDir = report.momentum_score >= 60 ? "↑ above average" : report.momentum_score >= 40 ? "at average" : "↓ below average";

  // Audit v8 PROD #5: a real "build in public" card — honest, specific, shareable.
  // "14-day streak. 3 tasks completed. BuildMind told me I was avoiding sales
  //  conversations for 2 weeks. I wasn't ready to hear it."
  const avoPattern = (report as Record<string, unknown>).avoidance_pattern as string | undefined;
  const avoidanceLine = avoPattern
    ? `

Hard truth from my AI co-founder:
"${avoPattern}"`
    : "";

  return `Week ${props.weekNumber} — ${props.projectTitle} (${props.stage} stage) 🧵

📊 Momentum: ${report.momentum_score}/100 — ${momentumDir} for my stage
✅ ${props.tasksCompleted} of ${props.tasksTotal} tasks completed (${pct}%)
${props.streak > 0 ? `🔥 ${props.streak}-day streak` : ""}${avoidanceLine}

Next week:
→ ${report.next_week_focus}

Not using vibes. Using behavioral data.
buildmind.live — AI that knows how you actually build.

#buildinpublic #solofounder #startuplife`;
}

function buildCSV(report: ReportData, props: Props): string {
  const pct = props.tasksTotal > 0 ? Math.round((props.tasksCompleted / props.tasksTotal) * 100) : 0;
  const rows = [
    ["Week", props.weekNumber],
    ["Project", props.projectTitle],
    ["Stage", props.stage],
    ["Momentum Score", report.momentum_score],
    ["Tasks Completed", props.tasksCompleted],
    ["Tasks Total", props.tasksTotal],
    ["Completion %", pct],
    ["Streak (days)", props.streak],
    ["Summary", report.summary],
    ["Intention vs Action", report.intention_vs_action],
    ["Biggest Gap", report.biggest_gap],
    ["Next Week Focus", report.next_week_focus],
    ["Honest Assessment", report.honest_assessment],
  ];
  return rows.map(([k, v]) => `"${k}","${String(v).replace(/"/g, '""')}"`).join("\n");
}

export default function WeeklyReportCard({
  report, projectTitle, stage, tasksCompleted, tasksTotal, streak, weekNumber,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const pct = tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : 0;
  const pColor = pct >= 70 ? C.green : pct >= 40 ? C.amber : C.red;
  const dateStr = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const handlePrint = () => {
    const printStyles = `
      @page { size: A4 portrait; margin: 0; }
      @media print {
        body * { visibility: hidden !important; }
        #bm-report-card, #bm-report-card * { visibility: visible !important; }
        #bm-report-card {
          position: fixed !important;
          top: 0 !important; left: 0 !important;
          width: 100vw !important; height: 100vh !important;
          margin: 0 !important; padding: 40px !important;
          box-sizing: border-box !important;
          background: #0d0d14 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .bm-no-print { display: none !important; }
      }
    `;
    const style = document.createElement("style");
    style.textContent = printStyles;
    document.head.appendChild(style);
    window.print();
    document.head.removeChild(style);
  };

  const handleCSV = () => {
    const csv = buildCSV(report, { report, projectTitle, stage, tasksCompleted, tasksTotal, streak, weekNumber });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `buildmind-week-${weekNumber}-${projectTitle.replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLinkedIn = () => {
    const text = buildShareText(report, { report, projectTitle, stage, tasksCompleted, tasksTotal, streak, weekNumber });
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent("https://buildmind.live")}&summary=${encodeURIComponent(text)}`, "_blank");
  };

  const handleX = () => {
    const text = buildShareText(report, { report, projectTitle, stage, tasksCompleted, tasksTotal, streak, weekNumber });
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text.slice(0, 270))}`, "_blank");
  };

  return (
    <div>
      {/* ── Print-safe report card ── */}
      <motion.div
        id="bm-report-card"
        ref={cardRef}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        style={{
          background: "linear-gradient(145deg, #0d0d14 0%, #111118 60%, #0a0a10 100%)",
          border: `1px solid ${C.celadonBd}`,
          borderRadius: 20,
          padding: "32px 36px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Subtle grid texture */}
        <div style={{
          position: "absolute", inset: 0, opacity: 0.025,
          backgroundImage: `linear-gradient(${C.celadon} 1px, transparent 1px), linear-gradient(90deg, ${C.celadon} 1px, transparent 1px)`,
          backgroundSize: "36px 36px", pointerEvents: "none",
        }} />

        {/* Celadon glow top-right */}
        <div style={{
          position: "absolute", top: -60, right: -60,
          width: 200, height: 200, borderRadius: "50%",
          background: `radial-gradient(circle, ${C.celadonDim} 0%, transparent 70%)`,
          pointerEvents: "none",
        }} />

        {/* ── Header ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, position: "relative" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              {/* Logo mark */}
              <svg viewBox="0 0 20 20" width={16} height={16} fill="none">
                <circle cx="5" cy="10" r="2" fill={C.celadon} opacity="0.9" />
                <circle cx="10" cy="6" r="2" fill={C.celadon} opacity="0.7" />
                <circle cx="10" cy="14" r="2" fill={C.celadon} opacity="0.7" />
                <circle cx="15" cy="10" r="2" fill={C.celadon} opacity="0.5" />
                <line x1="7" y1="10" x2="8" y2="6" stroke={C.celadon} strokeWidth="1" opacity="0.5" />
                <line x1="7" y1="10" x2="8" y2="14" stroke={C.celadon} strokeWidth="1" opacity="0.5" />
                <line x1="12" y1="6" x2="13" y2="10" stroke={C.celadon} strokeWidth="1" opacity="0.4" />
              </svg>
              <span style={{ fontSize: 10, color: C.celadon, fontFamily: "monospace", letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.8 }}>
                BuildMind · Week {weekNumber} Report
              </span>
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text1, letterSpacing: "-0.03em", margin: 0, lineHeight: 1.1 }}>
              {projectTitle}
            </h1>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 11, color: C.text3, fontFamily: "monospace", marginBottom: 4 }}>{dateStr}</div>
            {streak > 0 && (
              <div style={{ fontSize: 12, color: C.amber, fontWeight: 700 }}>🔥 {streak}-day streak</div>
            )}
          </div>
        </div>

        {/* ── Stage progress ── */}
        <div style={{ marginBottom: 24, padding: "14px 16px", background: "rgba(255,255,255,0.02)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ fontSize: 9, color: C.text3, fontFamily: "monospace", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
            Stage Progress
          </div>
          <StageBar stage={stage} />
        </div>

        {/* ── Metrics grid ── */}
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 20, alignItems: "center", marginBottom: 22, position: "relative" }}>
          <MomentumArc score={report.momentum_score} />

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Task bar */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: C.text3, fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase" }}>Task Completion</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: pColor, fontFamily: "monospace" }}>{pct}%</span>
              </div>
              <div style={{ height: 5, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
                <motion.div
                  initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                  transition={{ duration: 1.1, ease: "easeOut", delay: 0.5 }}
                  style={{ height: "100%", background: `linear-gradient(90deg, ${pColor} 0%, ${pColor}aa 100%)`, borderRadius: 3 }}
                />
              </div>
              <div style={{ fontSize: 10, color: C.text3, marginTop: 4, fontFamily: "monospace" }}>
                {tasksCompleted} of {tasksTotal} tasks completed
              </div>
            </div>

            {/* Summary */}
            <p style={{ fontSize: 12.5, color: C.text2, lineHeight: 1.65, margin: 0 }}>
              {report.summary}
            </p>
          </div>
        </div>

        {/* ── Intention vs Action ── */}
        {report.intention_vs_action && (
          <div style={{ marginBottom: 14, padding: "14px 16px", background: "rgba(168,213,186,0.04)", border: `1px solid ${C.celadonBd}`, borderRadius: 12 }}>
            <div style={{ fontSize: 9, color: C.celadon, fontFamily: "monospace", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6, fontWeight: 700 }}>
              Intention vs Reality
            </div>
            <p style={{ fontSize: 12.5, color: C.text2, lineHeight: 1.6, margin: 0 }}>{report.intention_vs_action}</p>
          </div>
        )}

        {/* ── Insights 2-col ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          {[
            { label: "Biggest Gap", value: report.biggest_gap, color: C.red },
            { label: "Next Week Focus", value: report.next_week_focus, color: C.green },
          ].map(item => (
            <div key={item.label} style={{
              background: "rgba(255,255,255,0.025)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 12, padding: "14px 15px",
            }}>
              <div style={{ fontSize: 9, color: item.color, fontFamily: "monospace", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 7, fontWeight: 700 }}>
                {item.label}
              </div>
              <p style={{ fontSize: 12, color: C.text2, lineHeight: 1.6, margin: 0 }}>
                {item.value.slice(0, 140)}{item.value.length > 140 ? "…" : ""}
              </p>
            </div>
          ))}
        </div>

        {/* ── Honest assessment (viral hook) ── */}
        <div style={{
          background: "rgba(248,113,113,0.05)",
          border: "1px solid rgba(248,113,113,0.18)",
          borderRadius: 12, padding: "16px 18px",
          position: "relative",
        }}>
          <div style={{ fontSize: 9, color: C.red, fontFamily: "monospace", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 9, fontWeight: 700 }}>
            Honest Assessment
          </div>
          <p style={{ fontSize: 13.5, color: C.text1, lineHeight: 1.7, margin: 0, fontStyle: "italic", fontWeight: 400 }}>
            "{report.honest_assessment}"
          </p>
        </div>

        {/* ── Watermark ── */}
        <div style={{ marginTop: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 10, color: C.text3, fontFamily: "monospace" }}>
            Generated with BuildMind
          </div>
          <div style={{ fontSize: 10, color: C.celadon, fontFamily: "monospace", opacity: 0.5 }}>
            buildmind.live
          </div>
        </div>
      </motion.div>

      {/* ── Visual share card (Audit v8 PROD #5) ── */}
      <motion.div className="bm-no-print"
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
        style={{ marginTop: 14, background: "linear-gradient(135deg, #0F0F10 0%, #161618 100%)", border: "1px solid rgba(92,200,138,0.22)", borderRadius: 12, padding: "16px 20px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -24, right: -24, width: 120, height: 120, borderRadius: "50%", background: "radial-gradient(circle, rgba(92,200,138,0.12) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: "rgba(92,200,138,0.55)", marginBottom: 10, textTransform: "uppercase" }}>
          Week {weekNumber} · {projectTitle}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: report.next_week_focus ? 10 : 0 }}>
          <div>
            <span style={{ fontSize: 28, fontWeight: 800, color: "#ECECEC", letterSpacing: "-0.04em" }}>{report.momentum_score}</span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginLeft: 3 }}>/100</span>
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 1.7 }}>
            {tasksCompleted}/{tasksTotal} tasks complete{streak > 0 && <><br /><span style={{ color: "#E8A020" }}>🔥 {streak}-day streak</span></>}
          </div>
        </div>
        {report.next_week_focus && (
          <div style={{ fontSize: 10, color: "rgba(92,200,138,0.65)", borderTop: "1px solid rgba(92,200,138,0.1)", paddingTop: 8 }}>
            Next: {report.next_week_focus.slice(0, 90)}{report.next_week_focus.length > 90 ? "…" : ""}
          </div>
        )}
        <div style={{ position: "absolute", bottom: 8, right: 12, fontSize: 8, color: "rgba(255,255,255,0.12)", fontWeight: 700, letterSpacing: "0.08em" }}>BUILDMIND.LIVE</div>
      </motion.div>

      {/* ── Action buttons (hidden on print) ── */}
      <div className="bm-no-print" style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        {/* Share */}
        <button onClick={handleLinkedIn} style={{
          flex: 1, minWidth: 120, padding: "10px 0", borderRadius: 9,
          background: "rgba(10,102,194,0.1)", border: "1px solid rgba(10,102,194,0.25)",
          color: "#60a5fa", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
        }}>
          Share LinkedIn ↗
        </button>
        <button onClick={handleX} style={{
          flex: 1, minWidth: 100, padding: "10px 0", borderRadius: 9,
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
          color: C.text2, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
        }}>
          Share X ↗
        </button>

        {/* Export */}
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button onClick={handlePrint} style={{
            padding: "10px 16px", borderRadius: 9,
            background: C.celadonDim, border: `1px solid ${C.celadonBd}`,
            color: C.celadon, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}>
            Print / PDF
          </button>
          <button onClick={handleCSV} style={{
            padding: "10px 16px", borderRadius: 9,
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
            color: C.text2, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}>
            Export CSV
          </button>
        </div>
      </div>
    </div>
  );
}
