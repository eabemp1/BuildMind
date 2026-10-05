"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";
import { computeStartupScore } from "@/lib/buildmind";
import { buildExecutionPicture, type Tone } from "@/lib/executionPicture";
import { selectActiveProject, useActiveProjectId, useProjectSummariesQuery, useDashboardOverviewQuery, useFounderScorecardQuery, useFounderStandingQuery } from "@/lib/queries";
import { recordScore, markActiveToday, recordPendingTasks, syncUrgencyFromServer } from "@/lib/urgency";
import { getStoredStreak, syncStreakFromServer } from "@/lib/plan";
import { getScoreHistory, syncScoreHistory, syncXP, computeConsistencyBonus } from "@/lib/scoring";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import { ProfileCompletenessBar } from "@/components/ProfileCompletenessBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { FolderKanban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MrrWidget } from "@/components/MrrWidget";
import { storage } from "@/lib/storage";
import { fetchBehaviorState } from "@/lib/userBehaviorState";

// ── Stage badge colours ───────────────────────────────────────────────────────
const STAGE_COLOUR: Record<string, string> = {
  Idea:       "var(--bm-text3)",
  Validation: "var(--bm-accent)",
  MVP:        "var(--bm-amber)",
  Launch:     "var(--bm-green)",
  Growth:     "var(--bm-green)",
  Revenue:    "var(--bm-green)",
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
  const [serverTodayDone, setServerTodayDone] = useState(false);

  useEffect(() => {
    // Bug fix: currentMrr previously always started at 0 and was never
    // synced from the loaded project, so the MRR widget showed
    // "Pre-revenue" on every reload even for founders who'd already set
    // an MRR value. Hydrate it from the active project whenever it loads
    // or changes.
    if (activeProject?.current_mrr != null) {
      setCurrentMrr(activeProject.current_mrr);
    }
  }, [activeProject?.id, activeProject?.current_mrr]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const cachedUid = localStorage.getItem("bm_active_user_id");
    if (cachedUid) storage.onSignIn(cachedUid);
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
          fetchBehaviorState<{ checkin_done_date: string }>(["checkin_done_date"])
            .then((values) => {
              const today = new Date().toLocaleDateString("en-CA");
              setServerTodayDone(values.checkin_done_date === today);
              if (values.checkin_done_date === today) {
                storage.set(`bm_checkin_done_date_${uid}`, today);
              }
            })
            .catch(() => {});
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

  const { data: scorecard } = useFounderScorecardQuery();
  const { data: standing } = useFounderStandingQuery(activeProject?.id, true);

  // One streak: the server's lapse-aware count (lib/streak.ts). The overview
  // payload, scorecard and local cache all come from the same rule now, so the
  // order here only decides which arrives first.
  const streak = scorecard?.streak ?? overview?.founderStreakDays ?? localStreak;

  const score = activeProject ? computeStartupScore({ ...activeProject, xp: scorecard?.xp ?? 0, streak }) : 0;

  const scoreDelta = useMemo(() => {
    const history = getScoreHistory();
    if (history.length < 2) return null;
    const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date));
    const prev = sorted[1]?.score;
    if (prev == null || score === 0) return null;
    return score - prev;
  }, [score]);

  const consistencyBonus = useMemo(() => computeConsistencyBonus(getScoreHistory()), [score]);
  const cadence = overview?.aiAdviceQuality ?? Math.round((consistencyBonus / 10) * 100);
  const stage = activeProject?.startup_stage ?? "Idea";
  const milestonesCompleted = overview?.milestonesCompleted ?? 0;
  const totalTasks = activeProject?.tasksTotal ?? 0;
  const doneTasks = overview?.completedTasks ?? activeProject?.tasksCompleted ?? 0;

  const todayStr = now.toLocaleDateString("en-CA");
  const todayDone = userId
    ? Boolean(overview?.todayDone || serverTodayDone || storage.get(`bm_checkin_done_date_${userId}`) === todayStr)
    : false;

  const daysSinceReflection = useMemo(() => {
    if (overview?.daysSinceLastReflection != null) return overview.daysSinceLastReflection;
    if (overview?.reflectionDoneToday) return 0;
    for (let i = 0; i <= 3; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      if (storage.get(`bm_reflect_done_${d.toLocaleDateString("en-CA")}`)) return i;
    }
    return null;
  }, [score, overview?.daysSinceLastReflection, overview?.reflectionDoneToday]);

  const pendingTasks: string[] = (activeProject?.pendingTasks ?? []).filter(Boolean);
  const picture = buildExecutionPicture({
    stage,
    readinessTier: standing?.readiness.tier,
    tasksTotal: totalTasks,
    tasksDone: doneTasks,
    milestonesCompleted,
    streak,
    streakAtRisk: scorecard?.streakAtRisk,
    lastStreak: scorecard?.lastStreak,
    todayDone,
    daysSinceReflection,
    scoreDelta,
    nextMilestone: activeProject?.pendingMilestones?.[0] ?? null,
    nextTask: pendingTasks[0] ?? null,
  });

  useEffect(() => {
    if (score > 0) { recordScore(score); markActiveToday(); }
    const pending = activeProject ? Math.max(0, (activeProject.tasksTotal ?? 0) - (activeProject.tasksCompleted ?? 0)) : 0;
    if (pending > 0) recordPendingTasks(pending);
    const p = activeProject as unknown as Record<string, number> | null;
    setCurrentMrr(p?.current_mrr ?? 0);
  }, [score, activeProject]);

  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const founderFirst = overview?.founderName?.split(" ")[0] ?? null;

  if (isLoading || overviewLoading) {
    return (
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 20px" }}>
        <div style={{ height: 14, width: 160, borderRadius: 6, background: "var(--bm-bg3)", marginBottom: 14 }} className="animate-pulse" />
        <div style={{ height: 170, borderRadius: 16, background: "var(--bm-bg3)", marginBottom: 16 }} className="animate-pulse" />
        <div style={{ height: 76, borderRadius: 12, background: "var(--bm-bg3)", marginBottom: 16 }} className="animate-pulse" />
        <div style={{ height: 220, borderRadius: 12, background: "var(--bm-bg3)" }} className="animate-pulse" />
      </div>
    );
  }

  const evidence = standing?.readiness.evidence;
  const TONE: Record<Tone, { c: string; label: string }> = {
    good:   { c: "var(--bm-green)", label: "Strong" },
    steady: { c: "var(--bm-accent)", label: "Steady" },
    watch:  { c: "var(--bm-amber)", label: "Needs attention" },
    risk:   { c: "var(--bm-red)", label: "At risk" },
  };
  const tone = TONE[picture.tone];
  const mono = "'DM Mono', monospace";
  const card: React.CSSProperties = { border: "1px solid var(--bm-border)", borderRadius: 14, background: "var(--bm-bg2)" };
  const eyebrow: React.CSSProperties = { margin: 0, fontFamily: mono, fontSize: 10, color: "var(--bm-text4)", letterSpacing: ".08em", textTransform: "uppercase" };

  const R = 40, C = 2 * Math.PI * R;

  const stats = [
    { label: "Startup score", value: score > 0 ? `${score}` : "—", sub: scoreDelta == null ? "baseline" : `${scoreDelta >= 0 ? "+" : ""}${scoreDelta} vs last reading`, tip: "Built from task completion, reflection quality and consistency. Decays slowly if you go quiet." },
    { label: "Streak", value: `${streak}d`, sub: scorecard?.streakDoneToday ? "extended today" : scorecard?.streakAtRisk ? "ends tonight" : streak === 0 ? "start today" : "alive", tip: "Consecutive days with at least one completed, partial or learned action. Blocked and skipped days do not count." },
    { label: "Milestones", value: `${milestonesCompleted}`, sub: "completed", tip: "Stage-level objectives completed on this project." },
    { label: "Cadence", value: `${cadence}%`, sub: "last 14 days", tip: "Active days, reflection depth and confidence over the last 14 days. Drops when you go quiet." },
  ];

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 20px 72px" }}>
      <ProfileCompletenessBar
        fields={{
          startupSummary: activeProject?.description ?? activeProject?.startup_summary ?? "",
          stage:          activeProject?.stage ?? activeProject?.startup_stage ?? "",
          targetUsers:    activeProject?.target_users ?? "",
          avoidanceZones: overview?.avoidanceZones ?? [],
          mrr:            activeProject?.current_mrr ?? 0,
          displayName:    overview?.founderName ?? "",
          tasksCompleted: doneTasks,
        }}
      />

      <motion.header initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <p style={eyebrow}>{dateStr}</p>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 28, fontWeight: 700, letterSpacing: "-0.025em", margin: "6px 0 0", color: "var(--bm-text)" }}>
            {founderFirst ? `Execution, ${founderFirst}` : "Execution"}
          </h1>
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 99, border: "1px solid var(--bm-border)", background: todayDone ? "var(--bm-accent-dim)" : "var(--bm-bg2)", fontSize: 12, fontWeight: 600, color: todayDone ? "var(--bm-accent)" : "var(--bm-text3)" }}>
          {todayDone ? <CheckCircle2 size={13} /> : <Circle size={13} />}
          {todayDone ? "Today done" : "Today open"}
        </div>
      </motion.header>

      {activeProject && (
        <>
          {/* Verdict: the one statement everything else supports */}
          <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            style={{ ...card, padding: "22px 22px 20px", marginBottom: 16, borderColor: "var(--bm-border)", boxShadow: `inset 3px 0 0 ${tone.c}` }}>
            <div style={{ display: "flex", gap: 20, alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ ...eyebrow, color: tone.c }}>{activeProject.title} · {stage} · {tone.label}</p>
                <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: "clamp(21px,4.6vw,27px)", lineHeight: 1.2, letterSpacing: "-0.02em", margin: "8px 0 8px", color: "var(--bm-text)" }}>{picture.verdict}</h2>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "var(--bm-text2)", maxWidth: 520 }}>
                  {picture.because}
                  {standing?.readiness.detail ? ` ${standing.readiness.detail}` : ""}
                </p>
              </div>
              <div style={{ position: "relative", width: 96, height: 96, flexShrink: 0 }} aria-label={`${picture.completionPct}% of tasks complete`}>
                <svg width="96" height="96" viewBox="0 0 96 96" style={{ transform: "rotate(-90deg)" }}>
                  <circle cx="48" cy="48" r={R} fill="none" stroke="var(--bm-bg4)" strokeWidth="6" />
                  <motion.circle cx="48" cy="48" r={R} fill="none" stroke={tone.c} strokeWidth="6" strokeLinecap="round"
                    strokeDasharray={C} initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - picture.completionPct / 100) }}
                    transition={{ duration: 0.9, ease: "easeOut", delay: 0.2 }} />
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 22, fontWeight: 600, color: "var(--bm-text)", lineHeight: 1 }}>{picture.completionPct}%</span>
                  <span style={{ fontFamily: mono, fontSize: 9, color: "var(--bm-text4)", marginTop: 3 }}>{doneTasks}/{totalTasks} tasks</span>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--bm-border)", display: "flex", gap: 14, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
              <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                <p style={eyebrow}>Next move</p>
                <p style={{ margin: "5px 0 2px", fontSize: 15, fontWeight: 500, color: "var(--bm-text)" }}>{picture.nextMove.label}</p>
                <p style={{ margin: 0, fontSize: 12, color: "var(--bm-text3)", lineHeight: 1.5 }}>{picture.nextMove.why}</p>
              </div>
              <Button size="sm" onClick={() => router.push(picture.nextMove.href)} style={{ background: "var(--bm-amber)", color: "#111" }}>
                {todayDone ? "Review Today" : "Open Today"} <ArrowRight size={14} />
              </Button>
            </div>

            {picture.watch.length > 0 && (
              <ul style={{ margin: "16px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                {picture.watch.map(w => (
                  <li key={w} style={{ display: "flex", gap: 9, fontSize: 13, color: "var(--bm-text2)", lineHeight: 1.5 }}>
                    <span className="bm-status-dot" style={{ background: "var(--bm-amber)", marginTop: 6, flexShrink: 0 }} />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            )}
          </motion.section>

          {/* Four numbers, each defined once */}
          <div className="grid grid-cols-2 sm:grid-cols-4" style={{ ...card, overflow: "hidden", marginBottom: 16 }}>
            {stats.map((st, i) => (
              <div key={st.label} title={st.tip} style={{ padding: "14px 16px", borderRight: i < 3 ? "1px solid var(--bm-border)" : "none", borderBottom: i < 2 ? "1px solid var(--bm-border)" : "none" }} className={i === 1 ? "max-sm:[border-right:none]" : ""}>
                <p style={{ margin: 0, fontSize: 11, color: "var(--bm-text3)" }}>{st.label}</p>
                <p style={{ margin: "6px 0 3px", fontSize: 24, fontWeight: 500, color: "var(--bm-text)", lineHeight: 1 }}>{st.value}</p>
                <p style={{ margin: 0, fontFamily: mono, fontSize: 10, color: "var(--bm-text4)" }}>{st.sub}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" style={{ marginBottom: 22 }}>
            <section style={{ ...card, padding: "18px 20px" }}>
              <p style={eyebrow}>Active milestone</p>
              <h3 style={{ margin: "6px 0 14px", fontSize: 17, fontWeight: 600, color: "var(--bm-text)" }}>
                {activeProject.pendingMilestones?.[0] ?? "No open milestone"}
              </h3>
              {pendingTasks.length > 0 ? (
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                  {pendingTasks.slice(0, 4).map((task, i) => (
                    <li key={`${i}-${task}`} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13.5, color: "var(--bm-text2)", lineHeight: 1.45 }}>
                      <Circle size={15} style={{ color: "var(--bm-text4)", marginTop: 2, flexShrink: 0 }} />
                      <span>{task}</span>
                    </li>
                  ))}
                  {pendingTasks.length > 4 && <li style={{ fontSize: 12, color: "var(--bm-text4)" }}>+{pendingTasks.length - 4} more</li>}
                </ul>
              ) : (
                <p style={{ margin: 0, fontSize: 13, color: "var(--bm-text4)" }}>No open tasks on this milestone. Today will propose the next one.</p>
              )}
            </section>

            <section style={{ ...card, padding: "18px 20px" }}>
              <p style={eyebrow}>Evidence for {stage}</p>
              {evidence ? (
                <>
                  <p style={{ margin: "8px 0 10px", fontSize: 13.5, color: "var(--bm-text2)" }}>{evidence.filledSlots} of {evidence.totalSlots} proof slots filled</p>
                  <ProgressBar value={evidence.filledSlots} max={evidence.totalSlots} />
                  {evidence.missingLabels.length > 0 && (
                    <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "var(--bm-text3)", lineHeight: 1.55 }}>
                      Still missing: {evidence.missingLabels.slice(0, 3).join(", ")}{evidence.missingLabels.length > 3 ? ` and ${evidence.missingLabels.length - 3} more` : ""}.
                    </p>
                  )}
                </>
              ) : (
                <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--bm-text4)", lineHeight: 1.55 }}>Proof slots open once this stage's milestones are complete.</p>
              )}
            </section>
          </div>
        </>
      )}

      {summaries.length === 0 && (
        <EmptyState
          icon={FolderKanban}
          title="No operating system yet"
          body="Create a project so BuildMind can establish objectives, constraints, and execution cadence."
          action={<Button onClick={() => router.push("/projects")}>Create your first project <ArrowRight size={14} /></Button>}
        />
      )}

      {summaries.length > 0 && (
        <motion.section initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <p style={eyebrow}>Projects</p>
            <Link href="/projects" style={{ fontSize: 12, color: "var(--bm-text3)", textDecoration: "none" }}>View all →</Link>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {summaries.slice(0, 4).map((s) => {
              const stageColor = STAGE_COLOUR[s.startup_stage ?? "Idea"] ?? "var(--bm-text3)";
              return (
                <div key={s.id} style={{ ...card, padding: "13px 16px", borderRadius: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: "var(--bm-text)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: stageColor, flexShrink: 0, padding: "2px 7px", borderRadius: 99, border: `1px solid ${stageColor}` }}>{s.startup_stage ?? "Idea"}</span>
                    <Link href={`/projects/${s.id}`} style={{ flexShrink: 0, fontSize: 11, color: "var(--bm-text3)", border: "1px solid var(--bm-border)", borderRadius: 6, padding: "4px 10px", textDecoration: "none" }}>Open</Link>
                  </div>
                  <ProgressBar value={s.tasksCompleted ?? 0} max={s.tasksTotal ?? 0} />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, gap: 8 }}>
                    <span style={{ fontSize: 11, color: "var(--bm-text4)" }}>
                      {s.tasksCompleted ?? 0}/{s.tasksTotal ?? 0} tasks{s.lastActivity ? ` · active ${relTime(s.lastActivity)}` : ""}
                    </span>
                    {activeProject?.id === s.id && <MrrWidget projectId={s.id} currentMrr={currentMrr} onUpdate={setCurrentMrr} />}
                  </div>
                </div>
              );
            })}
          </div>

          {scoreHistory.length >= 2 && (
            <div style={{ marginTop: 22 }}>
              <p style={eyebrow}>Score, last 7 readings</p>
              <Sparkline history={scoreHistory} />
            </div>
          )}
        </motion.section>
      )}
    </div>
  );
}
