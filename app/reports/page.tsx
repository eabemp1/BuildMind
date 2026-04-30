"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { queryKeys, useProjectSummariesQuery, useWeeklyReportMetricsQuery } from "@/lib/queries";
import { useQueryClient } from "@tanstack/react-query";
import BuildMindLoader from "@/components/BuildMindLoader";
import { useLimitModal } from "@/components/LimitModal";
import { updateAchievementStats, checkAndUnlockAchievements } from "@/lib/achievements";
import PaywallGate from "@/components/PaywallGate";
import { usePlan } from "@/lib/usePlan";
import { computeStartupScore } from "@/lib/buildmind";
import { Download, TrendingUp, TrendingDown, BarChart3, Clock, Target, CheckCircle2, Flame, Calendar, ArrowUpRight } from "lucide-react";

function Sparkline({ data, color, width = 120, height = 40 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * (height - 6) - 3}`).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={`sg-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 3px ${color}60)` }} />
    </svg>
  );
}

function WeeklyBars({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1);
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80 }}>
      {data.map((v, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, height: "100%", justifyContent: "flex-end" }}>
          <motion.div initial={{ height: 0 }} animate={{ height: `${(v / max) * 60}px` }}
            transition={{ duration: 0.7, delay: i * 0.05, ease: "easeOut" }}
            style={{ width: "100%", background: color, borderRadius: 5, minHeight: 3, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "100%", background: `linear-gradient(180deg, rgba(255,255,255,0.15) 0%, transparent 100%)` }} />
          </motion.div>
          <span style={{ fontSize: 9, color: "var(--bm-text3)", letterSpacing: "0.04em" }}>{days[i]}</span>
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value, sub, trend, sparkData, color }: { label: string; value: string | number; sub?: string; trend?: "up" | "down" | "neutral"; sparkData?: number[]; color: string }) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : null;
  const trendColor = trend === "up" ? "var(--bm-accent)" : trend === "down" ? "var(--bm-red)" : "var(--bm-text3)";
  return (
    <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 16, padding: "18px 20px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 900, color, letterSpacing: "-0.03em", lineHeight: 1 }}>{value}</div>
          {sub && (
            <div style={{ fontSize: 11, color: trendColor, marginTop: 5, display: "flex", alignItems: "center", gap: 4 }}>
              {TrendIcon && <TrendIcon size={11} />} {sub}
            </div>
          )}
        </div>
        {sparkData && <Sparkline data={sparkData} color={color} width={90} height={36} />}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const { plan } = usePlan();
  const queryClient = useQueryClient();
  const { data: summaries = [], isLoading } = useProjectSummariesQuery();
  const { data: metrics, isLoading: metricsLoading } = useWeeklyReportMetricsQuery();
  const project = summaries[0] ?? null;
  const score = metrics?.score ?? (project ? computeStartupScore(project) : 0);
  const weeklyScores = metrics?.weeklyScores ?? [0, 0, 0, 0, 0, 0, score];
  const taskData = metrics?.taskData ?? [0, 0, 0, 0, 0, 0, 0];
  const focusData = metrics?.focusData ?? [];
  const totalFocus = focusData.reduce((a, s) => a + s.value, 0);
  const scoreDelta = Math.max(0, score - (metrics?.previousScore ?? score));
  const taskDelta = (metrics?.tasksCompletedThisWeek ?? 0) - (metrics?.tasksCompletedPreviousWeek ?? 0);

  useEffect(() => {
    const supabase = createClient();
    const refreshReports = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.weeklyReport });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectSummaries });
    };
    const channel = supabase
      .channel("weekly-report-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, refreshReports)
      .on("postgres_changes", { event: "*", schema: "public", table: "milestones" }, refreshReports)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, refreshReports)
      .on("postgres_changes", { event: "*", schema: "public", table: "reflections" }, refreshReports)
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  if (isLoading || metricsLoading) return <BuildMindLoader />;

  return (
    <PaywallGate feature="weeklyReport">
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 24px" }}>

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--bm-text)", letterSpacing: "-0.03em", margin: 0 }}>Weekly Report</h1>
                <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 20, background: "var(--bm-accent-dim)", color: "var(--bm-accent)", border: "1px solid var(--bm-accent-bd)", fontWeight: 700 }}>BUILDER</span>
              </div>
              <p style={{ fontSize: 12, color: "var(--bm-text3)", margin: 0 }}>
                {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} · {project?.title ?? "Your startup"}
              </p>
            </div>
            <button
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 10, border: "1px solid var(--bm-border)", background: "transparent", color: "var(--bm-text2)", fontSize: 12, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--bm-bg3)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
              <Download size={12} /> Export PDF
            </button>
          </div>
        </motion.div>

        {/* Metrics row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
          <StatCard label="Startup Score" value={score} sub={scoreDelta ? `+${scoreDelta} this week` : "No change this week"} trend={scoreDelta ? "up" : "neutral"} sparkData={weeklyScores} color="var(--bm-accent)" />
          <StatCard label="Tasks Done" value={taskData.reduce((a, b) => a + b, 0)} sub={`${taskDelta >= 0 ? "+" : ""}${taskDelta} vs last week`} trend={taskDelta >= 0 ? "up" : "down"} sparkData={taskData} color="#A78BFA" />
          <StatCard label="Active Streak" value={`${metrics?.activeStreakDays ?? 0}d`} sub={(metrics?.activeStreakDays ?? 0) > 0 ? "Keep it going" : "Complete a task to start"} color="var(--bm-amber)" />
        </div>

        {/* Charts row */}
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12, marginBottom: 16 }}>
          <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 16, padding: "20px" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--bm-text2)", marginBottom: 18 }}>Task Completion This Week</div>
            <WeeklyBars data={taskData} color="var(--bm-accent)" />
          </div>
          <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 16, padding: "20px" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--bm-text2)", marginBottom: 18 }}>Focus Breakdown</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {focusData.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--bm-text3)", lineHeight: 1.6 }}>Complete tasks to see your focus breakdown.</div>
              ) : focusData.map(s => (
                <div key={s.label}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ fontSize: 11, color: "var(--bm-text3)" }}>{s.label}</span>
                    <span style={{ fontSize: 11, color: s.color, fontWeight: 700 }}>{s.value}%</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 99, background: "var(--bm-bg3)", overflow: "hidden" }}>
                    <motion.div initial={{ width: 0 }} animate={{ width: `${totalFocus ? (s.value / totalFocus) * 100 : 0}%` }} transition={{ duration: 0.8, ease: "easeOut" }}
                      style={{ height: "100%", background: s.color, borderRadius: 99 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* AI Insight */}
        <div style={{ background: "var(--bm-accent-dim)", border: "1px solid var(--bm-accent-bd)", borderRadius: 16, padding: "20px 22px", marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--bm-accent)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>AI Weekly Insight</div>
          <p style={{ fontSize: 14, color: "var(--bm-text2)", lineHeight: 1.7, margin: "0 0 14px", fontStyle: "italic" }}>
            &ldquo;{scoreDelta > 0 ? `Your score rose by ${scoreDelta} this week because your execution data changed.` : "Your score is waiting on fresh execution data."} Next week: prioritise the next incomplete task before adding new work.&rdquo;
          </p>
          <span style={{ fontSize: 11, color: "var(--bm-accent)", fontWeight: 600 }}>→ Next week&apos;s recommended focus</span>
        </div>

        {/* Wins & blockers */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 16, padding: "18px 20px" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--bm-text2)", marginBottom: 14, display: "flex", alignItems: "center", gap: 7 }}>
              <CheckCircle2 size={13} color="var(--bm-accent)" /> This week&apos;s wins
            </div>
            {(metrics?.wins.length ? metrics.wins : ["No wins logged from Supabase this week yet"]).map((w, i, arr) => (
              <div key={i} style={{ display: "flex", gap: 8, fontSize: 13, color: "var(--bm-text2)", padding: "8px 0", borderBottom: i < 2 ? "1px solid var(--bm-border)" : "none" }}>
                <span style={{ color: "var(--bm-accent)", flexShrink: 0 }}>✓</span> {w}
              </div>
            ))}
          </div>
          <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 16, padding: "18px 20px" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--bm-text2)", marginBottom: 14, display: "flex", alignItems: "center", gap: 7 }}>
              <Target size={13} color="var(--bm-amber)" /> Focus for next week
            </div>
            {(metrics?.nextFocus.length ? metrics.nextFocus : ["Create or complete project tasks to generate next focus items"]).map((f, i) => (
              <div key={i} style={{ display: "flex", gap: 8, fontSize: 13, color: "var(--bm-text2)", padding: "8px 0", borderBottom: i < 2 ? "1px solid var(--bm-border)" : "none" }}>
                <span style={{ color: "var(--bm-amber)", flexShrink: 0 }}>→</span> {f}
              </div>
            ))}
          </div>
        </div>
      </div>
    </PaywallGate>
  );
}
