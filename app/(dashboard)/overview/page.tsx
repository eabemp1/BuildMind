"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";
import { computeStartupScore } from "@/lib/buildmind";
import { selectActiveProject, useActiveProjectId, useProjectSummariesQuery, useDashboardOverviewQuery } from "@/lib/queries";
import { recordScore, markActiveToday, recordPendingTasks, syncUrgencyFromServer } from "@/lib/urgency";
import { getStoredStreak, syncStreakFromServer } from "@/lib/plan";
import { getXP, getScoreHistory, syncScoreHistory, syncXP, computeConsistencyBonus } from "@/lib/scoring";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { ProfileCompletenessBar } from "@/components/ProfileCompletenessBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { FolderKanban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MrrWidget } from "@/components/MrrWidget";
import { storage } from "@/lib/storage";

// ── Stage badge colours ───────────────────────────────────────────────────────
const STAGE_COLOUR: Record<string, string> = {
  Idea:       "var(--bm-text3)",
  Validation: "var(--bm-accent)",
  MVP:        "var(--bm-amber)",
  Launch:     "var(--bm-green)",
  Growth:     "var(--bm-green)",
  Revenue:    "var(--bm-green)",
};

// ── AI nudge map ──────────────────────────────────────────────────────────────
const NUDGE: Record<string, { text: string; action: string }> = {
  Idea:       { text: "Validation risk is the current constraint.",                     action: "Run one customer conversation before building." },
  Validation: { text: "Commitment quality matters more than opinion volume.",            action: "Secure one paid, time, or workflow commitment." },
  MVP:        { text: "Usage evidence is now more valuable than product polish.",        action: "Put the working link in front of three real users." },
  Launch:     { text: "Distribution is the operational bottleneck.",                    action: "Publish one clear launch asset and measure response." },
  Growth:     { text: "Retention is the strongest signal in this stage.",               action: "Interview one churned or inactive user." },
  Revenue:    { text: "Revenue is the operating signal.",                               action: "Map the largest leak in acquisition-to-payment." },
};

// ── Relative time ─────────────────────────────────────────────────────────────
function relTime(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 2) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Progress bar (2px height, Linear-like) ────────────────────────────────────
function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ width: "100%", height: 2, borderRadius: 99, background: "var(--bm-bg4)", overflow: "hidden" }}>
      <motion.div
        style={{ height: "100%", borderRadius: 99, background: "var(--grad-primary)" }}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.7, ease: "easeOut", delay: 0.2 }}
      />
    </div>
  );
}

function MetricTooltip({ text }: { text: string }) {
  return (
    <span
      title={text}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 14,
        height: 14,
        borderRadius: "50%",
        border: "1px solid var(--bm-border2)",
        color: "var(--bm-text4)",
        fontSize: 9,
        fontWeight: 700,
        cursor: "help",
        marginLeft: 4,
        flexShrink: 0,
      }}
    >
      ?
    </span>
  );
}

// ── 7-day sparkline ───────────────────────────────────────────────────────────
function Sparkline({ history }: { history: { date: string; score: number }[] }) {
  if (history.length < 2) return null;
  const last7 = history.slice(-7);
  const maxV = Math.max(...last7.map(h => h.score), 1);
  const minV = Math.min(...last7.map(h => h.score));
  const range = maxV - minV || 1;
  const W = 240, H = 36, pad = 4;
  const pts = last7.map((h, i) => {
    const x = pad + (i / Math.max(last7.length - 1, 1)) * (W - pad * 2);
    const y = pad + ((maxV - h.score) / range) * (H - pad * 2);
    return `${x},${y}`;
  }).join(" ");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
      <span style={{ fontSize: 11, color: "var(--bm-text4)", minWidth: 24 }}>{last7[0]?.score}</span>
      <svg width={W} height={H} style={{ flex: 1 }}>
        <polyline points={pts} fill="none" stroke="var(--bm-accent)" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      <span style={{ fontSize: 11, color: "var(--bm-text4)", minWidth: 24, textAlign: "right" }}>
        {last7[last7.length - 1]?.score}
      </span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function OverviewPage() {
  const router = useRouter();
  const { data: summaries = [], isLoading } = useProjectSummariesQuery();
  const activeProjectId = useActiveProjectId();
  const activeProject = useMemo(() => selectActiveProject(summaries, activeProjectId), [summaries, activeProjectId]);
  const { data: overview, isLoading: overviewLoading } = useDashboardOverviewQuery(activeProject?.id);
  const [localStreak, setLocalStreak] = useState(0);
  const [scoreHistory, setScoreHistory] = useState<{ date: string; score: number }[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [currentMrr, setCurrentMrr] = useState<number>(0);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const refresh = () => setLocalStreak(getStoredStreak());
    refresh();
    setScoreHistory(getScoreHistory());
    window.addEventListener("storage", refresh);
    window.addEventListener("bm_streak_updated", refresh);
    syncUrgencyFromServer().then(refresh).catch(() => {});
    import("@/lib/plan")
      .then(({ syncStreakFromServer }) => syncStreakFromServer())
      .then(refresh)
      .catch(() => {});
    void syncScoreHistory().then(() => setScoreHistory(getScoreHistory()));
    void syncXP();
    // Get userId for today-done check
    import("@/lib/supabase/client").then(({ createClient }) => {
      createClient().auth.getUser().then(({ data }) => {
        const uid = data?.user?.id ?? null;
        if (uid) {
          setUserId(uid);
          storage.onSignIn(uid);
          syncStreakFromServer().then(refresh).catch(refresh);
        }
      });
    });
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("bm_streak_updated", refresh);
    };
  }, []);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const streak = overview?.founderStreakDays ?? localStreak;

  const score = activeProject ? computeStartupScore({ ...activeProject, xp: getXP(), streak }) : 0;

  const scoreDelta = useMemo(() => {
    const history = getScoreHistory();
    if (history.length < 2) return null;
    const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date));
    const prev = sorted[1]?.score;
    if (prev == null || score === 0) return null;
    return score - prev;
  }, [score]);

  const consistencyBonus = useMemo(() => computeConsistencyBonus(getScoreHistory()), [score]);
  const consistencyPct = Math.round((consistencyBonus / 10) * 100);
  const stage = activeProject?.startup_stage ?? "Idea";
  const milestonesCompleted = overview?.milestonesCompleted ?? 0;
  const totalTasks = activeProject?.tasksTotal ?? 0;
  const doneTasks = activeProject?.tasksCompleted ?? 0;
  const nudge = NUDGE[stage] ?? NUDGE.Idea;

  // Is today's check-in done?
  const todayStr = now.toLocaleDateString("en-CA");
  const todayDone = userId
    ? storage.get(`bm_checkin_done_date_${userId}`) === todayStr
    : false;

  useEffect(() => {
    if (score > 0) { recordScore(score); markActiveToday(); }
    const pending = activeProject ? Math.max(0, (activeProject.tasksTotal ?? 0) - (activeProject.tasksCompleted ?? 0)) : 0;
    if (pending > 0) recordPendingTasks(pending);
    const p = activeProject as unknown as Record<string, number> | null;
    setCurrentMrr(p?.current_mrr ?? 0);
  }, [score, activeProject]);

  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const founderFirst = overview?.founderName?.split(" ")[0] ?? null;

  // Attention strip conditions
  // Memoized so storage.get() isn't called on every render — depends on score
  // which changes when check-ins are recorded.
  const noReflectIn3Days = useMemo(() => {
    for (let i = 1; i <= 3; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = `bm_reflect_done_${d.toLocaleDateString("en-CA")}`;
      if (storage.get(key)) return false;
    }
    return true;
  }, [score]);
  const showAttention =
    (scoreDelta != null && scoreDelta < -10) ||
    (streak === 0 && totalTasks > 0 && doneTasks / totalTasks < 0.5) ||
    noReflectIn3Days;

  const attentionMessage = scoreDelta != null && scoreDelta < -10
    ? `Score dropped ${Math.abs(scoreDelta)} points — check what's blocking progress.`
    : noReflectIn3Days
    ? "No reflection logged in 3 days — tomorrow's task will be less accurate."
    : "Completion rate is below 50% — break your next task into smaller steps.";
  const attentionRoute = "/today";
  const attentionLabel = noReflectIn3Days ? "Reflect on today →" : "Go to today →";

  if (isLoading || overviewLoading) {
    return (
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "36px 24px" }}>
        <div style={{ height: 28, width: 200, borderRadius: 8, background: "var(--bm-bg3)", marginBottom: 8 }} className="animate-pulse" />
        <div style={{ height: 14, width: 120, borderRadius: 6, background: "var(--bm-bg3)", marginBottom: 32 }} className="animate-pulse" />
        <div style={{ display: "flex", gap: 0, borderRadius: 10, border: "1px solid var(--bm-border)", overflow: "hidden", marginBottom: 24, height: 64 }} className="animate-pulse" />
        {[1, 2, 3].map(i => (
          <div key={i} style={{ height: 72, borderRadius: 12, background: "var(--bm-bg3)", marginBottom: 10 }} className="animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "36px 24px 60px" }}>

      {/* ── Profile completeness (only shows when score < 80) ── */}
      <ProfileCompletenessBar
        fields={{
          startupSummary: activeProject?.description ?? activeProject?.startup_summary ?? "",
          stage:          activeProject?.stage ?? activeProject?.startup_stage ?? "",
          targetUsers:    activeProject?.target_users ?? "",
          avoidanceZones: overview?.avoidanceZones ?? [],
          mrr:            activeProject?.mrr ?? 0,
          displayName:    overview?.founderName ?? "",
          tasksCompleted: activeProject?.tasksCompleted ?? 0,
        }}
      />

      {/* ── Header ── */}
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--bm-text)", letterSpacing: "-0.03em", margin: 0, lineHeight: 1.2 }}>
              {founderFirst ? `${founderFirst}'s workspace` : "Workspace"}
            </h1>
            <p style={{ fontSize: 13, color: "var(--bm-text3)", margin: "4px 0 0", lineHeight: 1 }}>
              {dateStr}
              {streak > 0 && <span style={{ marginLeft: 8, color: "var(--bm-amber)" }}>· {streak}d streak</span>}
            </p>
          </div>
          {/* Today done chip */}
          <div style={{
            display: "flex", alignItems: "center", gap: 5, padding: "5px 12px",
            borderRadius: 99, border: "1px solid var(--bm-border)",
            background: todayDone ? "var(--bm-accent-dim)" : "var(--bm-bg2)",
            fontSize: 12, fontWeight: 600,
            color: todayDone ? "var(--bm-accent)" : "var(--bm-text3)",
          }}>
            {todayDone ? <CheckCircle2 size={12} /> : <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--bm-bg4)", display: "inline-block" }} />}
            Today: {todayDone ? "Done ✓" : "Not done"}
          </div>
        </div>
        {activeProject && (
          <p style={{ fontSize: 12, color: "var(--bm-text4)", marginTop: 6 }}>
            Active: <span style={{ color: "var(--bm-text3)", fontWeight: 500 }}>{activeProject.title}</span>
            &nbsp;·&nbsp;
            <span style={{ color: STAGE_COLOUR[stage] ?? "var(--bm-text3)" }}>{stage}</span>
          </p>
        )}
      </motion.div>

      {/* ── Attention strip ── */}
      {showAttention && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 }}
          style={{ borderLeft: "2px solid var(--bm-amber)", paddingLeft: 14, marginBottom: 20 }}>
          <p style={{ fontSize: 13, color: "var(--bm-text2)", margin: "0 0 8px", lineHeight: 1.5 }}>
            {attentionMessage}
          </p>
          <button onClick={() => router.push(attentionRoute)}
            style={{ fontSize: 12, color: "var(--bm-accent)", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
            {attentionLabel}
          </button>
        </motion.div>
      )}

      {/* ── Metrics row — 4 flat stat chips ── */}
      {summaries.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          style={{ display: "flex", gap: 0, borderRadius: 10, border: "1px solid var(--bm-border)", overflow: "hidden", marginBottom: 20 }}>
          {[
            {
              label: "Momentum Score",
              value: score > 0 ? `${score}` : "—",
              delta: scoreDelta,
              tooltip: "How consistently you're executing. Built from task completion, reflection quality, and time between actions. Decays slowly if you go inactive.",
            },
            {
              label: "Streak",
              value: (streak > 0) ? `${streak}d` : (overviewLoading) ? "—" : "0d",
              tooltip: "Consecutive days you've completed at least one task or reflection. Breaks if you miss a day. Used to unlock advanced features.",
            },
            { label: "Completed", value: milestonesCompleted > 0 ? milestonesCompleted : doneTasks > 0 ? doneTasks : "—" },
            {
              label: "AI Advice Quality",
              value: `${consistencyPct}%`,
              tooltip: "How much context BuildMind has about you. Higher = more specific, personalised advice. Improve it by filling in your startup summary, target users, and logging daily reflections.",
            },
          ].map((stat, i, arr) => (
            <div key={stat.label} style={{ flex: 1, padding: "14px 16px", borderRight: i < arr.length - 1 ? "1px solid var(--bm-border)" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", fontSize: 11, color: "var(--bm-text3)", marginBottom: 4 }}>
                {stat.label}
                {"tooltip" in stat && stat.tooltip && <MetricTooltip text={stat.tooltip} />}
              </div>
              <div style={{ fontSize: 20, fontWeight: 500, color: "var(--bm-text)", lineHeight: 1 }}>
                {stat.value}
                {stat.delta != null && (
                  <span style={{ fontSize: 11, marginLeft: 5, color: stat.delta > 0 ? "var(--bm-green)" : "var(--bm-red)" }}>
                    {stat.delta > 0 ? `+${stat.delta}` : stat.delta}
                  </span>
                )}
              </div>
            </div>
          ))}
        </motion.div>
      )}

      {/* ── Empty state ── */}
      {summaries.length === 0 && (
        <EmptyState
          icon={FolderKanban}
          title="No operating system yet"
          body="Create a project so BuildMind can establish objectives, constraints, and execution cadence."
          action={
            <Button onClick={() => router.push("/projects")}>
              Create your first project <ArrowRight size={14} />
            </Button>
          }
        />
      )}

      {/* ── Projects list ── */}
      {summaries.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--bm-text3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Projects</span>
            <Link href="/projects" style={{ fontSize: 12, color: "var(--bm-text3)", textDecoration: "none" }}>View all →</Link>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {summaries.slice(0, 4).map((s, i) => {
              const stageColor = STAGE_COLOUR[s.startup_stage ?? "Idea"] ?? "var(--bm-text3)";
              const pCheckinDone = userId
                ? storage.get(`bm_checkin_done_date_${userId}`) === todayStr
                : false;

              return (
                <motion.div key={s.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.14 + i * 0.05 }}>
                  <div style={{
                    border: "1px solid var(--bm-border)", borderRadius: 12,
                    padding: "14px 16px", background: "var(--bm-bg2)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      {/* Name + stage */}
                      <span style={{ fontSize: 14, fontWeight: 500, color: "var(--bm-text)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {s.title}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: stageColor, flexShrink: 0, padding: "2px 7px", borderRadius: 99, border: "1px solid", borderColor: stageColor, opacity: 0.9 }}>
                        {s.startup_stage ?? "Idea"}
                      </span>
                      {/* Last activity */}
                      {s.lastActivity && (
                        <span style={{ fontSize: 11, color: "var(--bm-text4)", flexShrink: 0 }}>
                          {relTime(s.lastActivity)}
                        </span>
                      )}
                      {/* Today done indicator */}
                      <span style={{ fontSize: 11, color: pCheckinDone ? "var(--bm-accent)" : "var(--bm-text4)", flexShrink: 0 }}>
                        {pCheckinDone ? "✓" : "·"}
                      </span>
                      {/* View button */}
                      <Link href={`/projects/${s.id}`} style={{ flexShrink: 0 }}>
                        <button style={{ fontSize: 11, color: "var(--bm-text3)", background: "none", border: "1px solid var(--bm-border)", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>
                          View →
                        </button>
                      </Link>
                    </div>
                    {/* 2px progress bar */}
                    <ProgressBar value={s.tasksCompleted ?? 0} max={s.tasksTotal ?? 0} />
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
                      <span style={{ fontSize: 11, color: "var(--bm-text4)" }}>{s.tasksCompleted ?? 0}/{s.tasksTotal ?? 0} tasks</span>
                      {activeProject?.id === s.id && (
                        <MrrWidget projectId={s.id} currentMrr={currentMrr} onUpdate={setCurrentMrr} />
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* ── 7-day sparkline ── */}
          {scoreHistory.length >= 2 && (
            <div style={{ marginTop: 20 }}>
              <span style={{ fontSize: 11, color: "var(--bm-text4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Score — last 7 days</span>
              <Sparkline history={scoreHistory} />
            </div>
          )}

          {/* ── AI nudge — borderLeft only, no card ── */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.22 }}
            style={{ borderLeft: "2px solid var(--bm-accent)", paddingLeft: 14, marginTop: 24 }}>
            <p style={{ fontSize: 13, color: "var(--bm-text2)", margin: "0 0 6px", lineHeight: 1.55 }}>
              {nudge.text}
            </p>
            <p style={{ fontSize: 13, color: "var(--bm-text)", fontWeight: 500, margin: 0 }}>
              → {nudge.action}
            </p>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
