"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { computeStartupScore } from "@/lib/buildmind";
import { useProjectSummariesQuery, useDashboardOverviewQuery } from "@/lib/queries";
import BuildMindLoader from "@/components/BuildMindLoader";
import { AIVisualWidget } from "@/components/ui/AIVisualWidget";

const STAGES = ["Idea", "Validation", "MVP", "Launch", "Growth", "Revenue"];

function ScoreRing({ val, color, size = 64 }: { val: number; color: string; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={6} />
        <motion.circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeLinecap="round" strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - (Math.min(val, 100) / 100) * circ }}
          transition={{ duration: 1.1, ease: "easeOut", delay: 0.2 }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
          style={{ fontSize: size * 0.24, fontWeight: 700, color, lineHeight: 1 }}>{val}</motion.span>
      </div>
    </div>
  );
}

export default function OverviewPage() {
  const router = useRouter();
  const { data: summaries = [], isLoading } = useProjectSummariesQuery();
  const { data: overview } = useDashboardOverviewQuery();

  const streak = overview?.founderStreakDays ??
    Number(typeof window !== "undefined" ? localStorage.getItem("bm_streak") ?? "0" : "0");

  const activeProject = useMemo(() => {
    if (!summaries.length) return null;
    return summaries.reduce((a, b) =>
      new Date(b.lastActivity).getTime() > new Date(a.lastActivity).getTime() ? b : a
    );
  }, [summaries]);

  const score = activeProject ? computeStartupScore(activeProject) : 0;
  const scoreColor = score >= 60 ? "#4ade80" : score >= 30 ? "#fbbf24" : "#f87171";
  const streakColor = streak >= 7 ? "#f97316" : streak >= 3 ? "#fbbf24" : "#555";
  const stage = activeProject?.startup_stage ?? "Idea";
  const stageIdx = Math.max(0, STAGES.findIndex(s => s.toLowerCase() === stage.toLowerCase()));
  const totalTasks = summaries.reduce((a, s) => a + (s.tasksTotal ?? 0), 0);
  const doneTasks = summaries.reduce((a, s) => a + (s.tasksCompleted ?? 0), 0);
  const completionRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const NUDGE: Record<string, { text: string; action: string }> = {
    Idea:       { text: "You haven't validated yet.", action: "Talk to 5 real people today →" },
    Validation: { text: "Validation is about behavior, not opinions.", action: "Get someone to pre-pay or commit time →" },
    MVP:        { text: "Stop polishing. Someone needs to use it.", action: "Send your link to 3 people right now →" },
    Launch:     { text: "Visibility beats perfection.", action: "Post on Product Hunt this week →" },
    Growth:     { text: "Retention compounds. Acquisition doesn't.", action: "Call one churned user today →" },
    Revenue:    { text: "Revenue is signal. What is it telling you?", action: "Map your top 3 churned users →" },
  };
  const nudge = NUDGE[stage] ?? NUDGE.Idea;

  if (isLoading) return <BuildMindLoader variant="card" label="Loading overview…" />;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{ maxWidth: 680, margin: "0 auto", fontFamily: "system-ui,sans-serif", color: "var(--bm-text)", paddingBottom: 48 }}>

      <div style={{ marginBottom: 20, paddingBottom: 14, borderBottom: "1px solid var(--bm-border)" }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: "#fff", letterSpacing: "-0.02em" }}>Overview</div>
        <div style={{ fontSize: 12, color: "var(--bm-text4)", marginTop: 2 }}>
          {summaries.length} project{summaries.length !== 1 ? "s" : ""} · {streak}d streak · {completionRate}% complete
        </div>
      </div>

      {/* AI Visual Widget — portfolio-level insight */}
      <AIVisualWidget
        page="overview"
        intent="Generate a founder portfolio snapshot: show a visual grid of all projects with their stages and scores, a momentum trend summary, and one sharp recommendation for what to focus on this week"
        context={{ streak, completionRate, totalProjects: summaries.length }}
        data={{
          projects: summaries.map(s => ({
            title: s.title,
            stage: s.startup_stage ?? "Idea",
            progress: s.progress ?? 0,
            tasksCompleted: s.tasksCompleted ?? 0,
            tasksTotal: s.tasksTotal ?? 1,
          })),
          score,
        }}
        label="Analyze my portfolio"
        className="mb-4"
      />

      {/* Metrics row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 12, padding: "14px 12px", textAlign: "center" }}>
          <motion.div animate={{ scale: streak >= 3 ? [1, 1.2, 1] : 1 }} transition={{ duration: 0.6, delay: 0.5 }}
            style={{ fontSize: 22, marginBottom: 4 }}>🔥</motion.div>
          <div style={{ fontSize: 22, fontWeight: 700, color: streakColor, lineHeight: 1 }}>{streak}d</div>
          <div style={{ fontSize: 10, color: "var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 3 }}>Streak</div>
          {streak === 0 && <div style={{ fontSize: 10, color: "#f87171", marginTop: 4 }}>Start today</div>}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 12, padding: "14px 12px", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <ScoreRing val={score} color={scoreColor} size={58} />
          <div style={{ fontSize: 10, color: "var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 6 }}>Exec Score</div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 12, padding: "14px 12px", textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#a78bfa", lineHeight: 1, marginBottom: 4 }}>{doneTasks}</div>
          <div style={{ fontSize: 10, color: "var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Tasks done</div>
          <div style={{ height: 4, background: "var(--bm-bg3)", borderRadius: 99, overflow: "hidden" }}>
            <motion.div initial={{ width: 0 }} animate={{ width: `${completionRate}%` }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }}
              style={{ height: "100%", background: "#6366f1", borderRadius: 99 }} />
          </div>
          <div style={{ fontSize: 10, color: "var(--bm-text4)", marginTop: 4 }}>{completionRate}% done</div>
        </motion.div>
      </div>

      {/* Stage journey */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
        <div style={{ fontSize: 10, color: "var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12 }}>Stage journey</div>
        <div style={{ display: "flex", alignItems: "center" }}>
          {STAGES.map((s, i) => {
            const isDone = i < stageIdx;
            const isActive = i === stageIdx;
            const dotColor = isDone ? "#4ade80" : isActive ? "#818cf8" : "var(--bm-bg3)";
            return (
              <div key={s} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
                  {i > 0 && <div style={{ flex: 1, height: 2, background: isDone ? "#4ade80" : "var(--bm-bg3)" }} />}
                  <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }}
                    transition={{ delay: 0.2 + i * 0.05, type: "spring", stiffness: 400 }}
                    style={{ width: isActive ? 14 : 9, height: isActive ? 14 : 9, borderRadius: "50%", background: dotColor, flexShrink: 0, boxShadow: isActive ? "0 0 10px #818cf8" : "none" }} />
                  {i < STAGES.length - 1 && <div style={{ flex: 1, height: 2, background: isDone ? "#4ade80" : "var(--bm-bg3)" }} />}
                </div>
                <div style={{ fontSize: 9, color: isActive ? "#818cf8" : isDone ? "#4ade80" : "var(--bm-text4)", marginTop: 5, fontWeight: isActive ? 600 : 400 }}>
                  {s}
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Nudge */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
        onClick={() => router.push("/today")}
        style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 12, padding: "14px 16px", marginBottom: 14, cursor: "pointer" }}>
        <div style={{ fontSize: 10, color: "#818cf8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>⚡ Right now</div>
        <div style={{ fontSize: 13, color: "var(--bm-text2)", marginBottom: 4 }}>{nudge.text}</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#818cf8" }}>{nudge.action}</div>
      </motion.div>

      {/* Active project */}
      {activeProject && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          onClick={() => router.push(`/projects/${activeProject.id}`)}
          style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 12, padding: "14px 16px", marginBottom: 14, cursor: "pointer" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, color: "var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Active project</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>{activeProject.title}</div>
            </div>
            <span style={{ fontSize: 11, color: "#818cf8", background: "rgba(129,140,248,0.1)", border: "1px solid rgba(129,140,248,0.2)", borderRadius: 6, padding: "3px 9px", flexShrink: 0, marginLeft: 10 }}>{stage}</span>
          </div>
          <div style={{ height: 4, background: "var(--bm-bg3)", borderRadius: 99, overflow: "hidden", marginBottom: 6 }}>
            <motion.div initial={{ width: 0 }} animate={{ width: `${activeProject.progress ?? 0}%` }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.4 }}
              style={{ height: "100%", background: (activeProject.progress ?? 0) >= 60 ? "#4ade80" : "#6366f1", borderRadius: 99 }} />
          </div>
          <div style={{ fontSize: 11, color: "var(--bm-text4)" }}>{activeProject.tasksCompleted} / {activeProject.tasksTotal} tasks · {activeProject.progress ?? 0}%</div>
        </motion.div>
      )}

      {/* Quick actions */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, color: "var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Quick actions</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[
            { label: "Today's action", desc: "One high-leverage task", href: "/today", emoji: "⚡" },
            { label: "AI Coach", desc: "Ask anything, get direct answers", href: "/ai-coach", emoji: "🤖" },
            { label: "Break My Startup", desc: "Failure + competitor analysis", href: "/break-my-startup", emoji: "🔥" },
            { label: "Reflect", desc: "Log what actually happened", href: "/reflect", emoji: "🪞" },
            { label: "Weekly Report", desc: "Intention vs action gap", href: "/reports", emoji: "📋" },
            { label: "Startup Kit", desc: "Names, domains, branding", href: "/startup-kit", emoji: "💡" },
          ].map((item, i) => (
            <motion.div key={item.label}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.38 + i * 0.04 }}
              onClick={() => router.push(item.href)}
              style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 10, padding: "12px 13px", cursor: "pointer" }}>
              <div style={{ fontSize: 18, marginBottom: 5 }}>{item.emoji}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#fff", marginBottom: 2 }}>{item.label}</div>
              <div style={{ fontSize: 11, color: "var(--bm-text4)", lineHeight: 1.4 }}>{item.desc}</div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* All projects list */}
      {summaries.length > 1 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          <div style={{ fontSize: 10, color: "var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>All projects</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {summaries.map((s, i) => {
              const sc = computeStartupScore(s);
              return (
                <motion.div key={s.id}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 + i * 0.04 }}
                  onClick={() => router.push(`/projects/${s.id}`)}
                  style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: 10, padding: "11px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</div>
                    <div style={{ fontSize: 11, color: "var(--bm-text4)", marginTop: 1 }}>{s.startup_stage ?? "Idea"} · {s.tasksCompleted}/{s.tasksTotal} tasks</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: sc >= 60 ? "#4ade80" : sc >= 30 ? "#fbbf24" : "#f87171" }}>{sc}</div>
                    <div style={{ fontSize: 9, color: "var(--bm-text4)", textTransform: "uppercase" }}>score</div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
