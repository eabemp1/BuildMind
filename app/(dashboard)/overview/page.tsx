"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";
import { computeStartupScore } from "@/lib/buildmind";
import { useProjectSummariesQuery, useDashboardOverviewQuery } from "@/lib/queries";
import { recordScore, markActiveToday, recordPendingTasks, syncUrgencyFromServer } from "@/lib/urgency";
import { getStoredStreak } from "@/lib/plan";
import { getXP, getScoreHistory, syncScoreHistory, syncXP } from "@/lib/scoring";
import {
  Zap, Flame, Target, ArrowRight, ChevronRight,
  FolderKanban, BarChart3, Clock,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScoreBreakdown } from "@/components/ui/ScoreBreakdown";

// ── Stage config ───────────────────────────────────────────────────────────────
const STAGES = ["Idea", "Validation", "MVP", "Launch", "Growth", "Revenue"];

const STAGE_BADGE: Record<string, { variant: "neutral" | "warning" | "success" | "info" | "danger" | "gradient" }> = {
  Idea: { variant: "neutral" },
  Validation: { variant: "info" },
  MVP: { variant: "warning" },
  Launch: { variant: "success" },
  Growth: { variant: "gradient" },
  Revenue: { variant: "success" },
};

// ── AI nudge map ──────────────────────────────────────────────────────────────
const NUDGE: Record<string, { text: string; action: string }> = {
  Idea: { text: "You haven't validated yet.", action: "Talk to 5 real people today →" },
  Validation: { text: "Validation is about behavior, not opinions.", action: "Get someone to pre-pay or commit time →" },
  MVP: { text: "Stop polishing. Someone needs to use it.", action: "Send your link to 3 people right now →" },
  Launch: { text: "Visibility beats perfection.", action: "Post on Product Hunt this week →" },
  Growth: { text: "Retention compounds. Acquisition doesn't.", action: "Call one churned user today →" },
  Revenue: { text: "Revenue is signal. What is it telling you?", action: "Map your top 3 churned users →" },
};

// ── Pentagon radar chart ──────────────────────────────────────────────────────
function Pentagon({ scores }: { scores: Record<string, number> }) {
  const keys = ["Execution", "Product", "Growth", "Team", "Startup"];
  const cx = 100, cy = 100, r = 68;
  const angleStep = (2 * Math.PI) / keys.length;
  const getPoint = (i: number, val: number) => {
    const angle = -Math.PI / 2 + i * angleStep;
    const dist = (val / 100) * r;
    return { x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist };
  };
  const gridLevels = [25, 50, 75, 100];
  const dataPoints = keys.map((k, i) => getPoint(i, scores[k] ?? 50));
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";
  const overall = scores.Overall ?? 0;

  return (
    <svg viewBox="0 0 200 200" width="180" height="180" style={{ overflow: "visible" }}>
      {gridLevels.map(level => {
        const pts = keys.map((_, i) => getPoint(i, level));
        const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";
        return <path key={level} d={path} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />;
      })}
      {keys.map((_, i) => {
        const end = getPoint(i, 100);
        return <line key={i} x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />;
      })}
      <path d={dataPath} fill="rgba(92,200,138,0.1)" stroke="var(--bm-accent)" strokeWidth="1.5"
        style={{ filter: "drop-shadow(0 0 5px rgba(92,200,138,0.25))" }} />
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} fill="var(--bm-accent)"
          style={{ filter: "drop-shadow(0 0 2px rgba(92,200,138,0.5))" }} />
      ))}
      {keys.map((k, i) => {
        const angle = -Math.PI / 2 + i * angleStep;
        const lx = cx + Math.cos(angle) * (r + 22);
        const ly = cy + Math.sin(angle) * (r + 22);
        return (
          <text key={k} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
            style={{ fontSize: 8, fill: "rgba(255,255,255,0.35)", fontWeight: 600,
              letterSpacing: "0.05em", textTransform: "uppercase", fontFamily: "inherit" }}>
            {k}
          </text>
        );
      })}
      <text x={cx} y={cy - 9} textAnchor="middle"
        style={{ fontSize: 21, fontWeight: 800, fill: "var(--bm-accent)", fontFamily: "inherit" }}>
        {overall}
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle"
        style={{ fontSize: 8, fill: "rgba(255,255,255,0.3)", fontFamily: "inherit" }}>/100</text>
    </svg>
  );
}

// ── Score ring ────────────────────────────────────────────────────────────────
function ScoreRing({ val, color, size = 52 }: { val: number; color: string; size?: number }) {
  const r = (size - 7) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={5} />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={5}
          strokeLinecap="round" strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - (Math.min(val, 100) / 100) * circ }}
          transition={{ duration: 1.1, ease: "easeOut", delay: 0.2 }}
          style={{ filter: `drop-shadow(0 0 3px ${color}60)` }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: size * 0.24, fontWeight: 800, color, lineHeight: 1 }}>{val}</span>
      </div>
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="w-full h-1.5 rounded-full" style={{ background: "var(--bm-bg4)" }}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: "var(--grad-primary)" }}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }}
      />
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  accent = false,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  accent?: boolean;
}) {
  return (
    <Card
      className={
        "p-4 flex items-center gap-3 " +
        (accent
          ? "border-[var(--bm-accent-bd)] bg-[rgba(92,200,138,0.06)]"
          : "border-[var(--bm-border)]")
      }
    >
      <div className="h-9 w-9 rounded-lg flex items-center justify-center"
        style={{ background: "var(--bm-bg3)", color: "var(--bm-text2)" }}>
        {icon}
      </div>
      <div className="flex flex-col">
        <span className="text-xs uppercase tracking-wide text-[var(--bm-text3)]">{label}</span>
        <div className="text-lg font-semibold text-[var(--bm-text)]">{value}</div>
      </div>
    </Card>
  );
}

function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Card className="p-6 text-center flex flex-col items-center gap-3">
      <div className="text-base font-semibold text-[var(--bm-text)]">{title}</div>
      <div className="text-sm text-[var(--bm-text3)] max-w-md">{description}</div>
      {action ? <div className="mt-2">{action}</div> : null}
    </Card>
  );
}

function SkeletonRow() {
  return (
    <div className="h-16 rounded-xl bg-[var(--bm-bg3)] animate-pulse" />
  );
}

function SkeletonGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-20 rounded-xl bg-[var(--bm-bg3)] animate-pulse" />
      ))}
    </div>
  );
}

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

// ── Main page ─────────────────────────────────────────────────────────────────
export default function OverviewPage() {
  const router = useRouter();
  const { data: summaries = [], isLoading } = useProjectSummariesQuery();
  const { data: overview, isLoading: overviewLoading } = useDashboardOverviewQuery();
  const [localStreak, setLocalStreak] = useState(0);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const refresh = () => setLocalStreak(getStoredStreak());
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("bm_streak_updated", refresh);
    // Seed streak + lastActive from Supabase so urgency signals are correct
    // on a fresh device — fires after the localStorage read so UI is instant
    syncUrgencyFromServer().then(refresh).catch(() => {});
    // Sync score history and XP from server so delta and history are authoritative
    void syncScoreHistory();
    void syncXP();
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

  const activeProject = useMemo(() => {
    if (!summaries.length) return null;
    return summaries.reduce((a, b) =>
      new Date(b.lastActivity).getTime() > new Date(a.lastActivity).getTime() ? b : a
    );
  }, [summaries]);

  const score = activeProject ? computeStartupScore({
    ...activeProject,
    xp: getXP(),
    streak,
  }) : 0;

  // Score delta: compare today vs yesterday from history
  const scoreDelta = useMemo(() => {
    const history = getScoreHistory();
    if (history.length < 2) return null;
    const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date));
    const prev = sorted[1]?.score;
    if (prev == null || score === 0) return null;
    return score - prev;
  }, [score]);
  const validationStrengths = Array.isArray(activeProject?.validation_strengths)
    ? activeProject.validation_strengths.length
    : 0;
  const scoreColor = score >= 60 ? "var(--bm-green)" : score >= 30 ? "var(--bm-amber)" : "var(--bm-red)";
  const stage = activeProject?.startup_stage ?? "Idea";
  const milestonesCompleted = overview?.milestonesCompleted ?? 0;

  const totalTasks = summaries.reduce((a, s) => a + (s.tasksTotal ?? 0), 0);
  const doneTasks = summaries.reduce((a, s) => a + (s.tasksCompleted ?? 0), 0);
  const completionRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const nudge = NUDGE[stage] ?? NUDGE.Idea;

  const pentagonScores = useMemo(() => {
    if (!activeProject) return { Execution: 50, Product: 50, Growth: 50, Team: 50, Startup: 50, Overall: 0 };
    return {
      Execution: Math.min(100, Math.round(40 + completionRate * 0.6)),
      Product: Math.min(100, Math.round(30 + score * 0.8)),
      Growth: Math.min(100, Math.round(20 + streak * 5)),
      Team: Math.min(100, Math.round(60 + summaries.length * 5)),
      Startup: Math.min(100, score),
      Overall: score,
    };
  }, [activeProject, score, completionRate, streak, summaries.length]);

  useEffect(() => {
    if (score > 0) { recordScore(score); markActiveToday(); }
    const pending = summaries.reduce((a, s) => a + Math.max(0, (s.tasksTotal ?? 0) - (s.tasksCompleted ?? 0)), 0);
    if (pending > 0) recordPendingTasks(pending);
  }, [score, summaries]);

  const greeting = (() => {
    const h = now.getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  if (isLoading || overviewLoading) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col gap-8">
        <div className="flex flex-col gap-1">
          <div className="h-8 w-48 rounded-xl bg-[var(--bm-bg3)] animate-pulse" />
          <div className="h-4 w-32 rounded-full bg-[var(--bm-bg3)] animate-pulse opacity-60" />
        </div>
        <SkeletonGrid count={4} />
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map(i => <SkeletonRow key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-8">

      {/* ── Header ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between gap-4 flex-wrap"
      >
        <div>
          <h1 className="text-3xl font-bold text-[var(--bm-text)] tracking-tight">
            {greeting}
          </h1>
          <p className="text-sm text-[var(--bm-text3)] mt-1">{dateStr}</p>
        </div>
        {activeProject && (
          <Badge variant="neutral" size="md">
            Active: {activeProject.title}
          </Badge>
        )}
      </motion.div>

      {/* ── Metric row ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <MetricCard
          icon={<Zap size={14} />}
          label="Startup Score"
          value={
            activeProject ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <ScoreRing val={score} color={scoreColor} size={48} />
                {scoreDelta !== null && (
                  <span style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: scoreDelta > 0 ? "var(--bm-green)" : scoreDelta < 0 ? "var(--bm-red)" : "var(--bm-text3)",
                    letterSpacing: "0.02em",
                  }}>
                    {scoreDelta > 0 ? `+${scoreDelta}` : scoreDelta < 0 ? `${scoreDelta}` : "→"} vs yesterday
                  </span>
                )}
              </div>
            ) : (
              <span className="text-[var(--bm-text3)]">—</span>
            )
          }
          accent={!!activeProject}
        />
        <MetricCard
          icon={<FolderKanban size={14} />}
          label="Active Projects"
          value={summaries.length > 0 ? summaries.length : <span className="text-[var(--bm-text3)]">—</span>}
        />
        <MetricCard
          icon={<Target size={14} />}
          label="Milestones Completed"
          value={milestonesCompleted > 0 ? milestonesCompleted : <span className="text-[var(--bm-text3)]">—</span>}
        />
        <MetricCard
          icon={<Flame size={14} />}
          label="Founder Streak"
          value={streak > 0 ? `${streak}d` : <span className="text-[var(--bm-text3)]">—</span>}
        />
      </motion.div>

      {/* ── Empty state ── */}
      {summaries.length === 0 && (
        <EmptyState
          title="No projects yet"
          description="Create your first project and BuildMind will turn it into an executable plan."
          action={
            <Button onClick={() => router.push("/projects")}>
              Create your first project <ArrowRight size={14} />
            </Button>
          }
        />
      )}

      {summaries.length > 0 && (
        <div className="grid lg:grid-cols-[1fr_220px] gap-6">

          {/* ── Projects list ── */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            className="flex flex-col gap-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-[var(--bm-text)]">Your Projects</h2>
              <Link href="/projects">
                <Button variant="ghost" size="sm">
                  View all <ChevronRight size={12} />
                </Button>
              </Link>
            </div>

            <div className="flex flex-col gap-3">
              {summaries.slice(0, 3).map((s, i) => {
                const pScore = computeStartupScore(s);
                const pColor = pScore >= 60 ? "var(--bm-green)" : pScore >= 30 ? "var(--bm-amber)" : "var(--bm-red)";
                const stageKey = s.startup_stage ?? "Idea";
                const stageConf = STAGE_BADGE[stageKey] ?? { variant: "neutral" as const };

                return (
                  <motion.div
                    key={s.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.15 + i * 0.06 }}
                  >
                    <Card hover className="p-4">
                      <div className="flex items-center gap-4">
                        {/* Score ring */}
                        <ScoreRing val={pScore} color={pColor} size={44} />

                        {/* Info */}
                        <div className="flex-1 min-w-0 flex flex-col gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-[var(--bm-text)] truncate">
                              {s.title}
                            </span>
                            <Badge variant={stageConf.variant} size="sm">
                              {s.startup_stage}
                            </Badge>
                          </div>
                          <ProgressBar value={s.tasksCompleted ?? 0} max={s.tasksTotal ?? 0} />
                          <div className="flex items-center gap-3 text-xs text-[var(--bm-text3)]">
                            <span>
                              {s.tasksCompleted ?? 0}/{s.tasksTotal ?? 0} tasks
                            </span>
                            {s.lastActivity && (
                              <span className="flex items-center gap-1">
                                <Clock size={10} />
                                {relTime(s.lastActivity)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* View link */}
                        <Link href={`/projects/${s.id}`} className="shrink-0">
                          <Button variant="ghost" size="sm">
                            View <ArrowRight size={12} />
                          </Button>
                        </Link>
                      </div>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>

          {/* ── Right column: pentagon + nudge ── */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 }}
            className="flex flex-col gap-4"
          >
            {/* Score breakdown */}
            <Card className="p-5 flex flex-col items-center gap-3">
              <span className="text-xs font-medium text-[var(--bm-text3)] uppercase tracking-widest self-start">
                Score Breakdown
              </span>
              <Pentagon scores={pentagonScores} />
              {activeProject && (
                <ScoreBreakdown
                  score={score}
                  executionScore={completionRate}
                  momentumScore={Math.min(100, streak * 10)}
                  xp={getXP()}
                  streak={streak}
                  validationStrengths={validationStrengths}
                />
              )}
            </Card>

            {/* AI nudge */}
            <Card
              className="p-4 flex flex-col gap-2"
              style={{
                borderColor: "var(--bm-accent-bd)",
                background: "linear-gradient(135deg, rgba(92,200,138,0.05) 0%, var(--bm-bg2) 100%)",
              }}
            >
              <div className="flex items-center gap-1.5">
                <Zap size={12} style={{ color: "var(--bm-accent)" }} />
                <span className="text-[10px] font-semibold text-[var(--bm-accent)] uppercase tracking-widest">
                  AI Coach
                </span>
                <Badge variant="neutral" size="sm">{stage}</Badge>
              </div>
              <p className="text-xs text-[var(--bm-text2)] leading-relaxed">{nudge.text}</p>
              <p className="text-xs font-medium" style={{ color: "var(--bm-accent)" }}>
                {nudge.action}
              </p>
            </Card>
          </motion.div>
        </div>
      )}
    </div>
  );
}
