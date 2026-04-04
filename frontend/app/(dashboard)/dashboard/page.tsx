"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { computeStartupScore, getCurrentUser, type ProjectSummary } from "@/lib/buildmind";
import { useDashboardOverviewQuery, useProjectsQuery, useProjectSummariesQuery } from "@/lib/queries";
import { getActiveProjectId, setActiveProjectId } from "@/lib/api";

const STAGE_STEPS = ["Idea", "Validation", "MVP", "Launch", "Growth", "Revenue"];

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

function MetricRing({
  value, max = 100, size = 80, label, suffix = "", color,
}: {
  value: number; max?: number; size?: number; label: string; suffix?: string; color: string;
}) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(value / max, 1);
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="5" />
          <motion.circle
            cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={color} strokeWidth="5" strokeLinecap="round"
            strokeDasharray={circ}
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: circ - pct * circ }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
            className="font-bold leading-none tracking-tight"
            style={{ fontSize: Math.round(size * 0.24), color }}
          >
            {value}
          </motion.div>
          {suffix && (
            <div className="text-[10px] text-[#444] mt-0.5">{suffix}</div>
          )}
        </div>
      </div>
      <div className="text-[10px] text-[#555] uppercase tracking-widest text-center">{label}</div>
    </div>
  );
}

function StreakBar({ streak }: { streak: number }) {
  const days = Math.min(streak, 14);
  const color = streak >= 7 ? "#f97316" : streak >= 3 ? "#fbbf24" : "#555";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <motion.span animate={{ scale: streak >= 3 ? [1, 1.2, 1] : 1 }} transition={{ duration: 0.6, delay: 0.8 }} className="text-xl">🔥</motion.span>
        <div>
          <div className="text-[22px] font-bold tracking-tight leading-none" style={{ color }}>{streak}d</div>
          <div className="text-[10px] text-[#444] uppercase tracking-widest">Streak</div>
        </div>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: 14 }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ delay: 0.05 * i, duration: 0.25, ease: "easeOut" }}
            className="flex-1 h-5 rounded-sm border"
            style={{
              background: i < days ? color : "rgba(255,255,255,0.04)",
              borderColor: i < days ? "transparent" : "#1a1a1a",
              transformOrigin: "bottom",
            }}
          />
        ))}
      </div>
      <div className="text-[9px] text-[#2a2a2a]">Last 14 days</div>
    </div>
  );
}

function StageJourney({ stageIndex }: { stageIndex: number }) {
  return (
    <div className="flex items-center w-full">
      {STAGE_STEPS.map((s, i) => {
        const done = i < stageIndex;
        const active = i === stageIndex;
        return (
          <div key={s} className="flex items-center" style={{ flex: i < STAGE_STEPS.length - 1 ? 1 : "none" }}>
            <div className="flex flex-col items-center gap-1">
              <motion.div
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.08 * i, type: "spring", stiffness: 400, damping: 22 }}
                className="rounded-full flex items-center justify-center font-bold relative"
                style={{
                  width: active ? 26 : 20,
                  height: active ? 26 : 20,
                  background: done ? "#fff" : "transparent",
                  border: active ? "2px solid #a78bfa" : done ? "none" : "1px solid #2a2a2a",
                  fontSize: active ? 10 : 8,
                  color: done ? "#000" : active ? "#a78bfa" : "#333",
                  boxShadow: active ? "0 0 16px rgba(167,139,250,0.5)" : "none",
                  flexShrink: 0,
                }}
              >
                {done ? "✓" : i + 1}
                {active && (
                  <motion.div
                    animate={{ scale: [1, 1.8, 1], opacity: [0.4, 0, 0.4] }}
                    transition={{ duration: 2.2, repeat: Infinity }}
                    className="absolute inset-[-6px] rounded-full border"
                    style={{ borderColor: "rgba(167,139,250,0.35)" }}
                  />
                )}
              </motion.div>
              <div className="text-[8px] whitespace-nowrap"
                style={{ color: active ? "#e5e5e5" : done ? "#555" : "#2a2a2a", fontWeight: active ? 600 : 400 }}>
                {s}
              </div>
            </div>
            {i < STAGE_STEPS.length - 1 && (
              <div className="flex-1 h-px mx-0.5 mb-4 relative overflow-hidden" style={{ background: "#1c1c1c" }}>
                {done && (
                  <motion.div
                    initial={{ width: "0%" }} animate={{ width: "100%" }}
                    transition={{ delay: 0.15 + i * 0.08, duration: 0.4 }}
                    className="absolute inset-0"
                    style={{ background: "#555" }}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 60 ? "#4ade80" : score >= 30 ? "#fbbf24" : "#f87171";
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 h-1 bg-white/5 rounded overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }}
          className="h-full rounded"
          style={{ background: color }}
        />
      </div>
      <span className="text-xs font-semibold text-right min-w-[24px]" style={{ color }}>{score}</span>
    </div>
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

  const tasksCompleted = overview?.completedTasks ?? 0;

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
          Create your first project to unlock daily actions, milestones, and AI coaching.
        </div>
        <button onClick={() => router.push("/projects")}
          className="w-full py-3 bg-white text-black font-medium text-[13px] rounded-lg border-none cursor-pointer">
          New project
        </button>
      </div>
    </motion.div>
  );

  const scoreColor = execScore >= 60 ? "#4ade80" : execScore >= 30 ? "#fbbf24" : "#f87171";
  const acctColor = acctRate >= 60 ? "#4ade80" : "#fbbf24";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}
      className="flex flex-col gap-3 pb-6">

      <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-[#1c1c1c]">
        <div>
          <div className="text-lg font-medium text-white tracking-tight">Overview</div>
          <div className="text-xs text-[#888] mt-0.5">
            {activeProjectSummary?.title ?? "BuildMind"} · {activeStage}
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

      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="bg-[#0d0d0d] border border-[#1c1c1c] rounded-xl px-4 py-5"
      >
        <div className="text-[10px] text-[#444] uppercase tracking-widest mb-5">Performance at a glance</div>
        <div className="flex items-center justify-around gap-3 flex-wrap">
          <MetricRing value={execScore} label="Execution" suffix="/100" color={scoreColor} size={82} />
          <div className="w-px h-16 bg-[#1a1a1a] flex-shrink-0" />
          <MetricRing value={acctRate} label="Accountability" suffix="%" color={acctColor} size={82} />
          <div className="w-px h-16 bg-[#1a1a1a] flex-shrink-0" />
          <MetricRing value={tasksCompleted} max={Math.max(tasksCompleted, 20)} label="Tasks done" color="#818cf8" size={82} />
        </div>

        {acctRate < 30 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
            className="flex items-start gap-2.5 mt-4 p-3 bg-yellow-400/[0.05] border border-yellow-400/20 rounded-lg">
            <span className="text-base flex-shrink-0">⚠️</span>
            <div>
              <div className="text-[12px] font-medium text-[#fbbf24] mb-0.5">Accountability gap detected</div>
              <div className="text-[11px] text-[#555] leading-relaxed">You&apos;re marking tasks incomplete. Complete one task today to rebuild momentum.</div>
            </div>
          </motion.div>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="bg-[#0d0d0d] border border-[#1c1c1c] rounded-xl px-4 py-4"
      >
        <StreakBar streak={streak} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
        className="bg-[#0d0d0d] border border-[#1c1c1c] rounded-xl px-4 py-4"
      >
        <div className="text-[10px] text-[#444] uppercase tracking-widest mb-3">Startup journey</div>
        <StageJourney stageIndex={stageIndex} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="border border-[#1c1c1c] rounded-xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#111] bg-[#080808]">
          <span className="text-[10px] text-[#555] uppercase tracking-widest">Today&apos;s action</span>
          <span className="text-[10px] text-[#a78bfa] bg-[#111] border border-[#1c1c1c] rounded px-1.5 py-0.5">{activeStage}</span>
        </div>
        <div className="p-4 bg-[#0d0d0d]">
          <div className="text-[10px] text-[#444] uppercase tracking-widest mb-2">Do this now</div>
          <div className="text-[14px] font-semibold text-[#f1f5f9] mb-4 leading-snug break-words">
            {dailyAction ?? STAGE_ROADMAP[activeStage] ?? STAGE_ROADMAP["MVP"]}
          </div>
          <div className="flex flex-col gap-2">
            <button onClick={() => router.push("/today")}
              className="w-full py-3 bg-white text-black font-semibold text-[13px] rounded-lg border-none cursor-pointer"
              style={{ fontFamily: "inherit" }}>
              See full action card →
            </button>
            <button onClick={() => router.push("/ai-coach")}
              className="w-full py-2.5 text-[12px] text-[#555] border border-[#222] bg-transparent rounded-lg cursor-pointer"
              style={{ fontFamily: "inherit" }}>
              Ask BuildMind
            </button>
          </div>
        </div>
      </motion.div>

      {summaries.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="border border-[#1c1c1c] rounded-xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#111] bg-[#080808]">
            <span className="text-[10px] text-[#555] uppercase tracking-widest">Active projects</span>
            <button onClick={() => router.push("/projects")}
              className="text-[11px] text-[#444] bg-transparent border-none cursor-pointer"
              style={{ fontFamily: "inherit" }}>
              View all
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 340 }}>
              <thead>
                <tr>
                  {["Project", "Stage", "Score"].map((h) => (
                    <th key={h} className="px-4 py-2 text-left text-[9px] text-[#333] font-medium uppercase tracking-widest border-b border-[#111] bg-[#080808]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summaries.slice(0, 5).map((s, i) => {
                  const score = computeStartupScore(s);
                  return (
                    <motion.tr key={s.id}
                      initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.08 * i }}
                      onClick={() => router.push(`/projects/${s.id}`)}
                      className="cursor-pointer"
                      style={{ borderBottom: i < Math.min(summaries.length, 5) - 1 ? "1px solid #111" : "none" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#0d0d0d")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <td className="px-4 py-3">
                        <div className="text-[13px] text-[#d4d4d4] font-medium max-w-[140px] truncate">{s.title}</div>
                        <div className="text-[10px] text-[#444] mt-0.5 max-w-[140px] truncate">{s.description}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[10px] text-[#888] bg-[#111] border border-[#1c1c1c] rounded px-1.5 py-0.5 whitespace-nowrap">
                          {s.startup_stage ?? "Idea"}
                        </span>
                      </td>
                      <td className="px-4 py-3 min-w-[100px]">
                        <ScoreBar score={score} />
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

    </motion.div>
  );
}
