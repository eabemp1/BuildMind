/**
 * app/progress/page.tsx
 *
 * Product Improvement #1 — Nav collapse: Progress replaces Reports + Insights
 * as a single destination with two tabs:
 *
 *   "This Week"  — the weekly report (previously /reports)
 *   "Patterns"   — behavioral insights (previously /insights)
 *
 * Both tabs respect the BuildMindCalibrating gate (<7 reflections → show
 * the calibrating component instead of thin content).
 */

"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import InsightsPage from "@/app/insights/page";
import { WeeklyPulseCard } from "@/components/WeeklyPulseCard";
import { createClient } from "@/lib/supabase/client";
import { BuildMindCalibrating } from "@/components/BuildMindCalibrating";
import { useActiveProjectId } from "@/lib/queries";

// ── Lazy-loaded tab content ───────────────────────────────────────────────────

function ThisWeekTab({ reflectionCount }: { reflectionCount: number }) {
  if (reflectionCount < 7) {
    return <BuildMindCalibrating count={reflectionCount} surface="insights" />;
  }
  // Was previously `<ReportsPage />` — a direct passthrough of the /reports
  // export/reporting surface, giving this tab no content of its own. Now a
  // dedicated weekly pulse (Story → Insights → Evidence → Metrics → Share),
  // backed by app/api/ai/weekly-pulse/route.ts, which borrows every metric
  // from wherever it's already computed rather than recomputing anything.
  // /reports stays a separate, still-live nav destination for the export/
  // reporting use case (PDF/CSV/image export, 4-week heatmap).
  return <WeeklyPulseCard />;
}

function PatternsTab({ reflectionCount }: { reflectionCount: number }) {
  if (reflectionCount < 7) {
    return <BuildMindCalibrating count={reflectionCount} surface="patterns" />;
  }
  return <InsightsPage />;
}

type Tab = "week" | "patterns";

// FIX: this component previously always defaulted to the "week" tab and
// ignored any ?tab= query param, so the deep link from RisksGapsCard
// ("View all risks" → /progress?tab=patterns) landed on the wrong tab.
// Reads the query param once on mount to pick the initial tab; the tab
// bar's own onClick still drives normal in-page switching afterward.
function ProgressContent() {
  const searchParams = useSearchParams();
  const initialTab: Tab = searchParams.get("tab") === "patterns" ? "patterns" : "week";
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [reflectionCount, setReflectionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const activeProjectId = useActiveProjectId();

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }
        let reflectionQuery = supabase
          .from("reflections")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id);
        if (activeProjectId) reflectionQuery = reflectionQuery.eq("project_id", activeProjectId);
        const { count } = await reflectionQuery;
        setReflectionCount(count ?? 0);
      } catch {
        // Non-fatal
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [activeProjectId]);

  const TABS: { id: Tab; label: string; desc: string }[] = [
    { id: "week",     label: "This Week",  desc: "Performance and momentum" },
    { id: "patterns", label: "Patterns",   desc: "Your behavioral signature" },
  ];

  return (
    <>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "28px 16px 24px" }}>
        {/* Page header */}
        <div style={{ marginBottom: 24 }}>
          <p style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 9, color: "var(--bm-text3)",
            textTransform: "uppercase", letterSpacing: "0.10em", margin: "0 0 8px",
          }}>
            Execution intelligence / Progress
          </p>
          <h1 style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: 26, fontWeight: 700, color: "var(--bm-text)",
            letterSpacing: "-0.025em", margin: "0 0 6px",
          }}>
            What does the evidence say?
          </h1>
          <p style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 12.5, color: "var(--bm-text2)", lineHeight: 1.5, margin: 0,
          }}>
            A grounded read of your execution over time - not another scorecard.
          </p>
        </div>

        {/* Vision Document retention hooks — shown before tabs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginBottom: 20 }}>
          <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: "var(--r-lg)", padding: "16px 18px" }}>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.10em", color: "var(--bm-text3)", margin: "0 0 8px" }}>Execution patterns</p>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: "var(--bm-text2)", lineHeight: 1.6, margin: 0 }}>
              Patterns will surface here after 3+ check-ins. The longer you use BuildMind, the more accurate your behavioral model becomes — avoidance zones, spiral signals, execution style. At day 90 this is irreplaceable.
            </p>
          </div>
          <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: "var(--r-lg)", padding: "16px 18px" }}>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.10em", color: "var(--bm-text3)", margin: "0 0 8px" }}>Avoidance zones</p>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: "var(--bm-text2)", lineHeight: 1.6, margin: 0 }}>
              BuildMind tracks what you consistently avoid. Once detected, tasks are designed to route through your avoidance, not around it. This is one of the few things no other tool does.
            </p>
          </div>
        </div>

        {/* Tab bar */}
        <div
          style={{
            display: "flex",
            gap: 0,
            background: "var(--bm-bg2)",
            border: "1px solid var(--bm-border)",
            borderRadius: 12,
            padding: 4,
          }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1,
                padding: "9px 16px",
                borderRadius: 9,
                border: "none",
                background: activeTab === tab.id ? "var(--bm-bg4)" : "transparent",
                color: activeTab === tab.id ? "var(--bm-text)" : "var(--bm-text3)",
                fontSize: 13,
                fontWeight: activeTab === tab.id ? 600 : 400,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 0.15s",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 1,
              }}
            >
              <span>{tab.label}</span>
              <span style={{ fontSize: 10, color: activeTab === tab.id ? "var(--bm-text3)" : "var(--bm-text4)", fontWeight: 400 }}>
                {tab.desc}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 16px 24px" }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            {loading ? (
              <div style={{ textAlign: "center", padding: "64px 0", color: "var(--bm-text4)", fontSize: 13 }}>
                Loading…
              </div>
            ) : activeTab === "week" ? (
              <ThisWeekTab reflectionCount={reflectionCount} />
            ) : (
              <PatternsTab reflectionCount={reflectionCount} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  );
}

export default function ProgressPage() {
  return (
    <Suspense fallback={null}>
      <ProgressContent />
    </Suspense>
  );
    }
