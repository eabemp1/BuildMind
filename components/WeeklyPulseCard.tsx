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

import { useEffect, useState, useCallback, type CSSProperties } from "react";
import { useMeasuredWidth } from "@/lib/useMeasuredWidth";
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
  un_ghosted: string[]; avoidance_remaining: string[]; milestones: MilestonePacing[]; archetype: string | null;
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
function GhostSparkline({ points }: { points: SparklinePoint[] }) {
  // Drawn in real pixels (see useMeasuredWidth) so labels never scale up.
  const [wrapRef, measured] = useMeasuredWidth<HTMLDivElement>(300);
  return (
    <div ref={wrapRef} style={{ width: "100%" }}>
      <GhostSparklineSvg points={points} size={{ w: Math.max(240, Math.min(measured, 720)), h: 132 }} />
    </div>
  );
}

function GhostSparklineSvg({ points, size }: { points: SparklinePoint[]; size: { w: number; h: number } }) {
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
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
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
        <text key={p.date} x={x(i)} y={h - 6} textAnchor="middle" fontFamily="'Inter', sans-serif" fontSize={10} fill="var(--bm-text4)">
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
            fontFamily="'DM Mono', monospace" fontSize={10} fontWeight={700} fill={gapColor}
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
        <text x={x(realPoints[0].i)} y={Math.max(10, y(realPoints[0].v) - 8)} textAnchor="middle" fontFamily="'DM Mono', monospace" fontSize={10} fill="var(--bm-text3)">
          {Math.round(realPoints[0].v)}
        </text>
      )}
      {realPoints.length > 1 && (
        <text x={x(realPoints[realPoints.length - 1].i)} y={Math.max(10, y(realPoints[realPoints.length - 1].v) - 8)} textAnchor="middle" fontFamily="'DM Mono', monospace" fontSize={10} fontWeight={700} fill="var(--bm-accent)">
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
      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: "var(--bm-text3)", lineHeight: 1.4 }}>{g.basis}</span>
    </div>
  );
}


const inputStyle: CSSProperties = {
  fontFamily: "'Inter', sans-serif", fontSize: 13, color: "var(--bm-text)", background: "var(--bm-bg3)",
  border: "1px solid var(--bm-border)", borderRadius: 8, padding: "6px 8px", minHeight: 36,
};
const chipStyle: CSSProperties = {
  fontFamily: "'Inter', sans-serif", fontSize: 12, color: "var(--bm-text)", background: "var(--bm-bg3)",
  border: "1px solid var(--bm-border)", borderRadius: 999, padding: "6px 12px", minHeight: 36, cursor: "pointer",
};

function isoDatePlus(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function MilestoneRow({ m, onChanged }: { m: MilestonePacing; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(m.targetDate?.slice(0, 10) ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(date: string | null) {
    setSaving(true); setErr(null);
    try {
      const res = await fetch("/api/milestones/target-date", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ milestone_id: m.id, target_date: date }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) { setErr(json?.error ?? "Couldn't save the deadline."); return; }
      setEditing(false);
      onChanged();
    } catch {
      setErr("Couldn't save the deadline. Check your connection.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, paddingBottom: 8, borderBottom: "1px solid var(--bm-border)" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: RISK_COLOR[m.risk], marginTop: 5, flexShrink: 0 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 }}>
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: "var(--bm-text)" }}>{m.title}</span>
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: "var(--bm-text3)", lineHeight: 1.4 }}>
          {m.targetDate ? `Due ${m.targetDate.slice(0, 10)}. ` : ""}{m.reason}
        </span>
        {!editing ? (
          <button type="button" onClick={() => setEditing(true)} style={{ ...chipStyle, alignSelf: "flex-start", marginTop: 2 }}>
            {m.targetDate ? "Change deadline" : "Set deadline"}
          </button>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 2 }}>
            <input type="date" aria-label={`Deadline for ${m.title}`} value={value} min={isoDatePlus(0)} onChange={(e) => setValue(e.target.value)} style={inputStyle} />
            {[7, 14, 30].map((n) => (
              <button key={n} type="button" style={chipStyle} onClick={() => setValue(isoDatePlus(n))}>+{n} days</button>
            ))}
            <button type="button" disabled={saving || !value} onClick={() => save(value)} style={{ ...chipStyle, background: "var(--bm-accent)", color: "#15130a", fontWeight: 700, opacity: saving || !value ? 0.6 : 1 }}>
              {saving ? "Saving" : "Save deadline"}
            </button>
            {m.targetDate && (
              <button type="button" disabled={saving} style={chipStyle} onClick={() => save(null)}>Remove</button>
            )}
            <button type="button" style={chipStyle} onClick={() => { setEditing(false); setErr(null); }}>Cancel</button>
          </div>
        )}
        {err && <span role="alert" style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: "var(--bm-red)" }}>{err}</span>}
      </div>
    </div>
  );
}

function AvoidanceList({ zones, onChanged }: { zones: string[]; onChanged: () => void }) {
  const [openZone, setOpenZone] = useState<string | null>(null);
  const [evidence, setEvidence] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (zones.length === 0) return null;

  async function face(zone: string) {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/avoidance/resolve", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ zone, evidence }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        const hint = Array.isArray(json?.hints) && json.hints[0] && !String(json?.error ?? "").includes(json.hints[0]) ? ` ${json.hints[0]}` : "";
        setErr(`${json?.error ?? "Couldn't save. Try again."}${hint}`);
        return;
      }
      setOpenZone(null); setEvidence("");
      onChanged();
    } catch {
      setErr("Couldn't save. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: "var(--r-lg)", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: "var(--bm-text)" }}>Still avoiding</span>
      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: "var(--bm-text3)", lineHeight: 1.4 }}>
        Do one real action on an area, then tell us what you did. BuildMind checks it against your activity before it counts toward your Avoidance Resistance grade.
      </span>
      {zones.map((z) => (
        <div key={z} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "var(--bm-text)" }}>{sanitizeOutput(z)}</span>
            {openZone !== z && (
              <button type="button" onClick={() => { setOpenZone(z); setEvidence(""); setErr(null); }} style={chipStyle}>I faced this</button>
            )}
          </div>
          {openZone === z && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <textarea
                value={evidence} onChange={(e) => setEvidence(e.target.value)} rows={3} maxLength={600}
                placeholder="What did you do? A number or a name helps: DM'd 5 founders on LinkedIn, 2 replied."
                style={{ width: "100%", boxSizing: "border-box", background: "var(--bm-bg3)", border: "1px solid var(--bm-border)", borderRadius: 8, padding: 8, fontSize: 13, color: "var(--bm-text)", fontFamily: "inherit", resize: "vertical" }}
              />
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button type="button" style={chipStyle} onClick={() => { setOpenZone(null); setErr(null); }}>Cancel</button>
                <button type="button" disabled={busy || evidence.trim().length < 3} onClick={() => face(z)} style={{ ...chipStyle, opacity: evidence.trim().length < 3 ? 0.6 : 1 }}>
                  {busy ? "Checking" : "Submit evidence"}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
      {err && <span role="alert" style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: "var(--bm-red)" }}>{err}</span>}
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

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
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

  // The one thing to do next: the most urgent real signal, or nothing on a good week.
  const goal = data.weekly_goal;
  const atRiskMilestone = data.milestones.find((m) => m.risk === "high" || m.risk === "medium");
  const directive =
    goal && (data.ghost_race
      ? data.ghost_race.status === "behind" || data.ghost_race.status === "out_of_reach"
      : goal.status !== "on_track" && goal.status !== "completed")
      ? `You're behind on "${goal.goal_text}": ${goal.tasks_done} of ${goal.target_tasks} actions done this week.`
      : atRiskMilestone
        ? `"${atRiskMilestone.title}" is at risk. ${atRiskMilestone.reason}`
        : data.top_override_reason
          ? `You often skip tasks because of "${data.top_override_reason}". Pick one task today where that doesn't win.`
          : null;
  const best = bestDay(data.day_of_week);
  const panel: React.CSSProperties = { background: "var(--bm-bg2)", border: "1px solid var(--bm-border)", borderRadius: "var(--r-lg)", padding: "16px 18px" };
  const numbers: Array<{ label: string; value: string; delta?: number | null }> = [
    { label: "Done", value: `${data.completion_rate}%` },
    { label: "Actions", value: `${data.actions_completed ?? data.tasks_completed}` },
    { label: "Momentum", value: `${data.momentum_score}`, delta: data.momentum_delta },
    { label: "Streak", value: `${data.streak}d` },
  ];
  const arch = data.archetype ? ARCHETYPE_DISPLAY[data.archetype as FounderArchetype] : null;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* The week in one sentence */}
      <section>
        <p style={{ fontFamily: "'Syne', sans-serif", fontSize: "clamp(19px, 5vw, 23px)", lineHeight: 1.4, letterSpacing: "-0.01em", color: "var(--bm-text)", margin: 0 }}>
          {sanitizeOutput(data.story)}
        </p>
        {arch && (
          <a href="/memory" style={{ display: "inline-block", marginTop: 8, fontFamily: "'Inter', sans-serif", fontSize: 12, color: "var(--bm-text3)", textDecoration: "none" }}>
            Your style: {arch.name}
          </a>
        )}
      </section>

      {/* Four numbers */}
      <div className="grid grid-cols-2 sm:grid-cols-4" style={{ ...panel, padding: 0, overflow: "hidden" }}>
        {numbers.map((n, i) => (
          <div key={n.label} style={{ padding: "14px 16px", borderLeft: i % 2 === 1 || i > 0 ? "1px solid var(--bm-border)" : "none", borderTop: i > 1 ? "1px solid var(--bm-border)" : "none" }} className={i === 2 ? "max-sm:[border-left:none]" : i === 3 ? "max-sm:[border-top:1px_solid_var(--bm-border)]" : ""}>
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: "var(--bm-text3)" }}>{n.label}</span>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 700, color: "var(--bm-text)", marginTop: 4 }}>
              {n.value}
              {n.delta != null && n.delta !== 0 && (
                <span style={{ fontSize: 12, marginLeft: 6, color: n.delta > 0 ? "var(--bm-green)" : "var(--bm-red)" }}>{n.delta > 0 ? "+" : ""}{n.delta}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Next step */}
      {directive && (
        <section style={{ ...panel, display: "flex", gap: 14, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: "var(--bm-text)", margin: 0, lineHeight: 1.5, flex: "1 1 240px" }}>{sanitizeOutput(directive)}</p>
          <a href="/today" style={{ display: "inline-flex", alignItems: "center", minHeight: 40, padding: "0 18px", borderRadius: 10, background: "var(--bm-accent)", color: "#15130a", fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
            Open Today
          </a>
        </section>
      )}

      {/* This week against your usual week */}
      {data.ghost_race && <GhostRaceCard race={data.ghost_race} />}

      {/* What was noticed */}
      {(best || data.top_override_reason) && (
        <section style={panel}>
          <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 700, color: "var(--bm-text)", margin: "0 0 8px" }}>What I noticed</h3>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8, fontFamily: "'Inter', sans-serif", fontSize: 14, lineHeight: 1.5, color: "var(--bm-text2)" }}>
            {best && <li>You get the most done on {best.day}s ({best.rate}% of tasks).</li>}
            {data.top_override_reason && <li>Your most common reason for skipping: &ldquo;{sanitizeOutput(data.top_override_reason)}&rdquo;</li>}
          </ul>
        </section>
      )}

      {/* Everything else, one tap away */}
      <details style={{ ...panel, padding: 0 }}>
        <summary style={{ cursor: "pointer", padding: "14px 18px", fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600, color: "var(--bm-text2)" }}>More from this week</summary>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "0 14px 16px" }}>
          <div style={panel}>
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: "var(--bm-text)", display: "block", marginBottom: 12 }}>By day</span>
            <DayActivityCanvas days={data.day_activity} />
          </div>
          {data.un_ghosted.length > 0 && (
            <div style={{ ...panel, display: "grid", gap: 8 }}>
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: "var(--bm-text)" }}>Things you stopped avoiding</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {data.un_ghosted.map((item) => (
                  <span key={item} className="bm-badge bm-badge-neutral" style={{ fontFamily: "'Inter', sans-serif", fontSize: 12 }}>{sanitizeOutput(item)}</span>
                ))}
              </div>
            </div>
          )}
          <AvoidanceList zones={data.avoidance_remaining ?? []} onChanged={() => load(true)} />
          {!data.is_quiet_week && data.grades.some((g) => g.grade !== "N/A") && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
              {data.grades.map((g) => <GradeBadge key={g.label} g={g} />)}
            </div>
          )}
          {data.milestones.length > 0 && (
            <div style={{ ...panel, display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: "var(--bm-text)" }}>Milestone deadlines</span>
              {data.milestones.map((m) => <MilestoneRow key={m.id} m={m} onChanged={() => load(true)} />)}
            </div>
          )}
          <ShareWeekCard projectId={activeProjectId || undefined} />
          <a href="/reports" style={{ textAlign: "center", color: "var(--bm-text3)", fontFamily: "'Inter', sans-serif", fontSize: 12, textDecoration: "none" }}>
            Full report and export
          </a>
        </div>
      </details>
    </motion.div>
  );
            }
