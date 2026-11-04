/**
 * app/progress/page.tsx
 *
 * Product Improvement #1 — Nav collapse: Progress replaces Reports + Insights
 * as a single destination with two tabs:
 *
 *   "This Week"  — the weekly report (previously /reports)
 *   "Patterns"   — behavioral insights (previously /insights)
 *   "Execution"  — the execution score page (previously /overview)
 *   "Founder Mirror" — the mirror page (previously /founder-mirror)
 *
 * Both tabs respect the BuildMindCalibrating gate (<7 reflections → show
 * the calibrating component instead of thin content).
 *
 * /reports itself is now hidden from the persistent sidebar (lib/nav-config.ts)
 * rather than removed — it still does the one thing this tab doesn't
 * attempt (PDF/CSV/image export, 4-week heatmap), same treatment /insights
 * got earlier: a tab away, reachable via the link in ThisWeekTab below,
 * not a competing top-level destination.
 */

"use client";

import { OpenBesideButton } from "@/components/layout/OpenBesideButton";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import InsightsPage from "@/app/insights/page";
import OverviewPage from "@/app/(dashboard)/overview/page";
import FounderMirrorPage from "@/app/founder-mirror/page";
import { WeeklyPulseCard } from "@/components/WeeklyPulseCard";
import { createClient } from "@/lib/supabase/client";
import { BuildMindCalibrating } from "@/components/BuildMindCalibrating";
import { useActiveProjectId } from "@/lib/queries";
import { LiveVisual } from "@/components/visuals/LiveVisual";

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
  //
  // FIX (checklist item — Reports demotion): /reports still exists and is
  // still the right place for the export/reporting use case (PDF/CSV/image
  // export, 4-week heatmap) that this tab doesn't attempt — but it's no
  // longer a persistent sidebar item (lib/nav-config.ts now marks it
  // hidden), since its content overlapped almost entirely with this tab.
  // The link below is its one remaining discovery path, same move already
  // made for /insights (a tab away, not a separate nav destination).
  return (
    <>
      <WeeklyPulseCard />
      <div style={{ marginTop: 18, textAlign: "center" }}>
        <a
          href="/reports"
          style={{ fontSize: 12, color: "var(--bm-text3)", textDecoration: "none" }}
        >
          Full report and export
        </a>
      </div>
    </>
  );
}

function PatternsTab({ reflectionCount }: { reflectionCount: number }) {
  if (reflectionCount < 7) {
    return <BuildMindCalibrating count={reflectionCount} surface="patterns" />;
  }
  return <InsightsPage />;
}

type Tab = "week" | "patterns" | "execution" | "mirror" | "visual";

// FIX: this component previously always defaulted to the "week" tab and
// ignored any ?tab= query param, so the deep link from RisksGapsCard
// ("View all risks" → /progress?tab=patterns) landed on the wrong tab.
// Reads the query param once on mount to pick the initial tab; the tab
// bar's own onClick still drives normal in-page switching afterward.
function ProgressContent() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialTab: Tab = (["patterns", "execution", "mirror", "visual"] as const).find((x) => x === tabParam) ?? "week";
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
    { id: "week",     label: "This week",  desc: "" },
    { id: "patterns", label: "Patterns",   desc: "" },
    { id: "execution", label: "Execution", desc: "" },
    { id: "mirror",   label: "Founder Mirror", desc: "" },
    { id: "visual",   label: "Charts",     desc: "" },
  ];

  return (
    <>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "28px 16px 24px" }}>
        <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: "clamp(24px, 6vw, 30px)", fontWeight: 700, color: "var(--bm-text)",
            letterSpacing: "-0.025em", margin: 0,
          }}>
            Progress
          </h1>
          <OpenBesideButton label="Ask coach beside" request={{ kind: "coach", title: "Progress chart", prompt: "Chart my progress" }} />
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
            overflowX: "auto",
          }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1,
                padding: "10px 12px",
                whiteSpace: "nowrap",
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
            ) : activeTab === "execution" ? (
              <OverviewPage />
            ) : activeTab === "mirror" ? (
              <FounderMirrorPage />
            ) : activeTab === "visual" ? (
              <>
                <LiveVisual kind="progress" projectId={activeProjectId} />
                <LiveVisual kind="execution" projectId={activeProjectId} />
              </>
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
