"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { computeStartupScore, getCurrentUser, type ProjectSummary } from "@/lib/buildmind";
import { useDashboardOverviewQuery, useProjectsQuery, useProjectSummariesQuery } from "@/lib/queries";
import { getActiveProjectId, setActiveProjectId } from "@/lib/api";

const STAGE_STEPS = ["Idea", "Validation", "MVP", "Launch", "Growth", "Revenue"];

// Proven actions per stage — what to show in the action card
const STAGE_ROADMAP: Record<string, string> = {
  Idea: "Talk to 5 people who have this problem before writing any code.",
  Validation: "Send 10 personal outreach DMs to potential users — no pitch, just questions.",
  MVP: "Get your working link in front of one warm contact before end of day.",
  Launch: "Post on Product Hunt — imperfect listing beats no listing.",
  Growth: "Define the single metric that predicts retention and obsess over it.",
  Revenue: "Call one churned user — not to win them back, to understand why they left.",
};

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function AnimatedNumber({ value, color }: { value: number; color: string }) {
  return (
    <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ color }}>
      {value}
    </motion.span>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { data: projects = [], isLoading: pL } = useProjectsQuery();
  const { data: summaries = [], isLoading: sL } = useProjectSummariesQuery();
  const { data: overview, isLoading: oL } = useDashboardOverviewQuery();
  const [dailyAction, setDailyAction] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(null);

  useEffect(() => {
    const stored = getActiveProjectId();
    if (stored) setActiveProjectIdState(stored);
  }, []);

  const activeProjectSummary = useMemo<ProjectSummary | null>(() => {
    if (!summaries.length) return null;
    if (activeProjectId) {
      const found = summaries.find((s) => s.id === activeProjectId);
      if (found) return found;
    }
    return summaries.reduce((l, c) => new Date(c.lastActivity).getTime() > new Date(l.lastActivity).getTime() ? c : l);
  }, [summaries, activeProjectId]);

  useEffect(() => {
    if (!summaries.length || !activeProjectSummary) return;
    const stored = getActiveProjectId();
    if (!stored) {
      setActiveProjectId(activeProjectSummary.id);
      setActiveProjectIdState(activeProjectSummary.id);
    }
  }, [summaries, activeProjectSummary]);

  // FIX: stage now comes from the computed value in getProjectSummaries,
  // which uses inferStageFromMilestones — never returns stale null value
  const activeStage = useMemo(() => {
    if (!activeProjectSummary) return "Idea";
    return activeProjectSummary.startup_stage ?? "Idea";
  }, [activeProjectSummary]);

  const stageIndex = useMemo(() => {
    const idx = STAGE_STEPS.findIndex((s) => s.toLowerCase() === activeStage.toLowerCase());
    return idx >= 0 ? idx : 0;
  }, [activeStage]);

  const streak = overview?.founderStreakDays ?? 0;
  const execScore = useMemo(() => {
    if (!summaries.length) return 0;
    const total = summaries.reduce((sum, s) => sum + computeStartupScore(s), 0);
    return Math.round(total / summaries.length);
  }, [summaries]);

  const acctRate = useMemo(() => {
    const totals = summaries.reduce((acc, s) => {
      acc.completed += s.tasksCompleted ?? 0;
      acc.total += s.tasksTotal ?? 0;
      return acc;
    }, { completed: 0, total: 0 });
    if (!totals.total) return 0;
    return Math.round((totals.completed / totals.total) * 100);
  }, [summaries]);

  useEffect(() => {
    if (overview?.founderStreakDays) localStorage.setItem("bm_streak", String(overview.founderStreakDays));
  }, [overview?.founderStreakDays]);

  useEffect(() => {
    if (!activeProjectSummary) return;
    const key = `bm_daily_action_${activeProjectSummary.id}`;
    const today = todayKey();
    const cachedRaw = typeof window !== "undefined" ? localStorage.getItem(key) : null;
    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw) as { date: string; stage: string; data: { action: string } };
        if (cached?.date === today && cached?.stage === activeStage && cached?.data?.action) {
          setDailyAction(cached.data.action);
          return;
        }
      } catch {
        // ignore cache parse errors
      }
    }

    const run = async () => {
      try {
        const user = await getCurrentUser();
        if (!user) { setDailyAction(null); return; }
        const res = await fetch("/api/ai/today-action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id, projectId: activeProjectSummary.id, stage: activeStage }),
        });
        const body = await res.json().catch(() => ({}));
        const action = body?.data?.action;
        if (res.ok && action) {
          setDailyAction(action);
          localStorage.setItem(key, JSON.stringify({ date: today, stage: activeStage, data: body.data }));
        }
      } catch {
        // ignore
      }
    };
    void run();
  }, [activeProjectSummary, activeStage]);

  if (pL || sL || oL) return (
    <div className="flex items-center justify-center h-60">
      <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }}
        className="text-xs text-[#444]">Loading...</motion.div>
    </div>
  );

  if (!projects.length) return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="max-w-sm mx-auto mt-16 text-center">
      <div className="border border-[#1c1c1c] rounded-xl p-8 bg-[#080808]">
        <div className="text-[15px] font-medium text-white mb-2">No projects yet</div>
        <div className="text-[13px] text-[#888] leading-relaxed mb-5">
          Create your first project to unlock daily actions, your execution score, and AI coaching.
        </div>
        <button onClick={() => router.push("/projects")}
          className="w-full py-3 bg-white text-black font-medium text-[13px] rounded-lg border-none cursor-pointer">
          New project
        </button>
      </div>
    </motion.div>
  );

  const sc = execScore >= 60 ? "#4ade80" : execScore >= 30 ? "#fbbf24" : "#f87171";
  const ac = acctRate >= 60 ? "#4ade80" : "#fbbf24";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}
      className="space-y-3 pb-4">

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-[#1c1c1c]">
        <div>
          <div className="text-lg font-medium text-white tracking-tight">Overview</div>
          <div className="text-xs text-[#888] mt-0.5 truncate">
            {activeProjectSummary?.title ?? "BuildMind"} · <span style={{ color: "#a78bfa" }}>{activeStage}</span>
          </div>
          {summaries.length > 1 && (
            <div className="mt-2">
              <select
                value={activeProjectSummary?.id ?? ""}
                onChange={(e) => {
                  const id = e.target.value;
                  if (id) {
                    setActiveProjectId(id);
                    setActiveProjectIdState(id);
                  }
                }}
                className="text-[11px] text-[#d4d4d4] bg-[#0a0a0a] border border-[#1c1c1c] rounded-md px-2 py-1"
                style={{ fontFamily: "inherit" }}
              >
                {summaries.map((s) => (
                  <option key={s.id} value={s.id} style={{ background: "#0a0a0a", color: "#d4d4d4" }}>
                    {s.title}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={() => router.push("/break-my-startup")}
            className="text-[11px] text-red-400 border border-red-400/20 bg-red-400/[0.07] px-2.5 py-1.5 rounded-md cursor-pointer hidden sm:block"
            style={{ fontFamily: "inherit" }}>
            Break My Startup
          </button>
          <button onClick={() => router.push("/today")}
            className="text-[11px] font-semibold bg-white text-black px-3 py-1.5 rounded-md border-none cursor-pointer"
            style={{ fontFamily: "inherit" }}>
            ⚡ Today&apos;s action
          </button>
        </div>
      </div>

      {/* Metric tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 border border-[#1c1c1c] rounded-xl overflow-hidden">
        {[
          {
            label: "Execution score",
            value: execScore,
            suffix: "/100",
            color: sc,
            tooltip: "Average execution score across all active projects. Computed from each project's progress and validation strengths, then averaged.",
          },
          {
            label: "Accountability",
            value: acctRate,
            suffix: "%",
            color: ac,
            tooltip: "Overall task completion rate across all projects (completed tasks ÷ total tasks).",
          },
          { label: "Streak", value: streak, suffix: " days", color: streak >= 3 ? "#fbbf24" : "#e5e5e5" },
          { label: "Tasks done", value: overview?.completedTasks ?? 0, suffix: "", color: "#e5e5e5" },
        ].map((s, i) => (
          <motion.div key={s.label}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
            className="p-4 bg-[#080808]"
            style={{ borderRight: i < 3 ? "1px solid #1c1c1c" : "none", borderBottom: i < 2 ? "1px solid #1c1c1c" : "none" }}>
            <div className="text-[10px] text-[#555] uppercase tracking-wider mb-2" title={s.tooltip ?? ""}>
              {s.label}
            </div>
            <div className="text-2xl font-medium leading-none tracking-tight">
              <AnimatedNumber value={s.value} color={s.color} />
              <span className="text-[12px] text-[#333] font-normal">{s.suffix}</span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Accountability warning */}
      {acctRate < 30 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
          className="border border-yellow-400/20 rounded-xl p-3.5 bg-yellow-400/[0.04] flex items-start gap-3">
          <span className="text-xl flex-shrink-0">⚠️</span>
          <div>
            <div className="text-[13px] font-medium text-[#fbbf24] mb-0.5">Accountability gap detected</div>
            <div className="text-[11px] text-[#555] leading-relaxed">
              Only {acctRate}% of tasks are complete. Complete one task today to rebuild momentum.
            </div>
          </div>
        </motion.div>
      )}

      {/* Stage journey — FIX: shows real current stage */}
      <div className="border border-[#1c1c1c] rounded-xl p-4 bg-[#080808]">
        <div className="text-[10px] text-[#555] uppercase tracking-wider mb-3">Startup journey</div>
        <div className="flex items-center overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
          {STAGE_STEPS.map((s, i) => (
            <div key={s} className="flex items-center flex-shrink-0">
              <div className="flex flex-col items-center gap-1.5">
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-semibold flex-shrink-0"
                  style={{
                    background: i < stageIndex ? "#fff" : "transparent",
                    border: i === stageIndex ? "1.5px solid #a78bfa" : i < stageIndex ? "1px solid #fff" : "1px solid #2a2a2a",
                    color: i < stageIndex ? "#000" : i === stageIndex ? "#a78bfa" : "#333",
                  }}>
                  {i < stageIndex ? "✓" : i + 1}
                </div>
                <div className="text-[9px] whitespace-nowrap"
                  style={{ color: i === stageIndex ? "#a78bfa" : i < stageIndex ? "#555" : "#2a2a2a", fontWeight: i === stageIndex ? 600 : 400 }}>
                  {s}{i === stageIndex ? " ←" : ""}
                </div>
              </div>
              {i < STAGE_STEPS.length - 1 && (
                <div className="w-6 sm:w-8 h-px mx-1 mb-3 flex-shrink-0"
                  style={{ background: i < stageIndex ? "#333" : "#1c1c1c" }} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Today's action — shows action for REAL current stage */}
      <div className="border border-[#1c1c1c] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#111] bg-[#080808]">
          <span className="text-[11px] text-[#666]">Today&apos;s action</span>
          <span className="text-[10px] text-[#444] bg-[#111] border border-[#1c1c1c] rounded px-1.5 py-0.5">{activeStage}</span>
        </div>
        <div className="p-4 bg-[#f5f5f4]">
          <div className="text-[10px] text-[#999] uppercase tracking-wider mb-2">Do this now</div>
          <div className="text-[14px] font-semibold text-[#0a0a0a] mb-4 leading-snug break-words">
            {dailyAction ?? STAGE_ROADMAP[activeStage] ?? STAGE_ROADMAP["MVP"]}
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button onClick={() => router.push("/today")}
              className="flex-1 py-3 bg-[#0a0a0a] text-white font-medium text-[12px] rounded-lg border-none cursor-pointer"
              style={{ fontFamily: "inherit" }}>
              See full action card →
            </button>
            <button onClick={() => router.push("/ai-coach")}
              className="sm:w-auto py-3 px-4 text-[12px] text-[#555] border border-[#ccc] bg-transparent rounded-lg cursor-pointer"
              style={{ fontFamily: "inherit" }}>
              Ask BuildMind
            </button>
          </div>
        </div>
      </div>

      {/* Projects table */}
      {summaries.length > 0 && (
        <div className="border border-[#1c1c1c] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#111] bg-[#080808]">
            <span className="text-[11px] text-[#666]">Active projects</span>
            <button onClick={() => router.push("/projects")}
              className="text-[11px] text-[#444] bg-transparent border-none cursor-pointer"
              style={{ fontFamily: "inherit" }}>
              View all
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 360 }}>
              <thead>
                <tr>
                  {["Project", "Stage", "Progress", "Score"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] text-[#444] font-medium uppercase tracking-wider border-b border-[#111] bg-[#080808]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summaries.slice(0, 5).map((s, i) => {
                  const score = computeStartupScore(s);
                  const cc = score >= 60 ? "#4ade80" : score >= 30 ? "#fbbf24" : "#888";
                  return (
                    <tr key={s.id} onClick={() => router.push(`/projects/${s.id}`)}
                      className="cursor-pointer hover:bg-[#0d0d0d] transition-colors"
                      style={{ borderBottom: i < Math.min(summaries.length, 5) - 1 ? "1px solid #111" : "none" }}>
                      <td className="px-4 py-3">
                        <div className="text-[13px] text-[#d4d4d4] font-medium truncate max-w-[140px]">{s.title}</div>
                        <div className="text-[10px] text-[#555] mt-0.5 truncate max-w-[140px]">{s.description}</div>
                      </td>
                      <td className="px-4 py-3">
                        {/* FIX: stage now shows real computed value */}
                        <span className="text-[10px] text-[#a78bfa] bg-[#111] border border-[#1c1c1c] rounded px-1.5 py-0.5 whitespace-nowrap">
                          {s.startup_stage ?? "Idea"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1 bg-[#1c1c1c] rounded-full overflow-hidden">
                            <div style={{ width: `${s.progress}%`, background: "#6366f1", height: "100%", borderRadius: 9999 }} />
                          </div>
                          <span className="text-[10px] text-[#555]">{s.progress}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[13px] font-medium" style={{ color: cc }}>{score}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </motion.div>
  );
}
