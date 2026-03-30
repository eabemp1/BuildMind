"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { getFounderWeeklyReport, type FounderWeeklyReportData } from "@/lib/api";
import { FEATURES } from "@/lib/features";

const card = { background: "#0d0d0d", border: "1px solid #1c1c1c", borderRadius: 10, overflow: "hidden" as const };
const sectionHead = { padding: "10px 16px", borderBottom: "1px solid #111", background: "#080808", fontSize: 10, textTransform: "uppercase" as const, letterSpacing: "0.09em" };

function MirrorGauge({ committed, completed }: { committed: number; completed: number }) {
  const gap = Math.max(0, committed - completed);
  const pct = committed > 0 ? Math.round((completed / committed) * 100) : 0;
  const color = pct >= 80 ? "#4ade80" : pct >= 50 ? "#fbbf24" : "#f87171";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <div style={{ position: "relative", width: 90, height: 90, flexShrink: 0 }}>
        <svg width="90" height="90" viewBox="0 0 90 90" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="45" cy="45" r="36" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="7" />
          <motion.circle cx="45" cy="45" r="36" fill="none" stroke={color} strokeWidth="7"
            strokeLinecap="round" strokeDasharray={2 * Math.PI * 36}
            initial={{ strokeDashoffset: 2 * Math.PI * 36 }}
            animate={{ strokeDashoffset: 2 * Math.PI * 36 - (pct / 100) * 2 * Math.PI * 36 }}
            transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 500, color, lineHeight: 1 }}>{pct}%</div>
          <div style={{ fontSize: 8, color: "#333", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>done</div>
        </div>
      </div>
      <div>
        <div style={{ fontSize: 13, color: "#f1f5f9", marginBottom: 6 }}>
          {completed} of {committed} tasks completed this week
        </div>
        {gap > 0 ? (
          <div style={{ fontSize: 12, color: "#f87171", lineHeight: 1.5 }}>
            Gap: {gap} task{gap !== 1 ? "s" : ""} you said you&apos;d do but didn&apos;t.
            <br />
            <span style={{ color: "#444" }}>That gap is where your growth lives — or dies.</span>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "#4ade80", lineHeight: 1.5 }}>
            No gap. You did what you said you&apos;d do. That&apos;s rare.
          </div>
        )}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const router = useRouter();
  const [report, setReport] = useState<FounderWeeklyReportData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!FEATURES.analytics) { router.replace("/dashboard"); return; }
    const load = async () => {
      try { setReport(await getFounderWeeklyReport()); }
      catch (err) { setError(err instanceof Error ? err.message : "Failed to load report."); }
      finally { setLoading(false); }
    };
    void load();
  }, [router]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{ maxWidth: 860, margin: "0 auto", fontFamily: "system-ui,sans-serif", color: "#e5e5e5", paddingBottom: 40 }}>

      {/* Header */}
      <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid #1c1c1c" }}>
        <div style={{ fontSize: 19, fontWeight: 500, color: "#fff", letterSpacing: "-0.02em" }}>Progress</div>
        <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>Weekly honest mirror — intention vs action, every Friday</div>
      </div>

      {loading && (
        <div style={{ ...card, padding: "52px 32px", textAlign: "center" }}>
          <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }}
            style={{ fontSize: 13, color: "#444" }}>Generating your report...</motion.div>
        </div>
      )}
      {error && (
        <div style={{ fontSize: 13, color: "#f87171", padding: "12px 16px", background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 8 }}>
          {error}
        </div>
      )}

      {report && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Metrics row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", ...card }}>
            {[
              { label: "Projects", value: String(report.projects_count), color: "#e5e5e5" },
              { label: "Milestones completed", value: String(report.milestones_completed), color: "#4ade80" },
              { label: "Tasks this week", value: String(report.tasks_completed), color: "#e5e5e5" },
            ].map((m, i) => (
              <motion.div key={m.label} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                style={{ padding: "18px 20px", background: "#080808", borderRight: i < 2 ? "1px solid #1c1c1c" : "none" }}>
                <div style={{ fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 9 }}>{m.label}</div>
                <div style={{ fontSize: 26, fontWeight: 500, color: m.color, letterSpacing: "-0.03em", lineHeight: 1 }}>{m.value}</div>
              </motion.div>
            ))}
          </div>

          {/* Weekly honest mirror */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            style={{ ...card }}>
            <div style={{ ...sectionHead, color: "#a78bfa" }}>🪞 The weekly honest mirror</div>
            <div style={{ padding: "20px" }}>
              <MirrorGauge
                committed={report.tasks_completed + Math.max(0, (report.projects_count ?? 0) - (report.milestones_completed ?? 0))}
                completed={report.tasks_completed}
              />
              <div style={{ fontSize: 12, color: "#333", marginTop: 16, lineHeight: 1.65, borderTop: "1px solid #111", paddingTop: 14 }}>
                Every Friday BuildMind compares what you said you would do with what you actually did. The gap is where your growth lives.
              </div>
            </div>
          </motion.div>

          {/* AI assessment */}
          {report.ai_summary && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}
              style={{ ...card }}>
              <div style={{ ...sectionHead, color: "#555" }}>BuildMind assessment</div>
              <div style={{ padding: "18px 20px", fontSize: 13, color: "#888", lineHeight: 1.7 }}>{report.ai_summary}</div>
            </motion.div>
          )}

          {/* Risk + suggestions */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.34 }}
              style={{ ...card }}>
              <div style={{ ...sectionHead, color: "#f87171" }}>Risk</div>
              <div style={{ padding: "16px", fontSize: 13, color: "#888", lineHeight: 1.7 }}>{report.ai_risks || "No risks identified yet."}</div>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.38 }}
              style={{ ...card }}>
              <div style={{ ...sectionHead, color: "#4ade80" }}>Next step</div>
              <div style={{ padding: "16px", fontSize: 13, color: "#888", lineHeight: 1.7 }}>{report.ai_suggestions || "No suggestions yet."}</div>
            </motion.div>
          </div>
        </div>
      )}

      {!loading && !report && !error && (
        <div style={{ ...card, padding: "52px 32px", textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 14 }}>🪞</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: "#fff", marginBottom: 8 }}>No report yet</div>
          <div style={{ fontSize: 13, color: "#555", lineHeight: 1.6 }}>Complete tasks this week. Your first report generates on Friday.</div>
        </div>
      )}
    </motion.div>
  );
}
