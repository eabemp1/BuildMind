"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { calculateDashboardStats, computeStartupScore, type ProjectSummary } from "@/lib/buildmind";
import { useDashboardOverviewQuery, useProjectsQuery, useProjectSummariesQuery } from "@/lib/queries";

const STAGE_STEPS = ["Idea", "Validation", "Prototype", "MVP", "Launch", "Revenue"];

const STAGE_ROADMAP: Record<number, string> = {
  0: "Talk to 5 people who have this problem — before writing any code.",
  1: "Send 10 personal outreach DMs to potential users — no pitch, just questions.",
  2: "Record a 3-minute Loom of your prototype and send it to 5 people.",
  3: "Get your working link in front of one warm contact before end of day.",
  4: "Post on Product Hunt — imperfect listing beats no listing.",
  5: "Call one churned user — not to win them back, to understand why.",
};

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

  const activeProjectSummary = useMemo<ProjectSummary | null>(() => {
    if (!summaries.length) return null;
    return summaries.reduce((l, c) => new Date(c.lastActivity).getTime() > new Date(l.lastActivity).getTime() ? c : l);
  }, [summaries]);

  const activeStage = useMemo(() => {
    if (!activeProjectSummary) return "Idea";
    const s = (activeProjectSummary.startup_stage ?? "").trim();
    if (s) return s;
    const sc = activeProjectSummary.validation_strengths?.length ?? 0;
    return sc >= 3 ? "Validation" : sc > 0 ? "Discovery" : "Idea";
  }, [activeProjectSummary]);

  const stageIndex = useMemo(() => {
    const s = activeStage.toLowerCase();
    if (s.includes("idea")) return 0;
    if (s.includes("valid") || s.includes("discover")) return 1;
    if (s.includes("proto")) return 2;
    if (s.includes("mvp")) return 3;
    if (s.includes("launch")) return 4;
    return 5;
  }, [activeStage]);

  const streak = overview?.founderStreakDays ?? 0;
  const execScore = activeProjectSummary?.execution_score ?? 0;
  const acctRate = activeProjectSummary?.progress ?? 0;

  useEffect(() => {
    if (overview?.founderStreakDays) localStorage.setItem("bm_streak", String(overview.founderStreakDays));
  }, [overview?.founderStreakDays]);

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
        <div className="text-[13px] text-[#888] leading-relaxed mb-5">Create your first project to unlock daily actions, milestones, and AI coaching.</div>
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

      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-[#1c1c1c]">
        <div>
          <div className="text-lg font-medium text-white tracking-tight">Overview</div>
          <div className="text-xs text-[#888] mt-0.5 truncate">{activeProjectSummary?.title ?? "BuildMind"} · {activeStage}</div>
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

      {/* Metric tiles — 2 cols on mobile, 4 on desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 border border-[#1c1c1c] rounded-xl overflow-hidden">
        {[
          { label: "Execution score", value: execScore, suffix: "/100", color: sc },
          { label: "Accountability", value: acctRate, suffix: "%", color: ac },
          { label: "Streak", value: streak, suffix: " days", color: streak >= 3 ? "#fbbf24" : "#e5e5e5" },
          { label: "Tasks done", value: overview?.completedTasks ?? 0, suffix: "", color: "#e5e5e5" },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
            className="p-4 bg-[#080808]"
            style={{ borderRight: i % 2 === 0 ? "1px solid #1c1c1c" : "none", borderBottom: i < 2 ? "1px solid #1c1c1c" : "none" }}
            // On lg: different border logic (handled inline below, this is fine for grid)
          >
            <div className="text-[10px] text-[#555] uppercase tracking-wider mb-2">{s.label}</div>
            <div className="text-2xl font-medium leading-none tracking-tight">
              <AnimatedNumber value={s.value} color={s.color} />
              <span className="text-[12px] text-[#333] font-normal">{s.suffix}</span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Accountability gap — mobile friendly */}
      {acctRate < 30 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
          className="border border-yellow-400/20 rounded-xl p-3.5 bg-yellow-400/[0.04] flex items-start gap-3">
          <span className="text-xl flex-shrink-0">⚠️</span>
          <div>
            <div className="text-[13px] font-medium text-[#fbbf24] mb-0.5">Accountability gap detected</div>
            <div className="text-[11px] text-[#555] leading-relaxed">You&apos;re marking tasks incomplete. Complete one task today to rebuild momentum.</div>
          </div>
        </motion.div>
      )}

      {/* Stage journey — horizontal scroll on mobile */}
      <div className="border border-[#1c1c1c] rounded-xl p-4 bg-[#080808]">
        <div className="text-[10px] text-[#555] uppercase tracking-wider mb-3">Startup journey</div>
        <div className="flex items-center overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
          {STAGE_STEPS.map((s, i) => (
            <div key={s} className="flex items-center flex-shrink-0">
              <div className="flex flex-col items-center gap-1.5">
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-semibold flex-shrink-0"
                  style={{ background: i < stageIndex ? "#fff" : "transparent", border: i === stageIndex ? "1.5px solid #fff" : i < stageIndex ? "1px solid #fff" : "1px solid #2a2a2a", color: i < stageIndex ? "#000" : i === stageIndex ? "#fff" : "#333" }}>
                  {i < stageIndex ? "✓" : i + 1}
                </div>
                <div className="text-[9px] whitespace-nowrap" style={{ color: i === stageIndex ? "#e5e5e5" : i < stageIndex ? "#555" : "#2a2a2a" }}>{s}</div>
              </div>
              {i < STAGE_STEPS.length - 1 && (
                <div className="w-6 sm:w-8 h-px mx-1 mb-3 flex-shrink-0" style={{ background: i < stageIndex ? "#333" : "#1c1c1c" }} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Today's action */}
      <div className="border border-[#1c1c1c] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#111] bg-[#080808]">
          <span className="text-[11px] text-[#666]">Today&apos;s action</span>
          <span className="text-[10px] text-[#444] bg-[#111] border border-[#1c1c1c] rounded px-1.5 py-0.5">{activeStage}</span>
        </div>
        <div className="p-4 bg-[#f5f5f4]">
          <div className="text-[10px] text-[#999] uppercase tracking-wider mb-2">Do this now</div>
          <div className="text-[14px] font-semibold text-[#0a0a0a] mb-4 leading-snug break-words">
            {STAGE_ROADMAP[stageIndex] ?? STAGE_ROADMAP[3]}
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
              Ask BuildMini
            </button>
          </div>
        </div>
      </div>

      {/* Projects table — scrollable on mobile */}
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
                  {["Project", "Stage", "Score"].map(h => (
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
                      className="cursor-pointer transition-colors hover:bg-[#0d0d0d]"
                      style={{ borderBottom: i < Math.min(summaries.length, 5) - 1 ? "1px solid #111" : "none" }}>
                      <td className="px-4 py-3">
                        <div className="text-[13px] text-[#d4d4d4] font-medium truncate max-w-[140px]">{s.title}</div>
                        <div className="text-[10px] text-[#555] mt-0.5 truncate max-w-[140px]">{s.description}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[10px] text-[#888] bg-[#111] border border-[#1c1c1c] rounded px-1.5 py-0.5 whitespace-nowrap">
                          {s.startup_stage ?? "Idea"}
                        </span>
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
