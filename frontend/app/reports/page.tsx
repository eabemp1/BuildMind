"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { getFounderWeeklyReport, type FounderWeeklyReportData } from "@/lib/api";
import { FEATURES } from "@/lib/features";

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
      style={{ maxWidth: 860, margin: "0 auto", fontFamily: "system-ui,sans-serif", color: "#e5e5e5" }}>

      <div style={{ marginBottom: 24, paddingBottom: 18, borderBottom: "1px solid #1c1c1c" }}>
        <div style={{ fontSize: 20, fontWeight: 500, color: "#fff", letterSpacing: "-0.02em" }}>Progress</div>
        <div style={{ fontSize: 12, color: "#888", marginTop: 3 }}>Weekly honest mirror — intention vs action</div>
      </div>

      {loading && <div style={{ fontSize: 12, color: "#666", textAlign: "center", padding: "40px 0" }}>Generating report...</div>}
      {error && <div style={{ fontSize: 12, color: "#f87171" }}>{error}</div>}

      {report && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Metrics */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", border: "1px solid #1c1c1c", borderRadius: 8, overflow: "hidden" }}>
            {[
              { label: "Projects", value: String(report.projects_count) },
              { label: "Milestones completed", value: String(report.milestones_completed) },
              { label: "Tasks this week", value: String(report.tasks_completed) },
            ].map((m, i) => (
              <div key={m.label} style={{ padding: "18px 20px", background: "#080808", borderRight: i < 2 ? "1px solid #1c1c1c" : "none" }}>
                <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 9 }}>{m.label}</div>
                <div style={{ fontSize: 26, fontWeight: 500, color: "#fff", letterSpacing: "-0.03em", lineHeight: 1 }}>{m.value}</div>
              </div>
            ))}
          </div>

          {/* AI summary */}
          {report.ai_summary && (
            <div style={{ border: "1px solid #1c1c1c", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ padding: "10px 18px", borderBottom: "1px solid #1c1c1c", background: "#080808", fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.09em" }}>
                BuildMind assessment
              </div>
              <div style={{ padding: "18px 20px", fontSize: 13, color: "#aaa", lineHeight: 1.7 }}>{report.ai_summary}</div>
            </div>
          )}

          {/* Risk + suggestions */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ border: "1px solid #1c1c1c", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ padding: "10px 16px", borderBottom: "1px solid #1c1c1c", background: "#080808", fontSize: 11, color: "#f87171", textTransform: "uppercase", letterSpacing: "0.09em" }}>Risk</div>
              <div style={{ padding: "16px", fontSize: 13, color: "#999", lineHeight: 1.7 }}>{report.ai_risks || "No risks identified yet."}</div>
            </div>
            <div style={{ border: "1px solid #1c1c1c", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ padding: "10px 16px", borderBottom: "1px solid #1c1c1c", background: "#080808", fontSize: 11, color: "#4ade80", textTransform: "uppercase", letterSpacing: "0.09em" }}>Next step</div>
              <div style={{ padding: "16px", fontSize: 13, color: "#999", lineHeight: 1.7 }}>{report.ai_suggestions || "No suggestions yet."}</div>
            </div>
          </div>

          {/* Mirror */}
          <div style={{ border: "1px solid #1c1c1c", borderRadius: 8, padding: "16px 20px", background: "#080808", display: "flex", gap: 14 }}>
            <div style={{ fontSize: 16, flexShrink: 0 }}>🪞</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "#aaa", marginBottom: 5 }}>The weekly honest mirror</div>
              <div style={{ fontSize: 12, color: "#666", lineHeight: 1.65 }}>Every Friday BuildMind compares what you said you would do with what you actually did. The gap is where your growth lives.</div>
            </div>
          </div>
        </div>
      )}

      {!loading && !report && !error && (
        <div style={{ border: "1px solid #1c1c1c", borderRadius: 8, padding: "52px 32px", textAlign: "center", background: "#080808" }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: "#fff", marginBottom: 8 }}>No report yet</div>
          <div style={{ fontSize: 13, color: "#888", lineHeight: 1.6 }}>Complete tasks this week. Your first report generates on Friday.</div>
        </div>
      )}
    </motion.div>
  );
}
