"use client";

/**
 * components/WeeklyPulseCard.tsx
 *
 * Replaces the previous `<ReportsPage />` passthrough in the "This Week" tab
 * (app/progress/page.tsx). /reports stays the separate export/reporting
 * surface — this is the fast, story-first weekly pulse: Story → Insights →
 * Evidence (sparkline) → Metrics → Grades → Share.
 *
 * Every number here is passed straight through from
 * app/api/ai/weekly-pulse/route.ts, which borrows from wherever each metric
 * is already computed (score_history, weekly_goals, scorecard, milestones,
 * founder_memory) rather than recomputing anything. This component only
 * visualizes — the "ghost vs real" sparkline is the literal implementation
 * of the founder's spec: a dotted line for the target pace, a solid line
 * for actual execution, on the same grid.
 */

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Sparkles, Target, Flame, TrendingUp, TrendingDown, Ghost } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useActiveProjectId } from "@/lib/queries";
import { sanitizeOutput } from "@/lib/sanitizeOutput";
import { ARCHETYPE_DISPLAY, type FounderArchetype } from "@/lib/founderArchetypeDisplay";
import { ShareWeekCard } from "@/components/ShareWeekCard";
import { GhostRaceCard } from "@/components/GhostRaceCard";
import type { GhostRace } from "@/lib/ghostRace";
import { DayActivityCanvas, type DayActivity } from "@/components/DayActivityCanvas";

interface MilestonePacing {
  id: string; title: string; targetDate: string | null; projectedDate: string | null;
  deltaDays: number | null; risk: "low" | "medium" | "high" | "unknown"; reason: string;
}
interface GradedDimension { label: string; score: number | null; grade: "A" | "B" | "C" | "D" | "F" | "N/A"; basis: string; }
interface SparklinePoint { date: string; real: number | null; ghost: number | null; }

interface WeeklyPulseData {
  is_quiet_week: boolean;
  momentum_score: number; momentum_delta: number | null; streak: number;
  tasks_completed: number; tasks_total: number; actions_completed: number; ghost_race: GhostRace | null; completion_rate: number; active_days: number;
  day_activity: DayActivity[];
  un_ghosted: string[]; milestones: MilestonePacing[]; archetype: string | null;
  day_of_week: Record<string, { completed: number; total: number }>;
  confidence_by_outcome: Record<string, number>; confidence_index: number | null; top_override_reason: string | null;
  weekly_goal: { goal_text: string; target_score: number; current_score: number; target_tasks: number; tasks_done: number; status: string } | null;
  sparkline: SparklinePoint[]; grades: GradedDimension[]; story: string; generated_at: string;
}

const RISK_COLOR: Record<MilestonePacing["risk"], string> = {
  low: "var(--bm-green)", medium: "var(--bm-amber, #d9a441)", high: "var(--bm-red)", unknown: "var(--bm-text3)",
};
const GRADE_COLOR: Record<GradedDimension["grade"], string> = {
  A: "var(--bm-green)", B: "var(--bm-accent)", C: "var(--bm-amber, #d9a441)", D: "var(--bm-red)", F: "var(--bm-red)", "N/A": "var(--bm-text3)",
};

/** Ghost-vs-real chart: dotted line = target pace, solid filled line =
 *  actual execution. Was two bare lines with no axis, no day context, and
 *  no way to read "how far behind/ahead" without eyeballing pixel gaps —
 *  founder feedback was it read as plain and hard to parse. Now: subtle
 *  gridlines for scale, a gradient fill under the real line so it reads as
 *  a shape rather than a wire, day-of-week labels under each point, value
 *  callouts at the real line's endpoints, and — the part that actually
 *  answers "how far behind am I" — a dashed connector + labeled gap at the
 *  most recent day both lines have a value, colored red/green/neutral by
 *  direction. Pure SVG, no chart library needed for 7 points. */
function GhostSparkline({ points, size = { w: 300, h: 148 } }: { points: SparklinePoint[]; size?: { w: number; h: number } }) {
  if (points.length < 2) {
    return <div style={{ fontSize: 11, color: "var(--bm-text3)", padding: "20px 0", textAlign: "center" }}>Not enough days logged yet this week.</div>;
  }
  const { w, h } = size;
  const padX = 10, padTop = 14, padBottom = 22; // padBottom leaves room for day labels
  const plotH = h - padTop - padBottom;
  const allValues = points.flatMap((p) => [p.real, p.ghost]).filter((v): v is number => v !== null);
  const min = Math.min(...allValues, 0);
  const max = Math.max(...allValues, 100);
  const span = Math.max(1, max - min);
  const x = (i: number) => padX + (i / (points.length - 1)) * (w - padX * 2);
  const y = (v: number) => padTop + plotH - ((v - min) / span) * plotH;
  const dayLabel = (dateStr: string) => {
    const d = new Date(`${dateStr}T00:00:00`);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 1);
  };

  const realPoints = points.map((p, i) => (p.real !== null ? { i, v: p.real } : null)).filter((p): p is { i: number; v: number } => p !== null);
  const realPath = realPoints.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i)},${y(p.v)}`).join(" ");
  const areaPath = realPoints.length > 1
    ? `${realPath} L${x(realPoints[realPoints.length - 1].i)},${padTop + plotH} L${x(realPoints[0].i)},${padTop + plotH} Z`
    : "";
  const hasGhost = points.some((p) => p.ghost !== null);
  const ghostPoints = points.map((p, i) => (p.ghost !== null ? { i, v: p.ghost } : null)).filter((p): p is { i: number; v: number } => p !== null);
  const ghostPath = ghostPoints.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i)},${y(p.v)}`).join(" ");

  // Gap callout: the most recent day where both lines have a value.
  const gapIndex = [...points.keys()].reverse().find((i) => points[i].real !== null && points[i].ghost !== null);
  const gap = gapIndex !== undefined ? Math.round((points[gapIndex].real as number) - (points[gapIndex].ghost as number)) : null;
  const gapColor = gap === null ? "var(--bm-text3)" : gap >= 0 ? "var(--bm-green)" : "var(--bm-red)";

  const gridLines = [0.25, 0.5, 0.75];

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="ghostRealFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--bm-accent)" stopOpacity={0.28} />
          <stop offset="100%" stopColor="var(--bm-accent)" stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Gridlines — scale reference, absent before */}
      {gridLines.map((f) => (
        <line key={f} x1={padX} x2={w - padX} y1={padTop + plotH * f} y2={padTop + plotH * f} stroke="var(--bm-border)" strokeWidth={1} opacity={0.5} />
      ))}

      {/* Day labels — which day is which, absent before */}
      {points.map((p, i) => (
        <text key={p.date} x={x(i)} y={h - 6} textAnchor="middle" fontFamily="'Inter', sans-serif" fontSize={9} fill="var(--bm-text4)">
          {dayLabel(p.date)}
        </text>
      ))}

      {areaPath && <path d={areaPath} fill="url(#ghostRealFill)" stroke="none" />}
      {hasGhost && <path d={ghostPath} fill="none" stroke="var(--bm-text3)" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.8} />}
      <path d={realPath} fill="none" stroke="var(--bm-accent)" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />

      {/* Gap connector — the part that actually answers "how far off pace
          am I", instead of leaving it to be eyeballed between two lines. */}
      {gapIndex !== undefined && gap !== null && gap !== 0 && (
        <g>
          <line
            x1={x(gapIndex)} x2={x(gapIndex)}
            y1={y(points[gapIndex].real as number)} y2={y(points[gapIndex].ghost as number)}
            stroke={gapColor} strokeWidth={1} strokeDasharray="2 2" opacity={0.7}
          />
          <text
            x={Math.min(w - padX - 2, x(gapIndex) + 5)}
            y={(y(points[gapIndex].real as number) + y(points[gapIndex].ghost as number)) / 2 + 3}
            fontFamily="'DM Mono', monospace" fontSize={9.5} fontWeight={700} fill={gapColor}
          >
            {gap > 0 ? `+${gap}` : gap}
          </text>
        </g>
      )}

      {realPoints.map((p) => (
        <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={2.75} fill="var(--bm-accent)" stroke="var(--bm-bg2)" strokeWidth={1.5} />
      ))}

      {/* Endpoint value callouts on the real line — first and last, so the
          shape has numbers attached to it, not just a silhouette. */}
      {realPoints.length > 0 && (
        <text x={x(realPoints[0].i)} y={Math.max(10, y(realPoints[0].v) - 8)} textAnchor="middle" fontFamily="'DM Mono', monospace" fontSize={9.5} fill="var(--bm-text3)">
          {Math.round(realPoints[0].v)}
        </text>
      )}
      {realPoints.length > 1 && (
        <text x={x(realPoints[realPoints.length - 1].i)} y={Math.max(10, y(realPoints[realPoints.length - 1].v) - 8)} textAnchor="middle" fontFamily="'DM Mono', monospace" fontSize={9.5} fontWeight={700} fill="var(--bm-accent)">
          {Math.round(realPoints[realPoints.length - 1].v)}
        </text>
      )}
    </svg>
  );
}

function Ring({ value, size = 88 }: { value: number; size?: number }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const dash = Math.min(1, Math.max(0, value / 100)) * circ;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={8} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bm-accent)" strokeWidth={8}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" style={{ transition: "stroke-dasharray 0.6s ease" }} />
    </svg>
  );
}

function GradeBadge({ g }: { g: GradedDimension }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 4, padding: "10px 12px",
      background: "var(--bm-bg3)", border: "1px solid var(--bm-border)", borderRadius: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: "var(--bm-text3)" }}>{g.label}</span>
        <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 700, color: GRADE_COLOR[g.grade] }}>{g.grade}</span>
      </div>
      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 10.5, color: "var(--bm-text3)", lineHeight: 1.4 }}>{g.basis}</span>
    </div>
  );
}

function confidenceLabel(index: number): { label: string; color: string } {
  if (index >= 75) return { label: "High", color: "var(--bm-green)" };
  if (index >= 50) return { label: "Medium", color: "var(--bm-amber, #d9a441)" };
  return { label: "Low", color: "var(--bm-red)" };
}

/** Best day of the week by completion rate — computed from day_of_week,
 *  which the API already returns but nothing on this card ever rendered.
 *  Requires at least 2 logged actions on a day before it counts, so a
 *  single lucky task doesn't get called out as "your best day". */
function bestDay(dayOfWeek: Record<string, { completed: number; total: number }>): { day: string; rate: number } | null {
  let best: { day: string; rate: number } | null = null;
  for (const [day, { completed, total }] of Object.entries(dayOfWeek)) {
    if (total < 2) continue;
    const rate = Math.round((completed / total) * 100);
    if (!best || rate > best.rate) best = { day, rate };
  }
  return best;
}

export function WeeklyPulseCard() {
  const [data, setData] = useState<WeeklyPulseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeProjectId = useActiveProjectId();

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError("Sign in to see your weekly pulse."); setLoading(false); return; }
      const res = await fetch("/api/ai/weekly-pulse", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ projectId: activeProjectId || undefined }),
      });
      const resBody = await res.json().catch(() => ({}));
      if (!res.ok || !resBody?.ok) { setError("Couldn't load this week's pulse. Try again shortly."); setLoading(false); return; }
      setData(resBody.data);
    } catch {
      setError("Couldn't load this week's pulse. Try again shortly.");
    } finally {
      setLoading(false);
    }
  }, [activeProjectId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
        <div style={{ width: 24, height: 24, border: "2px solid var(--bm-border)", borderTopColor: "var(--bm-accent)", borderRadius: "50%" }} className="animate-spin" />
      </div>
    );
  }
  if (error || !data) {
    return <div style={{ padding: "24px", textAlign: "center", color: "var(--bm-text3)", fontSize: 13 }}>{error ?? "No data yet this week."}</div>;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 1. STORY */}
      <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: "var(--r-lg)", padding: "20px 20px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Sparkles size={14} style={{ color: "var(--bm-text3)" }} />
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.10em", color: "var(--bm-text3)" }}>
            Your week
          </span>
          {data.archetype && (
            <a
              href="/memory"
              style={{
                marginLeft: "auto", fontFamily: "'DM Mono', monospace", fontSize: 10, padding: "3px 10px",
                borderRadius: 999, background: "var(--bm-bg3)", color: "var(--bm-text3)", border: "1px solid var(--bm-border)",
                textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5,
              }}
              title="See what this means →"
            >
              <span>{ARCHETYPE_DISPLAY[data.archetype as FounderArchetype]?.icon ?? ""}</span>
              {ARCHETYPE_DISPLAY[data.archetype as FounderArchetype]?.name ?? data.archetype.replace(/-/g, " ")}
            </a>
          )}
        </div>
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 14.5, lineHeight: 1.6, color: "var(--bm-text)", margin: 0 }}>
          {sanitizeOutput(data.story)}
        </p>
      </div>

      {/* Confidence index — reflections.confidence values were already
          returned as confidence_by_outcome but never surfaced; this is the
          same signal flattened into one founder-facing number. */}
      {data.confidence_index !== null && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: "var(--r-lg)", padding: "12px 18px" }}>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: "var(--bm-text3)" }}>Confidence index</span>
          <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 700, color: "var(--bm-text)" }}>{data.confidence_index}%</span>
          <span
            className="bm-badge"
            style={{
              fontFamily: "'DM Mono', monospace", fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.05em",
              padding: "2px 8px", borderRadius: 999, color: confidenceLabel(data.confidence_index).color,
              background: "var(--bm-bg3)", border: `1px solid ${confidenceLabel(data.confidence_index).color}33`,
            }}
          >
            {confidenceLabel(data.confidence_index).label}
          </span>
          <span style={{ marginLeft: "auto", fontFamily: "'Inter', sans-serif", fontSize: 10.5, color: "var(--bm-text4)" }}>
            From this week&apos;s reflections
          </span>
        </div>
      )}

      {/* 2. EVIDENCE — ghost vs real sparkline, the founder's requested visual */}
      <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: "var(--r-lg)", padding: "16px 18px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12.5, fontWeight: 600, color: "var(--bm-text)" }}>Ghost vs. real</span>
          <div style={{ display: "flex", gap: 12, fontSize: 10.5, color: "var(--bm-text3)", fontFamily: "'Inter', sans-serif" }}>
            <span><span style={{ display: "inline-block", width: 10, height: 2, background: "var(--bm-accent)", marginRight: 4, verticalAlign: "middle" }} />Actual</span>
            {data.weekly_goal && (
              <span><span style={{ display: "inline-block", width: 10, height: 2, borderTop: "1.5px dashed var(--bm-text3)", marginRight: 4, verticalAlign: "middle" }} />Target</span>
            )}
          </div>
        </div>
        <GhostSparkline points={data.sparkline} />
        {(() => {
          const withBoth = [...data.sparkline].reverse().find((p) => p.real !== null && p.ghost !== null);
          if (!withBoth) return null;
          const gap = Math.round((withBoth.real as number) - (withBoth.ghost as number));
          if (gap === 0) return (
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 10.5, color: "var(--bm-text3)", margin: "2px 0 8px" }}>Exactly on pace.</p>
          );
          return (
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 10.5, color: gap > 0 ? "var(--bm-green)" : "var(--bm-red)", margin: "2px 0 8px" }}>
              {gap > 0 ? `${gap} points ahead of target pace.` : `${Math.abs(gap)} points behind target pace.`}
            </p>
          );
        })()}
        {!data.weekly_goal && (
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 10.5, color: "var(--bm-text3)", margin: "4px 0 8px" }}>
            Set a weekly goal on an active project to see the target (ghost) line.
          </p>
        )}
      </div>

      {/* Un-ghosted */}
      {data.un_ghosted.length > 0 && (
        <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: "var(--r-lg)", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Ghost size={13} style={{ color: "var(--bm-text3)" }} />
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12.5, fontWeight: 600, color: "var(--bm-text)" }}>Un-ghosted this week</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {data.un_ghosted.map((item) => (
              <span key={item} className="bm-badge bm-badge-neutral" style={{ fontFamily: "'Inter', sans-serif", fontSize: 11.5 }}>
                {sanitizeOutput(item)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Cognitive matrix — both halves are data the API already computed
          (day_of_week, top_override_reason) but nothing on this card ever
          rendered before. "Verified known" needs 2+ logged actions on the
          best day before it's shown, same as bestDay()'s own guard. */}
      {(bestDay(data.day_of_week) || data.top_override_reason) && (
        <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: "var(--r-lg)", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12.5, fontWeight: 600, color: "var(--bm-text)" }}>Cognitive matrix</span>
          {bestDay(data.day_of_week) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--bm-green)" }}>
                ● Verified known
              </span>
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 12.5, color: "var(--bm-text)", margin: 0, lineHeight: 1.5 }}>
                You get the most done on {bestDay(data.day_of_week)!.day}s ({bestDay(data.day_of_week)!.rate}% completion rate this week).
              </p>
            </div>
          )}
          {data.top_override_reason && (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--bm-amber, #d9a441)" }}>
                ● Active blindspot
              </span>
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 12.5, color: "var(--bm-text)", margin: 0, lineHeight: 1.5 }}>
                Your most common reason for skipped or partial tasks: &ldquo;{sanitizeOutput(data.top_override_reason)}&rdquo;
              </p>
            </div>
          )}
        </div>
      )}

      {/* Recommended directive — derived from whatever real signal is most
          urgent (behind-pace goal > at-risk milestone > recurring skip
          reason). Omitted entirely when none of those apply, rather than
          forcing generic advice onto a good week. */}
      {(() => {
        const goal = data.weekly_goal;
        const atRiskMilestone = data.milestones.find((m) => m.risk === "high" || m.risk === "medium");
        const directive =
          goal && goal.status !== "on_track" && goal.status !== "completed"
            ? `You're behind on "${goal.goal_text}" — ${goal.tasks_done}/${goal.target_tasks} actions done this week. Close the gap today.`
            : atRiskMilestone
              ? `"${atRiskMilestone.title}" is at risk — ${atRiskMilestone.reason}`
              : data.top_override_reason
                ? `Naming your top skip reason is step one. Pick one task today where "${data.top_override_reason}" doesn't get to win.`
                : null;
        if (!directive) return null;
        return (
          <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-accent-bd, var(--bm-border))", borderRadius: "var(--r-lg)", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--bm-accent)" }}>
              Recommended directive
            </span>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13.5, fontWeight: 600, color: "var(--bm-text)", margin: 0, lineHeight: 1.5 }}>
              {sanitizeOutput(directive)}
            </p>
            <a
              href="/today"
              style={{
                alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px",
                borderRadius: "var(--r-md, 10px)", border: "none", background: "var(--bm-accent)", color: "#15130a",
                fontFamily: "'Inter', sans-serif", fontSize: 12.5, fontWeight: 700, textDecoration: "none",
              }}
            >
              Execute /today
            </a>
          </div>
        );
      })()}

      {/* Ghost race: the weekly goal, set from your own history (lib/ghostRace.ts) */}
      {data.ghost_race && <GhostRaceCard race={data.ghost_race} />}

      {/* 3. METRICS */}
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 14, alignItems: "center", background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: "var(--r-lg)", padding: 18 }}>
        <div style={{ position: "relative", width: 88, height: 88 }}>
          <Ring value={data.completion_rate} />
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 700, color: "var(--bm-text)" }}>{data.completion_rate}%</span>
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 9, color: "var(--bm-text3)" }}>done</span>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <Target size={12} style={{ color: "var(--bm-text3)" }} />
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: "var(--bm-text3)" }}>Tasks</span>
            </div>
            <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 700, color: "var(--bm-text)" }}>{data.actions_completed ?? data.tasks_completed}</span>
            <span style={{ display: "block", fontFamily: "'Inter', sans-serif", fontSize: 10.5, color: "var(--bm-text3)", marginTop: 2 }}>
              done on {data.tasks_completed} of {data.tasks_total} {data.tasks_total === 1 ? "day" : "days"}
            </span>
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              {data.momentum_delta !== null && data.momentum_delta < 0
                ? <TrendingDown size={12} style={{ color: "var(--bm-red)" }} />
                : <TrendingUp size={12} style={{ color: "var(--bm-green)" }} />}
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: "var(--bm-text3)" }}>Momentum</span>
            </div>
            <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 700, color: "var(--bm-text)" }}>
              {data.momentum_score}
              {data.momentum_delta !== null && (
                <span style={{ fontSize: 11, marginLeft: 4, color: data.momentum_delta >= 0 ? "var(--bm-green)" : "var(--bm-red)" }}>
                  {data.momentum_delta >= 0 ? "+" : ""}{data.momentum_delta}
                </span>
              )}
            </span>
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <Flame size={12} style={{ color: "var(--bm-text3)" }} />
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: "var(--bm-text3)" }}>Streak</span>
            </div>
            <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 700, color: "var(--bm-text)" }}>{data.streak}d</span>
          </div>
        </div>
      </div>

      {/* Day activity canvas — one unified square, not 7 separate cards.
          Pairs with the ring above: the ring is this week's aggregate,
          this is the per-day breakdown of what actually made it up, with
          each band's depth of color showing how crucial that one action
          was (ACTION_TYPE_WEIGHT — see components/DayActivityCanvas.tsx). */}
      <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: "var(--r-lg)", padding: 18 }}>
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12.5, fontWeight: 600, color: "var(--bm-text)", display: "block", marginBottom: 12 }}>
          This week, by day
        </span>
        <DayActivityCanvas days={data.day_activity} />
      </div>

      {/* Grades */}
      {/* Grades — hidden entirely on a quiet week rather than showing a
          grid of N/A badges, which reads as broken rather than honest. */}
      {data.is_quiet_week ? (
        <p style={{
          fontFamily: "'Inter', sans-serif", fontSize: 11.5, color: "var(--bm-text3)",
          textAlign: "center", padding: "4px 0",
        }}>
          Not enough activity yet to grade this week — check back after a few tasks.
        </p>
      ) : data.grades.some((g) => g.grade !== "N/A") && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
          {data.grades.map((g) => <GradeBadge key={g.label} g={g} />)}
        </div>
      )}

      {/* Milestone pacing */}
      {data.milestones.length > 0 && (
        <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: "var(--r-lg)", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12.5, fontWeight: 600, color: "var(--bm-text)" }}>Milestone pacing</span>
          {data.milestones.map((m) => (
            <div key={m.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, paddingBottom: 8, borderBottom: "1px solid var(--bm-border)" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: RISK_COLOR[m.risk], marginTop: 5, flexShrink: 0 }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: "var(--bm-text)" }}>{m.title}</span>
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: "var(--bm-text3)", lineHeight: 1.4 }}>{m.reason}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 4. SHARE — server-rendered card (app/api/card/week) in three shapes. */}
      <ShareWeekCard projectId={activeProjectId || undefined} />

      {/* Reports stays a separate surface for the exportable/historical
          view (4-week heatmap, CSV/PDF/PNG) — linked here, not merged in,
          so This Week stays a few-seconds read. */}
      <a
        href="/reports"
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 16px",
          color: "var(--bm-text3)", fontFamily: "'Inter', sans-serif", fontSize: 12, textDecoration: "none",
        }}
      >
        View full report &amp; export →
      </a>
    </motion.div>
  );
                                                              }
